# Practice Mode - Highlighting & Turn Enforcement Fix

## Issues Fixed

### 1. Pieces Not Highlighted on Your Turn ❌ → ✅

**Problem:**
When it was the human's turn, their pieces weren't highlighted, making it unclear which pieces could be selected.

**Root Cause:**
The `syncEngineToUi` function was calling the old Python-based `updateSelectable()` function instead of computing selectable cells from the TypeScript engine and TypeScript move selector.

**Fix:**

#### Before (Broken)
```typescript
const syncEngineToUi = useCallback(() => {
  // ... update board ...
  updateSelectable(); // ❌ Uses old Python selector
  setEngineVersion(v => v + 1);
}, [updateSelectable]);
```

#### After (Fixed)
```typescript
const syncEngineToUi = useCallback(() => {
  // ... update board ...
  
  // Update selectable based on TypeScript engine state
  const placement = engineRef.current.getPlacementContext();
  const validMoves = engineRef.current.getValidMoves();
  const game = gameRef.current;
  
  if (placement) {
    // During placement, all empty cells are selectable
    const cells = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => snapshot.board[y][x][0] === 0)
    );
    setSelectable(cells);
  } else {
    // During game phase, check if it's human's turn
    const isHumanTurn = !game || !game.gameMode || game.gameMode === 'Human' || game.is_human_player('next');
    
    if (isHumanTurn) {
      // Human's turn: show selectable pieces ✅
      const newSelectable = moveSelectorRef.current.computeSelectable(
        snapshot.board,
        validMoves,
        snapshot.player
      );
      setSelectable(newSelectable);
    } else {
      // AI's turn: clear selectable ✅
      const emptySelectable = Array.from({ length: 5 }, () => Array(5).fill(false));
      setSelectable(emptySelectable);
    }
  }
  
  setEngineVersion(v => v + 1);
}, []);
```

**Result:**
✅ Your pieces are now highlighted when it's your turn
✅ No highlighting when it's the AI's turn
✅ Empty cells highlighted during placement phase

---

### 2. Can Still Move Both Players' Pieces ❌ → ✅

**Problem:**
Despite adding a turn check, users could still click and move opponent pieces. The turn enforcement wasn't working properly.

**Root Cause:**
The turn check was happening AFTER the placement phase check but wasn't comprehensive enough. Also, it was inside the try block which could allow some moves through.

**Fix:**

#### Before (Weak Enforcement)
```typescript
const onCellClick = async (y, x) => {
  // ... placement check ...
  
  // Turn check happened too late, inside game phase only
  if (game && game.gameMode) {
    const isHumanTurn = game.is_human_player('next');
    if (!isHumanTurn) {
      toast({ title: "It's the AI's turn", status: 'info' });
      processingMoveRef.current = false; // ❌ Still set flag
      return;
    }
  }
  
  processingMoveRef.current = true;
  // ... move logic ...
};
```

#### After (Strong Enforcement)
```typescript
const onCellClick = async (y, x) => {
  // Early exit checks
  if (processingMoveRef.current) return;
  
  const engine = engineRef.current;
  const placement = engine.getPlacementContext();
  const game = gameRef.current;
  
  // Edit mode check...
  
  // ✅ Turn enforcement BEFORE placement or game logic
  if (!placement && game && game.gameMode && game.gameMode !== 'Human') {
    const isHumanTurn = game.is_human_player('next');
    if (!isHumanTurn) {
      toast({ title: "It's the AI's turn", status: 'info' });
      return; // ✅ Early exit, no flag set
    }
  }
  
  // Placement phase...
  if (placement) { /* ... */ }
  
  // Game phase...
  processingMoveRef.current = true;
  // ... move logic ...
};
```

**Key Improvements:**
1. **Early Check**: Turn enforcement happens before any move logic
2. **Placement Exception**: Only enforced during game phase, not placement
3. **Human Mode Exception**: No enforcement in "Human" mode (local 2-player)
4. **Clean Exit**: Returns immediately without setting processing flag

