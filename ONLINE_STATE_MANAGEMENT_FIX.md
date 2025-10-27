# Online Game State Management Fix

## Problems Identified

The online game state management had several critical issues that caused games to desynchronize between players:

### 1. **State Sync Not Replaying Moves**
**Location:** `web/src/hooks/useOnlineSantorini.ts` (lines 151-224)

**Problem:** The hook would import state snapshots from the server but would NOT replay moves that occurred after the snapshot. This meant:
- If Player A made moves 1, 2, 3
- Player B would receive the snapshot after move 2
- Player B would never see move 3 applied to their local game state
- The board would be out of sync

**Fix:** Now the state sync effect:
1. Finds the most recent snapshot
2. Imports that snapshot
3. **Filters and replays all moves that occurred after the snapshot**
4. Updates clock states from all moves

### 2. **Clock Updates vs Game Moves Confusion**
**Location:** `web/src/hooks/useOnlineSantorini.ts` (lines 151-170)

**Problem:** The `appliedMovesRef` counter was only tracking clock updates, not actual game move applications. The code would:
- Update clocks when moves arrived
- But NOT apply the moves to the game state
- Leading to desynchronization where clocks were correct but board state was wrong

**Fix:** Removed the separate clock update effect and integrated it into the main state sync effect that properly applies moves.

### 3. **Race Conditions in Move Submission**
**Location:** `web/src/hooks/useOnlineSantorini.ts` (lines 266-324)

**Problem:** Multiple race conditions:
- Move could be submitted multiple times
- Move could be submitted even if already received via real-time
- No proper check if the move in local history matches the server move
- `pendingLocalMoveRef` was cleared too late, allowing duplicates

**Fix:** Improved submission logic:
1. Check if server already has the move at the expected index
2. Verify the move action matches before skipping submission
3. Clear pending ref BEFORE submission to prevent duplicates
4. Better error handling with proper cleanup

### 4. **No Sync State Validation**
**Location:** `web/src/hooks/useOnlineSantorini.ts` (onCellClick handler)

**Problem:** Players could make moves while the game state was still syncing from the server, causing:
- Moves based on outdated state
- Conflicting move indices
- Lost moves

**Fix:** Added sync state validation in `onCellClick`:
- Check if `lastSyncedStateRef` matches current match and move count
- Block moves while syncing
- Show user-friendly toast messages
- Clear pending ref if move fails

## State Synchronization Flow (After Fix)

### When a new move arrives from server:

1. **Real-time listener** in `useMatchLobby` receives move via Supabase real-time
2. Move is added to `moves` array
3. **State sync effect** in `useOnlineSantorini` detects `moves.length` changed
4. Effect finds most recent snapshot in moves
5. Effect imports snapshot via `base.importState()`
6. Effect filters moves after snapshot: `moves.filter(m => m.move_index > snapshotMoveIndex)`
7. Effect replays each move: `await base.applyMove(action.move, { triggerAi: false, asHuman: false })`
8. Effect updates clocks from all moves
9. Sets `lastSyncedStateRef` with new state

### When player makes a move:

1. Player clicks on board cell
2. **onCellClick** validates:
   - Match exists and player has role
   - Match is in_progress
   - No pending move
   - It's player's turn
   - **State is fully synced** (new check!)
3. Sets `pendingLocalMoveRef` with expected history length and move index
4. Calls `base.onCellClick(y, x)` which applies move locally
5. **Move submission effect** detects history length increased
6. Effect checks if server already has this move
7. If server doesn't have it, submits via `onSubmitMove()`
8. Server processes and broadcasts move
9. Move comes back via real-time
10. State sync effect applies it (or skips if already in local state)

## Key Improvements

1. **Proper Move Replay:** Moves after snapshots are now correctly applied
2. **No Duplicate Submissions:** Better tracking prevents sending same move twice
3. **Sync State Awareness:** Players can't make moves while state is syncing
4. **Better Error Handling:** Failed moves properly clean up pending state
5. **Deterministic State:** Both players will always have the same board state
6. **Clock Synchronization:** Clocks are updated consistently across players

## Testing Recommendations

1. **Basic Flow:**
   - Two players join a match
   - Take turns making moves
   - Verify both see the same board state

2. **Reconnection:**
   - Player 1 makes several moves
   - Player 2 refreshes page
   - Verify Player 2 sees all moves replayed correctly

3. **Concurrent Moves:**
   - Try to make move while opponent's move is in transit
   - Verify proper error message and state recovery

4. **Snapshot Replay:**
   - Join a match with 10+ existing moves
   - Verify all moves are correctly replayed from snapshots
   - Check that final board state matches

5. **Clock Synchronization:**
   - Enable clocks
   - Make several moves
   - Verify both players see same clock times

## Files Modified

- `web/src/hooks/useOnlineSantorini.ts` - Complete refactor of state sync and move submission logic

## Database Schema (Confirmed Working)

- `matches` table stores `initial_state` (JSONB)
- `match_moves` table stores `state_snapshot` (JSONB) for each move
- Real-time subscriptions work correctly on both tables

