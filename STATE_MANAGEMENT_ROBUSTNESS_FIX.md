# State Management Robustness Improvements

## Overview

Complete rewrite of state management in both `useOnlineSantorini` and `useLocalSantorini` hooks to fix critical issues causing board update failures and unexpected moves.

## Problems Fixed

### 1. **Stale Closure Bug** (CRITICAL)
**Problem:** The `onCellClick` callback captured the `engine` state variable in its closure, but the sync effect updated `engineRef.current`. This created two different versions of the game state:
- `engine` (stale, from closure)
- `engineRef.current` (fresh, from sync)

**Result:** Moves were applied to stale state, causing board desync and invalid moves.

**Fix:** Removed the `engine` state variable entirely. Now `engineRef` is the **single source of truth**, with an `engineVersion` counter that triggers React re-renders.

### 2. **Race Conditions** (HIGH PRIORITY)
**Problem:** Multiple `setState` calls (`setEngine`, `setBoard`, `setSelectable`) weren't batched, causing intermediate renders with inconsistent state. The board could be from the old engine while selectable was from the new engine.

**Fix:** Created atomic `updateEngineState` helper that:
- Updates `engineRef.current`
- Derives board and selectable from the new engine
- Batches all state updates together
- Increments `engineVersion` to trigger single re-render

### 3. **Missing Sync Guards** (HIGH PRIORITY)
**Problem:** Users could click during state synchronization, applying moves to partially-synced state.

**Fix:** Added `syncInProgressRef` flag:
- Set to `true` at start of sync
- Set to `false` when sync completes
- `onCellClick` checks this flag and blocks moves during sync
- Shows user-friendly "Please wait - syncing game state" message

### 4. **State vs Ref Confusion** (MEDIUM PRIORITY)
**Problem:** Having both `engine` state and `engineRef` created confusion about which to use, leading to bugs.

**Fix:** Clear separation:
- `engineRef.current` = source of truth for game logic
- `engineVersion` = triggers React re-renders
- `board`/`selectable` = derived state for rendering

## Implementation Details

### Before (Broken Pattern)
```typescript
// Multiple sources of truth
const [engine, setEngine] = useState(...);
const engineRef = useRef(engine);

// Stale closure
const onCellClick = useCallback((y, x) => {
  // Uses old 'engine' from closure!
  const validMoves = engine.getValidMoves();
  // ...
}, [engine]); // Recreates callback on every engine change

// Uncoordinated state updates
setEngine(newEngine);
setBoard(engineToBoard(newEngine.snapshot));
setSelectable(computeSelectable(...)); // 3 separate renders!
```

### After (Robust Pattern)
```typescript
// Single source of truth
const engineRef = useRef(SantoriniEngine.createInitial().engine);
const [engineVersion, setEngineVersion] = useState(0);

// Atomic update helper
const updateEngineState = useCallback((newEngine, myTurn) => {
  engineRef.current = newEngine;
  const newBoard = engineToBoard(newEngine.snapshot);
  const newSelectable = computeSelectable(...);
  
  // Batched updates - single render
  setBoard(newBoard);
  setSelectable(newSelectable);
  setEngineVersion(v => v + 1);
}, []);

// Always fresh state
const onCellClick = useCallback((y, x) => {
  // Always uses latest engine!
  const engine = engineRef.current;
  const validMoves = engine.getValidMoves();
  // ...
  updateEngineState(newEngine, myTurn); // Atomic update
}, [updateEngineState]); // Stable dependency
```

## Changes to useOnlineSantorini

### State Management
- ✅ Removed `engine` state variable
- ✅ Added `engineVersion` counter for re-renders
- ✅ Added `syncInProgressRef` guard
- ✅ Created `updateEngineState` helper

### Sync Logic
- ✅ Added sync guards at start/end
- ✅ Atomic state updates in fast path
- ✅ Atomic state updates in full sync path
- ✅ Clear `syncInProgressRef` on all exit paths

### Click Handler
- ✅ Check `syncInProgressRef` before processing
- ✅ Always use `engineRef.current` for game state
- ✅ Use `updateEngineState` for atomic updates
- ✅ Stable callback dependencies

### Memos
- ✅ `currentTurn` depends on `engineVersion`, reads from `engineRef.current`
- ✅ Game completion detection uses `engineRef.current`

## Changes to useLocalSantorini

### State Management
- ✅ Removed `engine` state variable
- ✅ Added `engineVersion` counter
- ✅ Created `updateEngineState` helper

### Operations
- ✅ `initialize` uses atomic update
- ✅ `onCellClick` uses `engineRef.current` and atomic updates
- ✅ `undo` uses atomic update
- ✅ `redo` uses `engineRef.current` and atomic update

## Testing Checklist

### Online Play
- [x] ✅ Build succeeds without errors
- [ ] Board updates immediately after opponent moves
- [ ] No double-moves possible
- [ ] No stale state warnings in console
- [ ] Sync message appears briefly during updates
- [ ] Fast path optimization still works

### Local Play
- [ ] Board updates immediately after each move
- [ ] Undo/Redo work correctly
- [ ] No duplicate moves possible
- [ ] Game completes correctly

## Performance Impact

**Positive:**
- ✅ Reduced re-renders (batched state updates)
- ✅ Stable callback dependencies (fewer recreations)
- ✅ Fast path still optimized for optimistic updates

**Neutral:**
- No change to sync speed or network calls
- Same memory usage pattern

## Migration Notes

**Breaking Changes:** None - external API is identical

**Internal Changes:**
- All code using `engine` state must now use `engineRef.current`
- All state updates must go through `updateEngineState`
- All effects depending on engine must depend on `engineVersion`

## Key Principles

1. **Single Source of Truth:** `engineRef.current` is always the authoritative game state
2. **Atomic Updates:** Never update engine without updating derived state
3. **Guard Critical Sections:** Block user input during state transitions
4. **Fresh References:** Always read from ref in callbacks, never capture in closure
5. **Batched Rendering:** Update all related state together for consistent renders

## Root Cause Analysis

The original code had a **fundamental architecture flaw**: mixing React state (`engine`) with ref-based updates (`engineRef`). This created a situation where:

1. Sync updates `engineRef.current` (fast, synchronous)
2. Sync schedules `setEngine(newEngine)` (async, batched by React)
3. User clicks before React processes the setState
4. `onCellClick` closure has old `engine` value
5. Move applied to wrong state → desync!

The fix ensures game logic **always** uses `engineRef.current` while React state is **only** for triggering re-renders.

## Future Improvements

Consider:
- Add state version checking in assertions
- Add performance monitoring for sync times
- Consider using React 18's `startTransition` for non-urgent updates
- Add state machine for explicit sync states (IDLE, SYNCING, SYNCED)

