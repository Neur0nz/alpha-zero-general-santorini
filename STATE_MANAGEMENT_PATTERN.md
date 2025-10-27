# State Management Pattern Guide

## The Ref-First Pattern for Game State

This document explains the architectural pattern used for robust game state management in the Santorini hooks.

## Core Principle

**Game logic uses refs, React rendering uses state.**

```typescript
// ✅ CORRECT: Ref is source of truth
const engineRef = useRef<Engine>(createInitial());
const [engineVersion, setEngineVersion] = useState(0);

// ❌ WRONG: State as source of truth creates stale closures
const [engine, setEngine] = useState(createInitial());
```

## The Pattern

### 1. State Declaration

```typescript
// Single source of truth for game logic
const engineRef = useRef<SantoriniEngine>(SantoriniEngine.createInitial().engine);

// Version counter to trigger React re-renders
const [engineVersion, setEngineVersion] = useState(0);

// Derived state for rendering
const [board, setBoard] = useState(() => engineToBoard(engineRef.current.snapshot));
const [selectable, setSelectable] = useState(() => computeSelectable(...));
```

### 2. Atomic Update Helper

```typescript
const updateEngineState = useCallback((newEngine: SantoriniEngine, ...) => {
  // 1. Update the ref (synchronous, immediate)
  engineRef.current = newEngine;
  
  // 2. Compute ALL derived state from new engine
  const newBoard = engineToBoard(newEngine.snapshot);
  const newSelectable = computeSelectable(...);
  
  // 3. Batch React state updates (single render)
  setBoard(newBoard);
  setSelectable(newSelectable);
  setEngineVersion(v => v + 1); // Triggers re-render
}, []);
```

### 3. Reading State in Callbacks

```typescript
const onCellClick = useCallback((y: number, x: number) => {
  // ✅ ALWAYS read from ref - guaranteed fresh
  const engine = engineRef.current;
  
  // ❌ NEVER use captured state variable - may be stale
  // const moves = engine.getValidMoves(); // 'engine' from closure!
  
  // Process with fresh state
  const moves = engine.getValidMoves();
  // ...
  
  // Update atomically
  updateEngineState(newEngine, ...);
}, [updateEngineState]); // Stable dependencies
```

### 4. Computed Values

```typescript
// Use engineVersion as dependency, read from ref
const currentPlayer = useMemo(() => {
  return engineRef.current.player;
}, [engineVersion]); // Recomputes when version changes

// ❌ DON'T depend on engine state (creates stale closures)
// const currentPlayer = useMemo(() => engine.player, [engine]);
```

### 5. Effects

```typescript
useEffect(() => {
  // Read from ref for latest value
  const [p0, p1] = engineRef.current.getGameEnded();
  
  if (p0 !== 0 || p1 !== 0) {
    handleGameEnd();
  }
}, [engineVersion]); // Re-run when version changes
```

## Why This Works

### Problem: Stale Closures

```typescript
// BAD PATTERN
const [engine, setEngine] = useState(initialEngine);

const onClick = useCallback(() => {
  // 'engine' captured from closure when callback created
  const move = engine.getValidMoves()[0];
  
  // Later, after setEngine called...
  // This closure STILL has old engine!
}, [engine]); // Recreates callback every time engine changes
```

### Solution: Ref Reading

```typescript
// GOOD PATTERN
const engineRef = useRef(initialEngine);
const [version, setVersion] = useState(0);

const onClick = useCallback(() => {
  // Always reads latest from ref
  const engine = engineRef.current;
  const move = engine.getValidMoves()[0];
  
  // Update ref + version
  engineRef.current = newEngine;
  setVersion(v => v + 1); // Trigger re-render
}, []); // Stable - never recreated!
```

## Rules of Thumb

### DOs ✅

1. **Store game state in refs**
   ```typescript
   const engineRef = useRef(initialEngine);
   ```

2. **Use version counter for re-renders**
   ```typescript
   const [version, setVersion] = useState(0);
   ```

