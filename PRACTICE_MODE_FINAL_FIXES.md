# Practice Mode - Final Fixes (AI Movement & Turn Enforcement)

## Issues Fixed

### 1. AI Doesn't Move After Human ❌ → ✅

**Problem:**
- AI wasn't being triggered after human moves
- Game mode wasn't being set on initialization
- After placement completed, AI didn't check if it should move first

**Root Causes:**
1. Game mode defaulted to undefined
2. No AI trigger after placement phase completed
3. Missing AI trigger logic in `finalizeGuidedSetup`

**Fixes:**

#### Set Default Game Mode on Init
```typescript
const initialize = useCallback(async () => {
  // ...
  game.init_game();
  
  // Set default game mode to "You vs AI"
  game.gameMode = 'P0'; // ✅ Now set!
  
  // ...
}, []);
```

#### Trigger AI After Placement
```typescript
const finalizeGuidedSetup = useCallback(async () => {
  await syncPythonFromTypeScript();
  await refreshEvaluation();
  
  // Trigger AI if it should move first
  const game = gameRef.current;
  if (game && game.gameMode) {
    aiPromiseRef.current = aiPlayIfNeeded(); // ✅ Triggers AI!
  }
}, [aiPlayIfNeeded, refreshEvaluation, syncPythonFromTypeScript]);
```

#### Ensure AI Triggers After Placement in Click Handler
```typescript
const onCellClick = async (y, x) => {
  // Placement phase (like local mode)
  if (placement) {
    // ...
    await applyMove(placementAction, { triggerAi: true });
    
    // After 4th worker, sync to Python for AI
    const newPlacement = engineRef.current.getPlacementContext();
    if (!newPlacement) {
      await finalizeGuidedSetup(); // ✅ Triggers AI after placement!
    }
    return;
  }
  // ...
};
```

---

### 2. User Can Move Both Colors ❌ → ✅

**Problem:**
- User could click and move any piece (Blue or Red)
- No enforcement of whose turn it is based on game mode
- Game mode wasn't being checked during move attempts

**Root Cause:**
No validation that it's the human player's turn before allowing moves

**Fix:**

#### Add Turn Check Before Move
```typescript
const onCellClick = async (y, x) => {
  // ...
  
  // Game phase: Check if it's the human's turn
  const game = gameRef.current;
  if (game && game.gameMode) {
    // Check if it's the human player's turn
    const isHumanTurn = game.is_human_player('next');
    if (!isHumanTurn) {
      toast({ title: "It's the AI's turn", status: 'info' }); // ✅ Prevent move!
      return;
    }
  }
  
  // Game phase: Use TypeScript move selector
  // ... (only reached if it's human's turn)
};
```

---

## How It Works Now

### Game Modes

- **P0 (You vs AI)**: Human is Player 0 (Blue), AI is Player 1 (Red)
- **P1 (AI vs You)**: AI is Player 0 (Blue), Human is Player 1 (Red)  
- **Human**: Both players are human (no AI)
- **AI (WarGames)**: Both players are AI

### Flow

#### Initialization
```
1. Load Python/ONNX
2. Initialize game
3. Set game mode to "P0" (default) ✅
4. Restore state OR start guided setup
5. Ready to play!
```

#### Placement Phase (All 4 Workers)
```
1. Click to place Blue worker 1   ← Human places
2. Click to place Blue worker 2   ← Human places
3. Click to place Red worker 1    ← Human places
4. Click to place Red worker 2    ← Human places
5. Finalize: Sync to Python
6. Check if AI should move first  ← AI makes first move if P1 mode
```

#### Game Phase
```
Human Turn:
1. Human clicks worker           ← Allowed if game.is_human_player('next')
2. Selects move destination
3. Selects build location
4. Move applied to TypeScript engine
5. Sync to Python engine
6. Trigger AI if AI's turn

AI Turn:
1. Human clicks anything         ← Blocked with toast "It's the AI's turn"
2. AI calculates move (Python)
3. AI move synced to TypeScript
4. UI updates
5. Back to human's turn
```

---

## Testing Results

### Before ❌
- ✅ Setup works (Blue/Red colors correct)
- ❌ AI doesn't move after human
- ❌ Can move opponent's pieces
- ❌ Game mode not set

### After ✅
- ✅ Setup works (Blue/Red colors correct)
- ✅ AI moves after human moves
- ✅ Cannot move opponent's pieces
- ✅ Game mode properly enforced
- ✅ All modes work: P0, P1, Human, AI

---

## Files Modified

### `web/src/hooks/useSantorini.tsx`

1. **`initialize`** - Added default game mode setting (`game.gameMode = 'P0'`)
2. **`finalizeGuidedSetup`** - Added AI trigger after placement completes
3. **`onCellClick`** - Added turn enforcement check before allowing moves

---

## Architecture Summary

### Single Source of Truth: TypeScript Engine
```typescript
// TypeScript engine is authoritative
const engineRef = useRef<SantoriniEngine>(...)

// Python only for AI/evaluation
const gameRef = useRef<Santorini>() 
```

### Data Flow

**Human Move:**
```
Click → TypeScript Engine (instant)
      ↓
    UI Update
      ↓
    Sync TO Python
      ↓
    Trigger AI if needed → AI modifies Python
                          ↓
                        Sync FROM Python TO TypeScript
                          ↓
                        UI Update
```

**Turn Enforcement:**
```
Click → Check is_human_player('next')
       ↓              ↓
     Yes             No
       ↓              ↓
  Allow Move    Block with toast
```

---

## Summary

✅ **AI now moves** - Game mode set, AI triggered after placement and human moves
✅ **Turn enforcement** - User can only move on their turn based on game mode  
✅ **Setup simplified** - Works like local mode, natural placement phase
✅ **Colors correct** - Blue (Player 0) and Red (Player 1)

**Practice mode is now fully functional!** 🎉

Users can:
- Set up the board naturally (place all 4 workers)
- Play against AI with proper turn enforcement
- Choose game modes from dropdown (You vs AI, AI vs You, etc.)
- See AI make moves automatically after human moves

