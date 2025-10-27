# Move Submission Bug Fix - Placement at (0,0) Not Syncing

## Critical Bug Found

**File:** `web/src/hooks/useOnlineSantorini.ts` line 458  
**Severity:** HIGH - Breaks online play during placement phase

## The Problem

### Symptom
Moves are not being submitted to the server, especially during the placement phase at position (0,0).

### Root Cause
Classic JavaScript **falsy value bug** in the move submission effect:

```typescript
// ❌ BUGGY CODE (line 458)
const moveAction = pending.moveAction;
if (!moveAction) {  // BUG: 0 is falsy!
  pendingLocalMoveRef.current = null;
  return;
}
```

### Why This Breaks

1. Player clicks on board position (0,0) during placement
2. `placementAction = y * 5 + x = 0 * 5 + 0 = 0`
3. Move gets stored: `pendingLocalMoveRef.current = { ..., moveAction: 0 }`
4. Submission effect runs and checks `if (!moveAction)`
5. Since `0` is **falsy** in JavaScript, the condition is `true`
6. Function returns early without submitting move
7. **Move never sent to server!**

### Impact

This bug affects:
- ✅ **Placement at (0,0)** - First cell, top-left corner
- ✅ **Any move index 0** in game phase (rare but possible)
- ❌ Placement at other positions work fine (1-24)
- ❌ Most game phase moves work fine (move 0 is extremely rare)

This is why the bug manifests primarily during placement phase, and specifically when a player tries to place their first worker in the top-left corner.

## The Fix

### Before (Buggy)
```typescript
const moveAction = pending.moveAction;
if (!moveAction) {  // ❌ Rejects 0!
  pendingLocalMoveRef.current = null;
  return;
}
```

### After (Fixed)
```typescript
const moveAction = pending.moveAction;
if (moveAction === undefined || moveAction === null) {  // ✅ Only rejects undefined/null
  console.warn('useOnlineSantorini: Pending move has no moveAction', pending);
  pendingLocalMoveRef.current = null;
  return;
}
```

## Why This Fix Works

JavaScript falsy values include:
- `false`
- `0` ⚠️ 
- `""` (empty string)
- `null`
- `undefined`
- `NaN`

The old check `if (!moveAction)` rejected **all** of these, including valid move index `0`.

The new check explicitly tests for `undefined` and `null`, which are the only truly invalid values for `moveAction`. This allows `0` to pass through as a valid move.

## Verification

### Server-Side Validation
The server correctly accepts move index 0:

```typescript
// supabase/functions/submit-move/index.ts line 91
if (!Number.isInteger(payload.action.move) || payload.action.move < 0) {
  return jsonResponse({ error: 'Move must be a non-negative integer' }, { status: 400 });
}
```

✅ This checks `>= 0`, so move 0 is valid server-side.

### Client-Side Type Checks
All type checks use `typeof action.move === 'number'`:

```typescript
// Line 269, 337
if (isSantoriniMoveAction(action) && typeof action.move === 'number') {
  // Process move
}
```

✅ This correctly accepts 0 as a number.

### Broadcast Handling
```typescript
// useMatchLobby.ts line 533
if (!broadcastMove || typeof broadcastMove.move_index !== 'number') {
  console.warn('Invalid move payload', payload);
  return;
}
```

✅ This correctly accepts 0 as a number.

## Testing

### Test Case 1: Placement at (0,0)
1. Start online match
2. Creator places first worker at top-left (0,0)
3. ✅ **Expected:** Move submits and opponent sees it
4. ❌ **Before fix:** Move never submitted, opponent doesn't see it

### Test Case 2: Placement at (1,0) 
1. Player places worker at row 1, col 0
2. `moveAction = 1 * 5 + 0 = 5`
3. ✅ Works before and after fix (5 is truthy)

### Test Case 3: Placement at (0,1)
1. Player places worker at row 0, col 1  
2. `moveAction = 0 * 5 + 1 = 1`
3. ✅ Works before and after fix (1 is truthy)

## Related Code

### Where moveAction is Set
```typescript
// Line 596 - Placement phase
pendingLocalMoveRef.current = { 
  expectedHistoryLength: 0,
  expectedMoveIndex: nextMoveIndex,
  moveAction: placementAction,  // Can be 0!
};

// Line 652 - Game phase
pendingLocalMoveRef.current = {
  expectedHistoryLength: 0,
  expectedMoveIndex: nextMoveIndex,
  moveAction: action,  // Can be 0!
};
```

### Where moveAction is Read
```typescript
// Line 457-462 - FIXED
const moveAction = pending.moveAction;
if (moveAction === undefined || moveAction === null) {
  console.warn('useOnlineSantorini: Pending move has no moveAction', pending);
  pendingLocalMoveRef.current = null;
  return;
}
```

## Lessons Learned

### JavaScript Gotcha: Falsy Values
When validating numeric values that can be `0`:

❌ **Bad:**
```typescript
if (!value) { /* reject */ }
if (value) { /* accept */ }
```

✅ **Good:**
```typescript
if (value === undefined || value === null) { /* reject */ }
if (value !== undefined && value !== null) { /* accept */ }
if (typeof value === 'number') { /* accept numbers including 0 */ }
```

### Best Practices
1. Use explicit `=== undefined` checks for optional values
2. Use `typeof x === 'number'` for numeric validation
3. Be careful with 0, empty string, false - they're valid values!
4. Add logging when rejecting values to help debug

## Build Status

✅ Build succeeds without errors  
✅ TypeScript compilation passes  
✅ No linter errors

## Deployment

This is a **critical fix** that should be deployed immediately. The bug affects all online games and prevents players from placing workers at position (0,0).

Priority: **P0 - Critical**

