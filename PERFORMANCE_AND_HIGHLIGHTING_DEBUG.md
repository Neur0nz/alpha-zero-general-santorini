# Performance & Highlighting Issues - Debug Guide

## 🐛 Issue Summary

### 1. **Slow Move Submission** (2-3 seconds per move)
Even the first placement move takes seconds to process.

### 2. **Second Player Highlighting Bug**
- First player: works fine
- Second player: "messed up highlights"
- When second player clicks: "piece just moves weirdly" + error

---

## 🔍 Root Cause Analysis

### Performance Issue: Multiple Database Queries

**The edge function makes 5-6 database calls per move:**

```typescript
// submit-move/index.ts

1. supabase.auth.getUser(token)                    // ← Auth verification
2. .from('players').select('id')...                // ← Player lookup
3. .from('matches').select(...)...                 // ← Match lookup  
4. .from('match_moves').select(...)...             // ← Historical moves (even if 0!)
5. .from('match_moves').insert(...)...             // ← Insert new move
6. .from('matches').update(...) [if game ends]     // ← Update match status
```

**Each query adds latency:**
- Network round-trip to Supabase
- Database query execution
- Data serialization

**Estimated breakdown:**
- Auth: ~100-300ms
- Player lookup: ~50-150ms
- Match lookup: ~50-150ms
- **Historical moves: ~100-400ms** (even for 0 moves!)
- Move insert: ~100-300ms
- **TOTAL: 400-1300ms+ PER MOVE**

Add cold start (if function wasn't recently used): **+500-2000ms**

---

## 🎯 Highlighting Bug Analysis

### Debug Logs Added:

Added comprehensive logging in `useOnlineSantorini.ts`:

```typescript
console.log('🎯 onCellClick Debug:', {
  y, x,
  role,                          // 'creator' or 'opponent'
  enginePlayer,                  // 0 or 1
  currentTurn,                   // 'creator' or 'opponent'
  moveSelector: {
    stage,                       // 0=select worker, 1=select move, 2=select build
    workerIndex,                 // 0 or 1 (which worker)
    workerY, workerX,           // Current worker position
  },
  cellWorker,                    // Worker at clicked cell
  cellLevel,                     // Building level at clicked cell
  validMovesCount,               // How many valid moves available
  firstFewValidMoves,            // First 30 valid move indices
});
```

### Suspected Issues:

**1. Player Index Mismatch**
- Engine uses indices: `0` (creator) and `1` (opponent)
- Worker signs: `+1, +2` (player 0), `-1, -2` (player 1)
- If `computeSelectable` gets wrong `currentPlayer`, highlights will be wrong

**2. Move Selector Not Reset Between Turns**
- `moveSelectorRef.current` might retain state from previous player
- Stage might be stuck at 1 or 2 instead of 0

**3. Valid Moves Calculation Issue**
- Server and client engines might be out of sync
- `validMoves` array might be for wrong player

---

## 🧪 Testing Instructions

### Step 1: Deploy Updated Edge Function

```bash
cd /home/nadavi/Documents/GitHub/alpha-zero-general-santorini

# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy with timing logs
./deploy-functions.sh
```

### Step 2: Test Performance

1. Open two browsers
2. Browser A: Create a match
3. Browser B: Join the match
4. Browser A: Place first piece
5. **Check Supabase logs:**
   ```bash
   supabase functions logs submit-move --tail
   ```

**Look for:**
```
⏱️ [START] submit-move request received
⏱️ [15ms] Payload parsed
⏱️ [120ms] Supabase client created
⏱️ [280ms] Auth verified
⏱️ [420ms] Profile loaded
⏱️ [580ms] Match loaded
⏱️ [950ms] Historical moves loaded (0 moves)    ← THIS SHOULD BE FAST!
⏱️ [1150ms] Move inserted
⏱️ [TOTAL: 1150ms] Request complete
```

### Step 3: Test Highlighting Bug

1. Continue from placement phase to game phase
2. Browser A makes first move
3. **Browser B (second player):**
   - Open browser console (F12)
   - Look for logs: `🎯 onCellClick Debug:`
   - Try to make a move
   - **Capture the logs!**

**Expected logs:**
```javascript
🎯 onCellClick Debug: {
  y: 2, x: 1,
  role: 'opponent',
  enginePlayer: 1,              // Should match role!
  currentTurn: 'opponent',      // Should match role!
  moveSelector: {
    stage: 0,                   // Should start at 0
    workerIndex: 0,
    workerY: 0, workerX: 0,
  },
  cellWorker: -1,               // Negative = opponent's worker
  cellLevel: 0,
  validMovesCount: 162,         // Should have valid moves!
}
```

**If you see problems like:**
- `enginePlayer: 0` but `role: 'opponent'` → **Sync issue!**
- `moveSelector.stage: 2` at start → **Selector not reset!**
- `validMovesCount: 0` → **No valid moves calculated!**
- `cellWorker: 1` (positive) when clicking opponent worker → **Board state wrong!**

---

## 🚀 Potential Fixes

### Performance Optimization:

**Option A: Cache Player Profile**
- Store `player_id` in JWT claims
- Skip database lookup

**Option B: Reduce Queries**
- Combine queries with joins
- Use RPC functions

**Option C: Optimistic Client**
- Don't wait for server before showing move
- Rollback if server rejects

**Option D: Use state_snapshot**
- Don't replay historical moves
- Use latest `state_snapshot` from most recent move
- Only need to query: last move's snapshot (or match initial_state if no moves)

### Highlighting Fix:

**Once we see the logs, likely fixes:**

1. **Reset move selector on turn change:**
```typescript
useEffect(() => {
  moveSelectorRef.current.reset();
  setSelectable(computeSelectable(...));
}, [engine.player]);  // Reset when player changes!
```

2. **Fix player index calculation:**
```typescript
const currentPlayer = engine.player;  // Use engine's player directly
const isMyTurn = (currentPlayer === 0 && role === 'creator') || 
                 (currentPlayer === 1 && role === 'opponent');
```

3. **Force re-sync when highlights are wrong:**
```typescript
if (validMovesCount === 0 && !gameEnded) {
  console.error('No valid moves but game not ended - forcing resync');
  // Trigger state refresh
}
```

---

## 📊 Current Status

✅ **Debug logs added to:**
- Client: `useOnlineSantorini.ts`
- Server: `supabase/functions/submit-move/index.ts`

⏳ **Need to:**
1. Deploy edge function with logs
2. Run test game
3. Capture logs from both client and server
4. Identify exact issue
5. Apply targeted fix

🔧 **Most Likely Culprits:**
- Performance: Historical moves query (even when empty)
- Highlighting: Move selector not resetting between players

---

## 🎮 Next Steps

1. **Deploy the updated function:**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ./deploy-functions.sh
   ```

2. **Run a test game and share the logs:**
   - Client console logs (browser F12)
   - Server function logs (`supabase functions logs submit-move`)

3. **Once we see the logs, we can:**
   - Pinpoint exact slow query
   - Fix highlighting logic
   - Optimize performance

---

**The logs will tell us exactly what's wrong!** 🕵️‍♂️

