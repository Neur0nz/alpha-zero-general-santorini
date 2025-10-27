# Online Architecture Issues

## Issue 1: Why Load Python Engine for Online Matches? 🤔

### Current Architecture (Inefficient)

**What happens now:**
1. Player joins online match
2. Browser loads **full Python engine** (Pyodide + numpy ≈ 200MB)
3. Client imports game snapshots and replays moves locally
4. Client validates moves client-side
5. Client sends validated moves to server
6. Server validates again and persists

**Code Evidence:**
```typescript
// useOnlineSantorini.ts
const base = useSantorini({ evaluationEnabled: false });  // ← Loads full engine!

await base.importState(snapshot);         // ← Calls Python
await base.applyMove(action.move, {...}); // ← Calls Python
await base.onCellClick(y, x);             // ← Calls Python
```

**Why this is inefficient:**
- ❌ Downloads ~200MB of Python runtime for online matches
- ❌ Duplicates game logic (client + server both validate)
- ❌ Slow initial load ("Loading numpy...")
- ❌ Unnecessary computation on client
- ❌ Increases bundle size and memory usage

### What SHOULD Happen (Server-Authoritative)

**Ideal architecture:**
1. Player joins online match
2. Browser only loads **UI rendering code** (lightweight)
3. Client receives board state from server
4. Player clicks → Send coordinates to server
5. Server validates and applies move
6. Server broadcasts new state to both players
7. Clients render the updated board

**Benefits:**
- ✅ No Python download needed for online matches
- ✅ Single source of truth (server)
- ✅ Fast load times
- ✅ Smaller bundle size
- ✅ Better mobile experience

### Why Current Architecture Was Chosen

The hybrid approach exists to provide:
1. **Immediate feedback** - Client knows if a move is valid before server response
2. **Selectable cells** - Client can highlight valid moves
3. **State synchronization** - Replaying moves to catch up
4. **Optimistic UI** - Show move immediately, confirm later

### Recommendation

**Short-term (current):**
- Keep the hybrid approach for now (it works)
- Fix the immediate bugs (duplicate submissions, race conditions)

**Long-term (future refactor):**
Create a lightweight online-only board renderer:
```typescript
interface OnlineBoardRenderer {
  board: BoardCell[][];           // Just rendering state
  selectableCells: boolean[][];   // From server
  renderBoard(): JSX.Element;     
  onClick(y, x): void;            // Send to server, no local validation
}
```

Server response includes:
```typescript
{
  board_state: [...],
  valid_moves: [true, false, ...],  // Pre-computed by server
  next_player: 0,
  game_ended: [0, 0]
}
```

**Estimated savings:**
- ~200MB less download per player
- ~2-3 seconds faster initial load
- ~100MB less memory usage

---

## Issue 2: Duplicate Move Submissions 🐛

### Problem

From the console logs:
```
useOnlineSantorini.ts:357 Submitting move to server {moveIndex: 1, move: 22, by: 'creator'}
useOnlineSantorini.ts:357 Submitting move to server {moveIndex: 1, move: 17, by: 'creator'}
POST .../submit-move 422 (Unprocessable Content)
```

**Both moves trying to use `moveIndex: 1`** → Server rejects the second one

### Root Cause

When placing pieces quickly (e.g., initial worker placement), the race condition is:

1. Click first cell → `onCellClick(y1, x1)`
   - Sets `pendingLocalMoveRef = { expectedMoveIndex: 1 }`
   - Applies move locally
   - Triggers submission effect

2. Click second cell → `onCellClick(y2, x2)` (before first submission completes)
   - Calculates `nextMoveIndex = moves.length` (still 1!)
   - Sets `pendingLocalMoveRef = { expectedMoveIndex: 1 }` ← Same index!
   - Applies move locally
   - Triggers submission effect again

3. Both submissions run in parallel with `moveIndex: 1`
4. Server accepts first, rejects second with 422

### Current Fix Attempt

```typescript
// Calculate the correct move index based on existing moves + pending moves
const pendingCount = pendingLocalMoveRef.current ? 1 : 0;
const nextMoveIndex = moves.length + pendingCount;
```

**Problem with this fix:**
- Only accounts for ONE pending move
- If user clicks twice quickly, still has race condition
- Doesn't prevent the effect from running multiple times

### Proper Fix

Need to prevent overlapping submissions using a submission queue or lock:

```typescript
const submissionLockRef = useRef<boolean>(false);

// In move submission effect:
if (submissionLockRef.current) {
  return; // Another submission in progress
}

submissionLockRef.current = true;

try {
  await onSubmitMove(...);
} finally {
  submissionLockRef.current = false;
}
```

**Alternative: Move index counter**
```typescript
const nextMoveIndexRef = useRef(0);

// In onCellClick:
const nextMoveIndex = nextMoveIndexRef.current;
nextMoveIndexRef.current++;

// After server confirms (in real-time handler):
nextMoveIndexRef.current = moves.length;  // Resync with server
```

---

## Issue 3: Are Updates Being Pushed Correctly? 📡

### Real-time Subscription Status

From logs:
```
useMatchLobby.ts:577 Real-time subscription status {status: 'SUBSCRIBED'}
useMatchLobby.ts:589 Real-time subscription active, refreshing match state
useMatchLobby.ts:540 Real-time move received {eventType: 'INSERT', moveId: '...', moveIndex: 1}
useMatchLobby.ts:561 Adding new move {moveId: '...', moveIndex: 1, totalMoves: 2}
useOnlineSantorini.ts:180 Syncing state {movesCount: 2}
```

**Good news:** ✅ Real-time is working!
- Subscription is active
- Moves are being received
- State is syncing

**But:** The duplicate submission causes confusion because:
1. Player 1 submits move #1 (succeeds)
2. Player 1 submits move #2 with index 1 (fails with 422)
3. Player 1 receives move #1 via real-time
4. Player 2 never sees move #2 (because it failed server-side)

### Testing Real-time

To verify both players see moves:

**Player 1 (Creator):**
1. Place first piece
2. Wait for confirmation
3. Check Player 2's screen

**Player 2 (Opponent):**
1. Should see Player 1's piece appear
2. Console should show: "Real-time move received"
3. Board should update

**Current issue:**
- If Player 1 clicks too fast, second move fails
- Player 2 only sees successfully submitted moves
- Appears like moves aren't syncing (but real-time works, submissions fail)

---

## Summary

| Issue | Status | Priority | Complexity |
|-------|--------|----------|-----------|
| Loading Python for online | 🟡 Inefficient but works | Medium | High (refactor) |
| Duplicate move submissions | 🔴 Broken | **HIGH** | Low (add lock) |
| Real-time subscription | ✅ Working | - | - |

## Next Steps

1. **Immediate:** Fix duplicate submission bug with lock
2. **Short-term:** Add better error handling and retry logic
3. **Long-term:** Consider lightweight online renderer (major refactor)

The real-time system is working correctly - the issue is that rapid clicks cause submission failures, making it *appear* like moves aren't syncing.

