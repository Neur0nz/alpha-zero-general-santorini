# Remaining Issues & Recommendations

After comprehensive code analysis, here are additional issues found:

## 🔴 Critical Issue

### 1. **Duplicate Game Completion Calls**

**Location:** `web/src/hooks/useOnlineSantorini.ts` (lines 434-474)

**Problem:**
The game completion effects can fire multiple times before the match status updates:

1. Game ends → `base.gameEnded` changes to `[1, -1]`
2. Effect fires → calls `onGameComplete(winnerId)`
3. `onGameComplete` starts async DB update
4. **Clock keeps ticking** → Effect fires again with same `base.gameEnded`
5. **Another `onGameComplete` call!**
6. Eventually match status updates to 'completed'
7. Effects stop (but may have fired 5-10 times)

**Impact:**
- Multiple database updates for the same completion
- Possible race conditions
- Toast notifications shown multiple times
- Database transaction conflicts

**Fix:**
Add a ref to track completion status:

```typescript
const gameCompletedRef = useRef(false);

// Game completion detection effect
useEffect(() => {
  if (!match || !onGameComplete || match.status !== 'in_progress') {
    // Reset when match changes
    if (match?.id !== gameCompletedRef.current) {
      gameCompletedRef.current = false;
    }
    return;
  }
  
  // Prevent duplicate calls
  if (gameCompletedRef.current) {
    return;
  }
  
  const [p0Score, p1Score] = base.gameEnded;
  if (p0Score !== 0 || p1Score !== 0) {
    gameCompletedRef.current = true; // Mark as completed BEFORE calling
    
    let winnerId: string | null = null;
    if (p0Score > 0) winnerId = match.creator_id;
    else if (p1Score > 0) winnerId = match.opponent_id;
    
    console.log('useOnlineSantorini: Game completed detected, winner:', winnerId);
    onGameComplete(winnerId);
  }
}, [base.gameEnded, match, onGameComplete]);

// Similar fix for clock timeout
```

**Priority:** HIGH - Should fix before deployment

---

## 🟡 Important Issues

### 2. **No ELO/Rating System Implementation**

**Location:** Database triggers not implemented (see `SUPABASE_ELO_AND_STALE_GAMES.md`)

**Problem:**
- Rated games are tracked (`matches.rated = true`)
- But player ratings are never updated
- `players.rating` and `players.games_played` stay static

**Impact:**
- Rated games meaningless
- No competitive progression
- Leaderboard would be useless

**Fix:**
Implement the database trigger described in `SUPABASE_ELO_AND_STALE_GAMES.md`:
- Create `apply_match_result()` function
- Add trigger on match completion
- Calculate ELO changes
- Update both player records

**Priority:** MEDIUM - Feature incomplete but not broken

---

### 3. **Stale Match Cleanup Missing**

**Location:** No automated cleanup (mentioned in `SUPABASE_ELO_AND_STALE_GAMES.md`)

**Problem:**
- Matches stuck in `waiting_for_opponent` forever
- Abandoned `in_progress` games never cleaned up
- Database fills with dead matches

**Current Mitigation:**
- Client-side cleanup runs every 5 minutes (useMatchLobby.ts:238)
- Only cleans up creator's own matches
- Only runs when user is online

**Gaps:**
- Opponent abandons → match stays in `in_progress`
- Both players close browser → match orphaned
- No server-side enforcement

**Fix:**
Implement Supabase scheduled job:
```sql
-- Clean up stale matches older than 1 hour
select cron.schedule(
  'cleanup-stale-matches',
  '*/15 * * * *', -- Every 15 minutes
  $$
  update matches
  set status = 'abandoned'
  where status = 'waiting_for_opponent'
    and created_at < now() - interval '1 hour'
  $$
);

-- Mark abandoned in-progress games (no moves in 30+ min)
select cron.schedule(
  'cleanup-inactive-games',
  '*/30 * * * *',
  $$
  update matches m
  set status = 'abandoned'
  where m.status = 'in_progress'
    and not exists (
      select 1 from match_moves mm
      where mm.match_id = m.id
        and mm.created_at > now() - interval '30 minutes'
    )
  $$
);
```

