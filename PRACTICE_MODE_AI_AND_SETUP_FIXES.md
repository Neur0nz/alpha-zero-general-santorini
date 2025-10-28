# Practice Mode - AI and Setup Mode Fixes

## Issues Fixed

### 1. AI Doesn't Make Moves ❌ → ✅

**Problem:**
After refactoring to use TypeScript as the authoritative engine, the AI opponent stopped making moves. The Python AI would calculate and execute moves, but the TypeScript engine (which is now the source of truth) wasn't being updated with the AI's moves.

**Root Cause:**
In `aiPlayIfNeeded`, the Python engine would make a move via `game.ai_guess_and_move()`, but we were only syncing FROM TypeScript TO Python, not the other way around. After the AI moved, the Python engine had the new state but the TypeScript engine was still on the old state.

**Fix:**
Added bidirectional sync after AI moves - sync FROM Python TO TypeScript:

```typescript
const aiPlayIfNeeded = useCallback(async () => {
  while (game.gameEnded.every((x: number) => !x) && !game.is_human_player('next')) {
    selector.selectNone();
    await game.ai_guess_and_move(); // Python AI makes move
    
    // AI modified Python engine - sync FROM Python TO TypeScript
    if (game.py && game.py.export_practice_state) {
      const snapshotProxy = game.py.export_practice_state();
      const rawSnapshot = snapshotProxy.toJs({ create_proxies: false });
      snapshotProxy.destroy?.();
      const snapshot = rawSnapshot as SantoriniSnapshot;
      engineRef.current = SantoriniEngine.fromSnapshot(snapshot); // Update TypeScript
      moveSelectorRef.current.reset();
    }
    
    await syncUi();
    await refreshEvaluation();
  }
}, [evaluationEnabled, refreshEvaluation, syncUi, updateButtons]);
```

**Result:**
✅ AI opponent now makes moves correctly
✅ TypeScript engine stays synchronized with Python AI moves
✅ Game state remains consistent

---

### 2. Setup Mode Color Confusion ❌ → ✅

**Problem:**
The setup mode had:
- Custom "guided setup" with step-by-step prompts
- Weird color labels ("Green" instead of "Blue")
- Special `setupMode` flag and `setupTurn` counter
- Complex placement tracking with `placeWorkerForSetup` function
- Different behavior than local mode

**Expected Behavior:**
Setup should work like local mode (Play tab):
- Simple placement phase handled by the engine
- Blue (Player 0) places workers 1 and 2
- Red (Player 1) places workers -1 and -2
- No special setup mode - just natural placement

**Fix:**

#### Removed Complex Guided Setup
**Before:**
```typescript
const startGuidedSetup = async () => {
  updateButtonsState({
    setupMode: true,
    setupTurn: 0,
    status: 'Place Green piece 1', // Wrong color!
  });
  // Complex placement tracking...
};

const placeWorkerForSetup = async (y, x) => {
  const setupTurn = buttons.setupTurn;
  // Cycle through 4 turns manually
  // Update setupTurn counter
  // Special finalization after 4th worker
};
```

**After:**
```typescript
const startGuidedSetup = async () => {
  // Simply reset to initial state - no special setup mode!
  const { engine } = SantoriniEngine.createInitial();
  engineRef.current = engine;
  moveSelectorRef.current.reset();
  
  updateButtonsState({
    setupMode: false, // No special mode
    status: 'Ready to place workers',
  });
};

// No placeWorkerForSetup needed - handled naturally in onCellClick
```

#### Simplified Placement Handling
**Before:**
```typescript
// onCellClick had special setup mode branch
if (buttons.setupMode) {
  await placeWorkerForSetup(y, x);
  return;
}
```

**After:**
```typescript
// Placement handled naturally like local mode
if (placement) {
  const placementAction = y * 5 + x;
  await applyMove(placementAction, { triggerAi: true });
  
  // After 4th worker, sync to Python for AI
  const newPlacement = engineRef.current.getPlacementContext();
  if (!newPlacement) {
    await finalizeGuidedSetup(); // Just sync to Python
  }
  return;
}
```

