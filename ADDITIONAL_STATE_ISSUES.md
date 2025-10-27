# Additional State Management Issues Found

## Critical Issues

### 1. **Game Completion Detection Not Working** 🔴 CRITICAL

**Location:** `web/src/hooks/useOnlineSantorini.ts`

**Problem:**
- `onGameComplete` callback is defined and passed in from PlayWorkspace
- But it's **NEVER called** anywhere in useOnlineSantorini
- The game engine (`base.gameEnded`) knows when someone wins
- But the UI never detects this and updates the match status

**Impact:**
- Games never officially end on the client side
- Winner is not determined automatically
- Match status stays as "in_progress" forever
- Players don't know the game is over

**Fix Needed:**
Add an effect that monitors `base.gameEnded` and calls `onGameComplete`:

```typescript
// Add this effect in useOnlineSantorini
useEffect(() => {
  if (!match || !onGameComplete || match.status !== 'in_progress') {
    return;
  }
  
  // Check if game has ended
  const [p0Score, p1Score] = base.gameEnded;
  if (p0Score !== 0 || p1Score !== 0) {
    // Game ended - determine winner
    let winnerId: string | null = null;
    if (p0Score > 0) {
      winnerId = match.creator_id; // Player 0 won
    } else if (p1Score > 0) {
      winnerId = match.opponent_id; // Player 1 won
    }
    
    console.log('Game completed, calling onGameComplete with winner:', winnerId);
    onGameComplete(winnerId);
  }
}, [base.gameEnded, match, onGameComplete]);
```

---

### 2. **Move Ordering Not Guaranteed** 🟡 IMPORTANT

**Location:** `web/src/hooks/useMatchLobby.ts` (lines 549-565)

**Problem:**
- Moves arrive via real-time subscription
- They're appended to the moves array: `moves: [...prev.moves, moveRecord]`
- No sorting or ordering check
- If network delays cause moves to arrive out of order, the game state will be wrong

**Example Scenario:**
1. Player A makes move 0
2. Player B makes move 1  
3. Player A makes move 2
4. Due to network issues, move 2 arrives before move 1
5. Moves array becomes [move0, move2, move1] instead of [move0, move1, move2]
6. Game replays in wrong order → corrupted state

**Fix Needed:**
Sort moves by move_index after insertion:

```typescript
if (payload.eventType === 'INSERT') {
  const newMove = payload.new as MatchMoveRecord;
  const moveRecord: MatchMoveRecord<MatchAction> = {
    ...newMove,
    action: normalizeAction(newMove.action),
  };
  const exists = prev.moves.some((move) => move.id === moveRecord.id);
  if (exists) {
    console.log('useMatchLobby: Move already exists, skipping');
    return prev;
  }
  console.log('useMatchLobby: Adding new move', { 
    moveId: moveRecord.id, 
    moveIndex: moveRecord.move_index,
    totalMoves: prev.moves.length + 1 
  });
  
  // Add move and ensure proper ordering
  const updatedMoves = [...prev.moves, moveRecord].sort((a, b) => a.move_index - b.move_index);
  return { ...prev, moves: updatedMoves };
}
```

---

### 3. **Clock Timeout Not Handled** 🟡 IMPORTANT

**Location:** `web/src/hooks/useOnlineSantorini.ts` (clock management)

**Problem:**
- Clocks count down to zero
- But nothing happens when time runs out
- Game should automatically end with the other player winning
- Currently, players can keep playing even with 0:00 on the clock

**Fix Needed:**
Add clock timeout detection:

```typescript
// Add this effect in useOnlineSantorini
useEffect(() => {
  if (!clockEnabled || !match || match.status !== 'in_progress' || !role || !onGameComplete) {
    return;
  }
  
  // Check if either clock has run out
  if (clock.creatorMs <= 0) {
    // Creator ran out of time, opponent wins
    console.log('Creator ran out of time');
    onGameComplete(match.opponent_id);
  } else if (clock.opponentMs <= 0) {
    // Opponent ran out of time, creator wins
    console.log('Opponent ran out of time');
    onGameComplete(match.creator_id);
  }
}, [clock, clockEnabled, match, onGameComplete, role]);
```

---

### 4. **Real-time Subscription Resilience** 🟢 MINOR

**Location:** `web/src/hooks/useMatchLobby.ts` (lines 571-577)

**Problem:**
- Real-time subscriptions can disconnect due to network issues
- No explicit reconnection logic
- No user notification when connection is lost
- Moves might be missed during disconnection

**Current Code:**
```typescript
.subscribe((status) => {
  console.log('useMatchLobby: Real-time subscription status', { 
    matchId, 
    status,
    channel: channel.topic 
  });
});
```

**Enhancement Needed:**
```typescript
.subscribe((status) => {
  console.log('useMatchLobby: Real-time subscription status', { 
    matchId, 
    status,
    channel: channel.topic 
  });
  
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    console.warn('Real-time connection lost, will auto-reconnect');
    // Could show a toast notification to user
  }
  
  if (status === 'SUBSCRIBED') {
    // On reconnection, refresh moves to catch any missed
    console.log('Real-time reconnected, refreshing moves');
    fetchMoves();
  }
});
```

---

## Summary of Issues by Priority

### 🔴 CRITICAL (Must Fix)
1. **Game completion detection not working** - Games never end properly

### 🟡 IMPORTANT (Should Fix)
2. **Move ordering not guaranteed** - Can cause state corruption
3. **Clock timeout not handled** - Breaks timed games

### 🟢 MINOR (Nice to Have)
4. **Real-time subscription resilience** - Better UX during network issues

## Testing Recommendations

### Test 1: Game Completion
1. Start an online game
2. Play until someone wins
3. Verify:
   - Winner is detected
   - Match status updates to "completed"
   - Winner is displayed correctly
   - Match moves to completed games list

### Test 2: Move Ordering
1. Use network throttling to simulate delays
2. Make several rapid moves
3. Refresh page while moves are in transit
4. Verify board state is correct after all moves sync

### Test 3: Clock Timeout
1. Create a game with 1 minute + 0 second increment
2. Let one player's clock run to 0:00
3. Verify:
   - Game ends automatically
   - Other player is declared winner
   - Match status updates

### Test 4: Connection Loss
1. Start a game
2. Disable network mid-game
3. Opponent makes moves
4. Re-enable network
5. Verify all moves sync correctly