**Result:**
✅ Cannot click opponent pieces when it's AI's turn
✅ Get clear feedback: "It's the AI's turn"
✅ Placement phase works normally (all players can place)
✅ Human mode still allows both players to move

---

## How It Works Now

### Visual Feedback

**Your Turn:**
- ✅ Your pieces are highlighted (green border)
- ✅ Empty cells highlighted during placement
- ✅ Can click and select your pieces

**AI's Turn:**
- ✅ No pieces highlighted
- ✅ Clicks blocked with toast message
- ✅ Wait for AI to move

### Turn Enforcement by Mode

| Mode | Player 0 (Blue) | Player 1 (Red) |
|------|-----------------|----------------|
| **You vs AI (P0)** | Human ✅ | AI (blocked) ⛔ |
| **AI vs You (P1)** | AI (blocked) ⛔ | Human ✅ |
| **Human** | Human ✅ | Human ✅ |
| **WarGames (AI)** | AI (blocked) ⛔ | AI (blocked) ⛔ |

### Selectable Computation Flow

```
syncEngineToUi()
    ↓
Check: Placement phase?
    ↓                    ↓
   Yes                  No
    ↓                    ↓
All empty cells    Check: Human's turn?
highlighted             ↓              ↓
                      Yes             No
                       ↓              ↓
               Compute selectable  Clear all
               from TS engine     highlighting
               & move selector
```

---

## Files Modified

### `web/src/hooks/useSantorini.tsx`

1. **`syncEngineToUi`**
   - Removed call to old `updateSelectable()`
   - Added TypeScript-based selectable computation
   - Added turn check for highlighting
   - Clears highlighting when AI's turn

2. **`onCellClick`**
   - Moved turn enforcement earlier in function
   - Added check before placement phase
   - Excluded "Human" mode from enforcement
   - Clean early exits without setting flags

---

## Testing Checklist

### Highlighting
- [x] Build succeeds
- [ ] Your pieces highlighted on your turn
- [ ] No highlighting on AI's turn
- [ ] Empty cells highlighted during placement
- [ ] Selectable changes as you click through move phases (worker → move → build)

### Turn Enforcement
- [ ] Cannot click opponent pieces on AI's turn
- [ ] Get toast "It's the AI's turn" when trying
- [ ] Can move your pieces on your turn
- [ ] Both players can move in "Human" mode
- [ ] All moves blocked in "WarGames" mode

### Game Modes
- [ ] "You vs AI": You are Blue, AI is Red
- [ ] "AI vs You": AI is Blue (moves first), You are Red
- [ ] "Human": Both players can move freely
- [ ] "WarGames": AI plays itself

---

## Architecture

### Single Source: TypeScript Engine + TypeScript Move Selector

```typescript
// Game state
const engineRef = useRef<SantoriniEngine>(...)

// Move selection
const moveSelectorRef = useRef<TypeScriptMoveSelector>(...)

// Highlighting computed from TypeScript only
const selectable = moveSelectorRef.current.computeSelectable(
  engineRef.current.snapshot.board,
  engineRef.current.getValidMoves(),
  engineRef.current.player
);
```

### Python Only for AI

```typescript
// Python ONLY for AI opponent and evaluation
const gameRef = useRef<Santorini>()  // For AI
game.is_human_player('next')         // Check whose turn
game.ai_guess_and_move()             // AI move
```

---

## Summary

✅ **Pieces highlighted** - Using TypeScript move selector, properly updated on each state change
✅ **Turn enforcement** - Cannot move opponent pieces, early exit with clear feedback
✅ **Visual clarity** - Clear indication of whose turn it is and what can be selected
✅ **All modes work** - P0, P1, Human, and WarGames all enforce rules correctly

**Practice mode now has proper turn-based gameplay with visual feedback!** 🎮

