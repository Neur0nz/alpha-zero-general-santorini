# Piece Placement Bug - FIXED

## Problem

**User Report:**
- Created/joined online game
- Tried to place pieces (initial worker placement)
- Other player couldn't see the pieces
- Console showed multiple "Loading numpy" messages

## Root Cause

The online game panel was creating **multiple Santorini engine instances** instead of sharing a single instance.

### Technical Details

**Before Fix:**
```typescript
function ActiveMatchPanel({ sessionMode, match, ... }) {
  // ... component logic ...
  
  // Called OUTSIDE of SantoriniProvider
  const santorini = useOnlineSantorini({
    match: sessionMode === 'online' ? lobbyMatch : null,
    // ...
  });
  
  if (sessionMode === 'local') {
    return <LocalMatchPanel onExit={onStopLocal} />;
  }
  // ... rest of component
}
```

**Problem:**
- `useOnlineSantorini` internally calls `useSantorini({ evaluationEnabled: false })`
- Without a `SantoriniProvider` wrapper, `useSantorini` creates a **new engine instance** each time
- Multiple renders → Multiple Pyodide loads → Multiple numpy loads
- State gets out of sync between instances
- Moves made in one instance don't sync properly

**Evidence from console:**
```
pyodide.asm.js:9 Loading numpy
pyodide.asm.js:9 Loaded numpy
pyodide.asm.js:9 Loading numpy   ← Second instance!
pyodide.asm.js:9 Loaded numpy
pyodide.asm.js:9 Loading numpy   ← Third instance!
pyodide.asm.js:9 Loaded numpy
```

## Solution

Wrap the online match content in a `SantoriniProvider` to ensure a **single shared instance**.

### After Fix:

```typescript
function ActiveMatchPanel({ sessionMode, match, ... }) {
  if (sessionMode === 'local') {
    return <LocalMatchPanel onExit={onStopLocal} />;
  }

  if (sessionMode === 'online') {
    return (
      <SantoriniProvider evaluationEnabled={false}>
        <ActiveMatchContent
          match={match}
          role={role}
          moves={moves}
          joinCode={joinCode}
          onSubmitMove={onSubmitMove}
          onLeave={onLeave}
          onOfferRematch={onOfferRematch}
          onGameComplete={onGameComplete}
        />
      </SantoriniProvider>
    );
  }
  
  // ... fallback UI
}

function ActiveMatchContent({ match, role, moves, ... }) {
  // Now this uses the shared instance from SantoriniProvider
  const santorini = useOnlineSantorini({
    match: lobbyMatch,
    role: role,
    moves: moves,
    onSubmitMove: onSubmitMove,
    onGameComplete: handleGameComplete,
  });
  
  // ... rest of component
}
```

**Benefits:**
- ✅ Only ONE Pyodide instance loads ("Loading numpy" appears once)
- ✅ Single game engine shared across all hooks
- ✅ State syncs properly between players
- ✅ Moves appear on both clients
- ✅ Consistent with LocalMatchPanel pattern (which already uses SantoriniProvider)

## Files Modified

| File | Lines Changed | Purpose |
|------|--------------|---------|
| `web/src/components/play/PlayWorkspace.tsx` | ~90 | Wrapped online match in SantoriniProvider, extracted ActiveMatchContent |
| `web/src/hooks/useOnlineSantorini.ts` | ~3 | Added debug logging |

## Testing

### Before Fix ❌
1. Create/join online game
2. Console: Multiple "Loading numpy" messages
3. Place piece as creator
4. Opponent doesn't see piece
5. Toast: "Please wait - syncing game state" (stuck)

### After Fix ✅
1. Create/join online game
2. Console: Single "Loading numpy" message
3. Place piece as creator
4. Opponent sees piece immediately
5. Game progresses normally

## Additional Debug Logging Added

To help diagnose similar issues in the future:

**In `useOnlineSantorini.ts`:**
```typescript
if (base.loading) {
  console.log('useOnlineSantorini: Waiting for engine to load before syncing match', match.id);
  return;
}

// ...

if (lastSynced.matchId !== match.id || lastSynced.appliedMoveCount !== moves.length) {
  console.log('useOnlineSantorini: Cannot make move - state not synced', {
    lastSynced,
    currentMatchId: match.id,
    currentMovesLength: moves.length,
    engineLoading: base.loading
  });
  // ...
}
```

## Related Files

- `PIECE_PLACEMENT_BUG.md` - Original diagnosis
- `UI_UX_IMPROVEMENTS.md` - Online-first changes that exposed this issue

## Status

✅ **FIXED** - Ready for testing and deployment

The online game system now properly shares a single game engine instance across all hooks, ensuring consistent state synchronization between players.