**Priority:** MEDIUM - Impacts database health over time

---

## 🟢 Minor Issues

### 4. **No Window Close / Tab Close Handling**

**Location:** No `beforeunload` handlers

**Problem:**
- User closes browser → no cleanup
- In-progress match stays open
- Opponent waits indefinitely

**Current Behavior:**
- Real-time subscription drops
- Opponent might notice after timeout
- No automatic abandonment

**Recommendation:**
Add window close handler in `useOnlineSantorini`:
```typescript
useEffect(() => {
  if (!match || match.status !== 'in_progress' || !role) return;
  
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    // Warn user they're leaving an active game
    e.preventDefault();
    e.returnValue = ''; // Chrome requires returnValue to be set
    return 'You have an active game. Are you sure you want to leave?';
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [match, role]);
```

**Priority:** LOW - Nice UX improvement

---

### 5. **No Undo in Online Games**

**Location:** `PlayWorkspace.tsx:593` has TODO comment

**Problem:**
- Local games have undo
- Online games don't
- Players can't fix mistakes

**Current State:**
```typescript
{/* TODO: Implement online undo request flow */}
```

**Recommendation:**
Implement undo request system:
1. Player clicks "Request Undo"
2. Send request to opponent via database
3. Opponent approves/denies
4. If approved, revert last move

**Complexity:** HIGH - Requires:
- New database table for requests
- Real-time notifications
- Move rollback logic
- UI for approving requests

**Priority:** LOW - Feature enhancement

---

### 6. **Initial State Always Empty Board**

**Location:** `supabase/functions/create-match/index.ts:130`

**Problem:**
All games start with `SantoriniEngine.createInitial()` which creates an empty board.

**Current Behavior:**
```typescript
const { snapshot } = SantoriniEngine.createInitial();
// Creates board with no workers, no buildings
```

**Impact:**
- Players must place all 4 workers
- Takes 4 moves before actual game starts
- Could support preset positions

**Recommendation (Optional):**
Add support for custom starting positions:
- Random worker placement
- Standard opening positions
- Custom board setups for variants

**Priority:** VERY LOW - Current behavior is correct for standard Santorini

---

## 📊 Summary by Priority

### 🔴 Fix Before Deployment
1. Duplicate game completion calls

### 🟡 Fix Soon
2. ELO rating implementation
3. Stale match cleanup (server-side)

### 🟢 Nice to Have
4. Window close warning
5. Online undo system
6. Custom starting positions

---

## Testing Recommendations

### Critical Test (Issue #1)
1. Play a game to completion
2. Monitor console logs
3. Count "Game completed detected" messages
4. Should see exactly 1, not multiple

### Important Tests
1. **Rating Updates:**
   - Play rated game
   - Check if `players.rating` updates after completion
   
2. **Stale Cleanup:**
   - Create match and close browser
   - Wait 1+ hour
   - Check if match marked as abandoned

3. **Window Close:**
   - Start game
   - Try to close tab
   - Verify warning shows (after implementing fix)

---

## No Issues Found In:

✅ Move validation (server validates all moves)
✅ Authentication flow (properly uses Supabase auth)
✅ Real-time subscriptions (handles reconnection)
✅ Error handling (comprehensive try-catch blocks)  
✅ Type safety (TypeScript types are correct)
✅ Worker placement phase (works correctly)
✅ Database schema (well-designed with proper indexes)
✅ Security (RLS policies in place, service role used correctly)

---

## Performance Considerations

All identified issues are functional, not performance-related. The codebase shows good performance practices:
- Proper use of `useCallback` and `useMemo`
- Efficient re-rendering with dependency arrays
- Database queries use indexes
- Real-time subscriptions are scoped appropriately