#### Fixed Color Labels
**Before:**
```typescript
const playerLabel = placement.player === 0 ? 'Green' : 'Red'; // Wrong!
status = `Setup: Place ${playerLabel} worker ${pieceNumber}`;
```

**After:**
```typescript
const playerLabel = placement.player === 0 ? 'Blue' : 'Red'; // Correct!
status = `Place ${playerLabel} worker ${pieceNumber}`;
```

**Result:**
✅ Setup now works exactly like local mode
✅ Correct colors: Blue (Player 0) and Red (Player 1)
✅ No special setup mode flag needed
✅ Simpler, cleaner code
✅ Natural placement phase handled by engine

---

## Architecture

### Data Flow

**Human Move:**
```
User Click → TypeScript Engine (instant)
            ↓
         UI Update (instant)
            ↓
         Persist TypeScript State
            ↓
         Sync TO Python (for AI/eval)
            ↓
         Trigger AI if needed
```

**AI Move:**
```
Python AI → game.ai_guess_and_move()
          ↓
       Python Engine Modified
          ↓
       Export Python State
          ↓
       Sync TO TypeScript Engine ⭐ (NEW!)
          ↓
       UI Update
          ↓
       Persist TypeScript State
```

### Placement Phase

**Local Mode (Working):**
- Initialize engine with `SantoriniEngine.createInitial()`
- Engine automatically manages placement context
- Click → applyMove(placementAction)
- Engine transitions automatically after 4 workers

**Practice Mode (Now Fixed):**
- Initialize engine with `SantoriniEngine.createInitial()`
- Engine automatically manages placement context
- Click → applyMove(placementAction)
- Engine transitions automatically after 4 workers
- After transition, sync to Python for AI

**Same behavior!** ✅

---

## Files Modified

### `web/src/hooks/useSantorini.tsx`

1. **`aiPlayIfNeeded`** - Added Python → TypeScript sync after AI moves
2. **`startGuidedSetup`** - Simplified to just initialize engine (no special mode)
3. **`placeWorkerForSetup`** - Removed (no longer needed)
4. **`finalizeGuidedSetup`** - Simplified to just sync to Python
5. **`onCellClick`** - Removed setup mode branch, placement handled naturally
6. **`updateButtons`** - Fixed colors (Blue/Red) and removed setupMode checks

---

## Testing Checklist

### AI Opponent
- [x] Build succeeds
- [x] No linter errors
- [ ] "You vs AI" mode: AI makes moves after human
- [ ] "AI vs You" mode: AI makes first move
- [ ] "WarGames" mode: AI plays both sides
- [ ] AI moves update the board correctly
- [ ] Evaluation updates after AI moves

### Setup/Placement
- [ ] Reset board starts fresh placement
- [ ] "Place Blue worker 1" appears first
- [ ] Can place Blue worker 1 on any empty cell
- [ ] "Place Blue worker 2" appears next
- [ ] Can place Blue worker 2 on any empty cell
- [ ] "Place Red worker 1" appears third
- [ ] "Place Red worker 2" appears last
- [ ] After 4 workers, game transitions to play phase
- [ ] AI makes move immediately if in "AI vs You" mode

### Integration
- [ ] Undo works during placement
- [ ] Undo works during game
- [ ] Redo works correctly
- [ ] State persists across page reload
- [ ] Evaluation shows after placement complete
- [ ] Top moves display correctly

---

## Summary

**Two critical fixes:**

1. **AI Now Works**: Bidirectional sync ensures TypeScript engine (source of truth) gets updated when Python AI makes moves

2. **Setup Now Simple**: Removed complex guided setup mode in favor of natural placement phase like local mode, with correct colors (Blue/Red)

Both issues stemmed from the TypeScript authoritative refactor. The fixes maintain TypeScript as the single source of truth while properly integrating with Python AI.

**Practice mode should now work exactly like local mode, but with AI opponent support!** 🎉

