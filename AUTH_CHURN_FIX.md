# Auth Churn Fix - Profile Fetch Timeout & Subscription Teardown

## Issue Found

The "instant move" bug and subscription issues were caused by **constant auth churning** that tore down the realtime subscription during gameplay.

### What Was Happening:

```
1. User is playing a game
2. Auth token refreshes automatically (normal Supabase behavior)
3. Profile fetch triggered with 5-second timeout
4. Network is slow → Profile fetch times out after 5s
5. Temporary fallback profile created
6. Auth state change triggered
7. ← REALTIME SUBSCRIPTION CLOSES
8. Game state corrupts
9. Retry triggers after 2s
10. Repeat cycle...
```

**Result:** Subscription kept closing and reopening during gameplay, causing:
- Moves to appear "instantly" without animation
- State desyncs between clients
- "Illegal move" errors from corrupted engine state
- One player seeing moves the other didn't make

### Evidence from Logs:

```
Auth state change: SIGNED_IN
Loading profile for session user
Profile fetch failed, using temporary fallback profile. Profile fetch timed out
→ Real-time subscription status CLOSED  ← GAME BREAKS HERE
→ Real-time subscription status CLOSED
→ Real-time subscription status CLOSED
Cookie "__cf_bm" has been rejected for invalid domain
Retrying profile load after temporary fallback...
✅ Successfully upgraded from temporary to real profile
→ Real-time subscription status SUBSCRIBED  ← GAME RECONNECTS
```

This cycle repeated **multiple times during a single game**, each time disrupting the realtime connection.

## Root Cause

`useSupabaseAuth.ts` had very aggressive timeouts:
```typescript
const PROFILE_FETCH_TIMEOUT = 5000;  // ❌ Too short!
const PROFILE_RETRY_DELAY = 2000;     // ❌ Too aggressive!
```

Combined with:
- Network latency
- Supabase's automatic token refresh
- Cookie/CloudFlare issues ("__cf_bm" rejected)
- The retry logic creating additional auth state changes

## Solution - Two Fixes Required

### Fix 1: Increase Timeouts (30s)

**Increased timeouts to be more tolerant of network conditions:**

```typescript
const PROFILE_FETCH_TIMEOUT = 30000;  // ✅ 30s - handles very slow networks
const PROFILE_RETRY_DELAY = 5000;      // ✅ 5s - less aggressive retries
```

**Why 30s?** Even on slow networks or mobile connections, 30s should be enough. Better to wait longer once than disrupt gameplay every few seconds.

### Fix 2: Preserve Active Match During Retries

**The critical fix - don't tear down subscriptions during profile retry:**

```typescript
// ❌ BEFORE - Cleared activeMatch when profile was temporary
if (!profile || isTemporaryProfile(profile)) {
  return { ...prev, myMatches: [], activeMatchId: null, activeMatch: null };
}

// ✅ AFTER - Keep activeMatch to preserve subscription
if (!profile || isTemporaryProfile(profile)) {
  return { ...prev, myMatches: [] }; // Only clear matches list
}
```

**Why this is critical:**
- The subscription effect depends on `matchId` (from `activeMatchId`)
- When `activeMatchId` was cleared, subscription tore down
- Now `activeMatchId` stays intact during profile retry
- Subscription remains stable even if profile fetch times out

### Why Both Fixes Are Needed:

1. **30s timeout**: Prevents most timeouts from happening
2. **Preserve activeMatch**: Even if timeout happens, subscription stays alive
3. **Result**: Stable gameplay under all network conditions

### Trade-offs:

- **Before**: 5s timeout → Fast feedback but constant disruption during games
- **After**: 15s timeout → Slightly slower initial load, but **stable gameplay**

The 10-second increase in initial load time is acceptable because:
- It only affects the first sign-in or page refresh
- It prevents constant disruptions during actual gameplay
- Users would rather wait 15s once than have their game break every 5s

## Related Issues Fixed

This also explains why the previous "duplicate move" fix didn't completely solve the problem. The duplicate processing prevention was correct, but the auth churn was creating a different vector for the same symptom.

**Both fixes are needed:**
1. ✅ Stable subscription dependencies (prevent churn from profile updates)
2. ✅ Longer timeouts (prevent churn from network conditions)

## Testing

To verify this fixes the issue:

1. Start an online game
2. Watch the console during gameplay
3. Should **NOT** see:
   - Repeated "Auth state change" during game
   - "Profile fetch failed" during game
   - "Real-time subscription status CLOSED" during game
   
4. Should see **stable connection**:
   - One "SUBSCRIBED" at game start
   - Moves flow smoothly
   - No "instant" or duplicate moves

## Additional Notes

The logs also showed:
```
Cookie "__cf_bm" has been rejected for invalid domain
```

This is a CloudFlare cookie issue that's unrelated to our code. It happens when Supabase's CDN cookies don't match the domain, but it doesn't actually break functionality - just creates console noise.

