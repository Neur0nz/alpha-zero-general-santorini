# Piece Placement Bug - Moves Not Syncing

## Issue Description

**User Report:**
- Created a game and joined as first player
- Tried to place pieces (initial worker placement)
- **Other player doesn't see the pieces placed**
- Toast message: "Please wait - syncing game state"

## Root Cause

The issue occurs when a player joins/creates a match while the Python game engine is still loading in the background:

### Timeline:
1. User creates/joins match → Match data loads from server
2. Python engine (Pyodide) is still loading → `base.loading = true`
3. State sync effect checks `if (!match || base.loading)` → **Exits early, doesn't sync**
4. `lastSyncedStateRef.current` **never gets updated** with the match ID
5. User tries to place piece → Calls `onCellClick(y, x)`
6. Check: `if (lastSynced.matchId !== match.id)` → **FAILS** (null !== actual_match_id)
7. Toast: "Please wait - syncing game state" → **Move is blocked**
8. Python engine finishes loading → `base.loading = false`
9. **But state sync doesn't re-run** because moves.length hasn't changed
10. User is stuck - can't make moves even though engine is ready

### Code Location

**File:** `web/src/hooks/useOnlineSantorini.ts`

**Problem Effect (lines 161-169):**
```typescript
useEffect(() => {
  if (!match || base.loading) {
    if (!match) {
      lastSyncedStateRef.current = { matchId: null, snapshotMoveIndex: -1, appliedMoveCount: 0 };
    }
    return; // ← Returns early when engine loading, doesn't initialize lastSyncedStateRef
  }
  // ... sync logic never runs while loading
}, [base.applyMove, base.importState, base.loading, clockEnabled, match, moves]);
```

**Move Blocking Check (lines 403-413):**
```typescript
const lastSynced = lastSyncedStateRef.current;
if (lastSynced.matchId !== match.id || lastSynced.appliedMoveCount !== moves.length) {
  console.log('useOnlineSantorini: Cannot make move - state not synced', {
    lastSynced,        // { matchId: null, snapshotMoveIndex: -1, appliedMoveCount: 0 }
    currentMatchId: match.id,  // "actual-uuid-here"
    currentMovesLength: moves.length,  // 0
    engineLoading: base.loading  // false (finished loading, but sync never ran)
  });
  toast({ title: 'Please wait - syncing game state', status: 'info' });
  return; // ← Move is blocked
}
```

## Debug Steps

### Check Console Logs

With the added logging, you should see:

**While engine loading:**
```
useOnlineSantorini: Waiting for engine to load before syncing match <uuid>
```

**When trying to place piece:**
```
useOnlineSantorini: Cannot make move - state not synced
{
  lastSynced: { matchId: null, snapshotMoveIndex: -1, appliedMoveCount: 0 },
  currentMatchId: "actual-uuid",
  currentMovesLength: 0,
  engineLoading: false  ← Engine is ready but sync never happened!
}
```

## Solution

The fix needs to ensure state sync runs when:
1. ✅ Match changes (already works)
2. ✅ Moves change (already works)
3. **❌ Engine finishes loading** ← Missing dependency!

### Proposed Fix

Add `base.loading` to the dependency array AND adjust the logic:

```typescript
useEffect(() => {
  if (!match) {
    lastSyncedStateRef.current = { matchId: null, snapshotMoveIndex: -1, appliedMoveCount: 0 };
    return;
  }
  
  // If engine is still loading, wait
  if (base.loading) {
    console.log('useOnlineSantorini: Waiting for engine to load before syncing match', match.id);
    return;
  }

  const lastSynced = lastSyncedStateRef.current;
  
  // Check if we need to resync (match changed, moves changed, OR engine just finished loading)
  const needsResync = 
    lastSynced.matchId !== match.id || 
    lastSynced.appliedMoveCount !== moves.length;
  
  if (!needsResync) {
    return;
  }
  
  // ... rest of sync logic
}, [base.applyMove, base.importState, base.loading, clockEnabled, match, moves]);
//                                    ^^^^^^^^^^^^^ This dependency ensures effect re-runs when loading completes
```

**How it fixes the issue:**
- When `base.loading` changes from `true` → `false`, the effect re-runs
- This time the match exists AND loading is false
- `needsResync` is true because `lastSynced.matchId !== match.id`
- State sync runs, sets `lastSyncedStateRef.current = { matchId: match.id, ... }`
- User can now make moves!

## Current Status

✅ **Debug logging added** - Will help diagnose the issue  
🔄 **Fix pending** - Need to verify dependency behavior  

## Testing Plan

1. **Clear browser cache** to force full reload
2. **Open Play tab** → Engine starts loading
3. **Quickly create/join match** while "Loading game engine..." is shown
4. **Wait for engine to finish**
5. **Try to place piece**

**Expected (with fix):**
- Console: "Waiting for engine to load..."
- Console: "Syncing state { matchId: <uuid>, movesCount: 0 }"
- Console: "State sync complete"
- Piece placement works ✅

**Actual (current bug):**
- Console: "Waiting for engine to load..."
- No sync log
- Console: "Cannot make move - state not synced"
- Toast: "Please wait - syncing game state"
- Piece placement blocked ❌

## Workaround

Until fixed, users can:
1. Navigate to Play tab
2. **Wait for "Ready to play!" status**
3. Only then create/join a match
4. Moves should work normally

This ensures the engine is loaded before the match state exists.

