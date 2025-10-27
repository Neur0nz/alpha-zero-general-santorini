# Further Performance Optimizations

## Current: ~750ms Breakdown

```
Auth verification:      ~100ms  (Supabase auth.getUser)
Profile lookup:         ~150ms  (SELECT from players table)
Match loading:          ~150ms  (SELECT from matches table)
Last move snapshot:     ~80ms   (SELECT from match_moves)
Apply move logic:       ~20ms   (TypeScript engine)
Insert move:            ~150ms  (INSERT into match_moves)
Update match status:    ~50ms   (UPDATE matches if winner)
Network overhead:       ~50ms   (round-trip latency)
────────────────────────────────
TOTAL:                  ~750ms
```

## 🚀 Additional Optimizations (In Order of Impact)

### 1. **Combine Database Queries** ⚡ (Save ~200ms)

**Current:** 4 separate queries
```typescript
// Query 1: Profile
SELECT id FROM players WHERE auth_user_id = ?

// Query 2: Match
SELECT * FROM matches WHERE id = ?

// Query 3: Last move
SELECT * FROM match_moves WHERE match_id = ? ORDER BY move_index DESC LIMIT 1

// Query 4: Insert move
INSERT INTO match_moves ...
```

**Optimized:** 1 RPC call
```sql
CREATE OR REPLACE FUNCTION submit_game_move(
  p_auth_user_id UUID,
  p_match_id UUID,
  p_move_data JSONB
) RETURNS JSONB AS $$
DECLARE
  v_player_id UUID;
  v_match RECORD;
  v_last_move RECORD;
  v_result JSONB;
BEGIN
  -- All queries in ONE round-trip!
  SELECT p.id, m.*, lm.*
  INTO v_player_id, v_match, v_last_move
  FROM players p
  CROSS JOIN matches m
  LEFT JOIN LATERAL (
    SELECT * FROM match_moves
    WHERE match_id = p_match_id
    ORDER BY move_index DESC
    LIMIT 1
  ) lm ON true
  WHERE p.auth_user_id = p_auth_user_id
    AND m.id = p_match_id;
  
  -- Validate, apply move, insert...
  -- Return result
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Impact:** ~750ms → ~550ms (27% faster!)

---

### 2. **Cache Player Profile** ⚡ (Save ~100ms)

**Issue:** We look up the player profile on EVERY move

**Solution:** Use JWT claims or cache
```typescript
// Option A: Store player_id in JWT custom claims
const { data: { user } } = await supabase.auth.getUser(token);
const playerId = user.app_metadata.player_id;  // ← No DB query!

// Option B: In-memory cache with TTL
const profileCache = new Map();  // key: auth_user_id, value: player_id
```

**Implementation:**
1. When user logs in, add `player_id` to JWT claims
2. Edge function reads from JWT instead of DB

**Impact:** ~550ms → ~450ms (18% faster!)

---

### 3. **Parallel Database Operations** ⚡ (Save ~50ms)

**Current:** Sequential inserts
```typescript
// Insert move (wait)
await supabase.from('match_moves').insert(...);

// Update match (wait)
await supabase.from('matches').update(...);
```

**Optimized:** Parallel
```typescript
// Both at once!
await Promise.all([
  supabase.from('match_moves').insert(...),
  winnerId ? supabase.from('matches').update(...) : Promise.resolve()
]);
```

**Impact:** ~450ms → ~400ms (11% faster!)

---

### 4. **Prepared Statements / Connection Pooling** ⚡ (Save ~30ms)

**Issue:** Each request creates new DB connection

**Solution:** Use Supavisor (Supabase's connection pooler)
- Already enabled by default on hosted Supabase
- Reduces connection overhead

**Verify it's enabled:**
```bash
# Check Supabase dashboard → Database → Connection Pooling
```

**Impact:** ~400ms → ~370ms (8% faster!)

---

### 5. **Optimistic Locking** ⚡ (Save ~50ms)

**Current:** Full server-side validation
```typescript
// Load engine, compute valid moves, validate
if (!validMoves[action]) throw new Error('Illegal move');
```

**Optimized:** Trust client more, validate async
```typescript
// Quick check only
if (move < 0 || move > 161) throw new Error('Out of bounds');

// Insert immediately
await supabase.from('match_moves').insert(...);

// Validate async (if illegal, delete the move)
setTimeout(() => validateMoveAsync(move), 0);
```

⚠️ **Risky!** Only do this if you trust the client validation

**Impact:** ~370ms → ~320ms (14% faster!)

---

## 📊 Cumulative Impact

| Optimization | Time (ms) | Improvement | Cumulative |
|--------------|-----------|-------------|------------|
| **Baseline (now)** | 750 | - | - |
| 1. Combined queries | 550 | -27% | 27% |
| 2. Cache profile | 450 | -18% | 40% |
| 3. Parallel ops | 400 | -11% | 47% |
| 4. Connection pooling | 370 | -8% | 51% |
| 5. Optimistic locking | 320 | -14% | **57%** |

**Final:** **750ms → 320ms** (57% faster on top of the 70% we already got!)

**Combined with O(n)→O(1) fix:**
- **Original:** 2500ms (move 20)
- **After O(1):** 750ms
- **After all opts:** **320ms**
- **Total speedup:** **87% faster!** 🚀

---

## 🎯 Recommended Next Steps

### Easy Wins (Do First)
1. ✅ **O(n)→O(1) optimization** (DONE - just deployed!)
2. ⭐ **Parallel operations** (#3) - 5 lines of code
3. ⭐ **Verify connection pooling** (#4) - just check dashboard

### Medium Effort (High Impact)
4. 🔶 **Combined queries** (#1) - write 1 RPC function
5. 🔶 **Cache player profile** (#2) - modify JWT claims

### Advanced (Risky)
6. ⚠️ **Optimistic locking** (#5) - only if client validation is solid

---

## 🧪 Test After Each Change

```bash
# Watch the logs
npx supabase functions logs submit-move --tail

# Look for timing improvements
⏱️ [TOTAL: ???ms] Request complete
```

---

## 💡 Reality Check

**750ms is actually pretty good for a turn-based game!**
- Chess.com: ~400-800ms per move
- Lichess: ~200-400ms (highly optimized)
- Most board game apps: 500-1000ms

**Users notice lag at:**
- <300ms: Feels instant ✨
- 300-800ms: Acceptable for turn-based 👍
- 800-1500ms: Noticeable but okay 😐
- >1500ms: Feels slow 😞

You're already in the "acceptable" range! But if you want it to feel **instant**, implement optimizations #1-3 above.

---

**Bottom line:** The O(1) fix was the critical one (70-85% speedup). Further optimizations can get you to ~300ms (87% total), but that's diminishing returns. Up to you if it's worth the effort! 🎯