3. **Read from ref in callbacks**
   ```typescript
   const engine = engineRef.current;
   ```

4. **Update atomically**
   ```typescript
   updateEngineState(newEngine); // Does ref + derived + version
   ```

5. **Use version in dependencies**
   ```typescript
   useMemo(() => engineRef.current.player, [version]);
   ```

### DON'Ts ❌

1. **DON'T store mutable game state in useState**
   ```typescript
   const [engine, setEngine] = useState(...); // ❌
   ```

2. **DON'T capture state in closures**
   ```typescript
   const onClick = useCallback(() => {
     engine.getValidMoves(); // ❌ stale!
   }, [engine]);
   ```

3. **DON'T update state separately**
   ```typescript
   // ❌ 3 renders, inconsistent intermediate state
   setEngine(newEngine);
   setBoard(newBoard);
   setSelectable(newSelectable);
   ```

4. **DON'T read ref without version dependency**
   ```typescript
   // ❌ Won't recompute when engine changes!
   const player = useMemo(() => engineRef.current.player, []);
   ```

## Common Pitfalls

### Pitfall 1: Forgetting to Update Version

```typescript
// ❌ BAD
engineRef.current = newEngine;
setBoard(engineToBoard(newEngine.snapshot));
// Forgot setVersion! Components won't re-render!

// ✅ GOOD
updateEngineState(newEngine); // Handles everything
```

### Pitfall 2: Partial State Updates

```typescript
// ❌ BAD - board and selectable out of sync
engineRef.current = newEngine;
setBoard(engineToBoard(newEngine.snapshot));
// Forgot selectable! Highlights will be wrong!

// ✅ GOOD - atomic update
updateEngineState(newEngine); // Updates all derived state
```

### Pitfall 3: Reading Before Sync Complete

```typescript
// ❌ BAD - no guard
const onClick = () => {
  const engine = engineRef.current; // Might be mid-sync!
  applyMove(engine, move);
};

// ✅ GOOD - check sync flag
const onClick = () => {
  if (syncInProgressRef.current) {
    toast({ title: 'Please wait - syncing' });
    return;
  }
  const engine = engineRef.current;
  applyMove(engine, move);
};
```

## When to Use This Pattern

✅ **Use for:**
- Game engines with frequent updates
- State that changes from multiple sources (user, network, AI)
- Complex state with derived values
- State where stale reads cause bugs

❌ **Don't use for:**
- Simple UI state (form inputs, toggles)
- State that only changes from user input
- State without derived values
- Read-only state

## Performance Benefits

1. **Fewer callback recreations** - Stable dependencies
2. **Fewer re-renders** - Batched state updates
3. **No intermediate renders** - Atomic updates prevent inconsistent UI
4. **Predictable updates** - Clear data flow

## Testing This Pattern

```typescript
test('state updates are atomic', () => {
  const { result } = renderHook(() => useGame());
  
  const before = result.current.board;
  
  act(() => {
    result.current.makeMove(0, 0);
  });
  
  // Board should update completely or not at all
  // Never partially updated
  expect(result.current.board).not.toBe(before);
  expect(isBoardValid(result.current.board)).toBe(true);
});

test('callbacks use fresh state', () => {
  const { result } = renderHook(() => useGame());
  
  // Capture callback
  const onClick = result.current.onCellClick;
  
  // Update state
  act(() => {
    result.current.makeMove(0, 0);
  });
  
  // Original callback should still read fresh state!
  // (Not stale closure)
  act(() => {
    onClick(1, 1);
  });
  
  expect(result.current.moves.length).toBe(2);
});
```

## Summary

The ref-first pattern solves React's stale closure problem by:
1. Storing mutable state in refs (always fresh)
2. Using version counter for re-renders (explicit control)
3. Computing derived state atomically (consistency)
4. Reading refs in callbacks (no closures)

This creates robust, predictable state management for complex game logic.

