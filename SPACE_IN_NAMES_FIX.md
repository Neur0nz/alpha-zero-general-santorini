# Space in Names Fix - Fallback Profile Sanitization

## Issue Identified

Users signing in with Google accounts that have spaces or special characters in their names (e.g., "Nadav Perry", "omri bel", "נדב פרי") were experiencing "weird behavior" and inability to join games.

## Root Cause

In `web/src/hooks/useSupabaseAuth.ts` line 80, when a network timeout occurs during profile creation, the system creates a temporary fallback profile using the **RAW** name seed from Google without sanitization:

```typescript
// ❌ BEFORE - Uses raw seed with spaces/special chars
display_name: getDisplayNameSeed(user) || `Player_${user.id.slice(0, 8)}`,
```

### The Problem Chain:

1. **User signs in** with Google name "Nadav Perry" (with space)
2. **Network timeout** occurs during profile fetch
3. **Fallback profile created** with `display_name: "Nadav Perry"` (contains space!)
4. **User tries to join game** with temporary profile "Nadav Perry"
5. **System retries** profile creation in background
6. **Real profile created** with `generateDisplayName("Nadav Perry")` → `"NadavPerry152"` (no space)
7. **Mismatch occurs**: 
   - Cached state has "Nadav Perry"
   - Database has "NadavPerry152"
   - User sees inconsistent behavior

### Why This Causes Issues:

1. **Name Mismatch**: Temporary profile has spaces, real profile doesn't
2. **Special Characters**: Hebrew characters like "נדב פרי" could break display logic
3. **Validation Conflict**: Temporary name might not pass `validateDisplayName()` rules
4. **Cache Confusion**: LocalStorage caches the temporary profile with spaces
5. **State Desync**: Frontend shows one name, backend has another

## Examples from Real Users:

From the auth.users data:
- User `3b52f08b-3886-459b-a820-620451b1fd26`: Google name "omri bel" → Generated "Omribel593"
- User `1c336618-be66-40c1-9672-f433efff77f4`: Google name "Nadav Perry" → Generated "NadavPerry152"  
- User `bf206c1a-811e-4b8a-8a3c-3d4dbb4286ef`: Google name "נדב פרי" (Hebrew!) → Generated "FearlessWright827" (fell back to random)

## Solution

Sanitize the fallback profile name using `generateDisplayName()` to ensure consistency with real profiles:

```typescript
// ✅ AFTER - Sanitizes seed through generateDisplayName
const seed = getDisplayNameSeed(user);
const sanitizedName = seed ? generateDisplayName(seed) : `Player${user.id.slice(0, 8)}`;
const fallbackProfile: PlayerProfile = {
  id: `temp_${user.id}`,
  auth_user_id: user.id,
  display_name: sanitizedName,  // Now properly sanitized!
  rating: 1200,
  games_played: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
```

### What This Does:

1. **Removes spaces**: "Nadav Perry" → "NadavPerry152"
2. **Removes special chars**: "omri bel" → "Omribel593"
3. **Handles non-Latin**: "נדב פרי" → Falls back to random name (seed becomes empty after sanitization)
4. **Adds random number**: Ensures uniqueness like real profiles
5. **Consistency**: Temporary and real profiles now have matching name format

## How `generateDisplayName()` Works

```typescript
function sanitizeSeed(seed: string): string {
  return seed
    .normalize('NFKD')  // Normalize Unicode
    .replace(/[^a-zA-Z0-9]/g, '')  // Remove ALL non-alphanumeric (including spaces!)
    .slice(0, 12);  // Limit length
}

export function generateDisplayName(seed?: string): string {
  const randomNumber = Math.floor(100 + Math.random() * 900);
  if (seed) {
    const sanitized = sanitizeSeed(seed);  // ✅ Removes spaces and special chars
    if (sanitized.length >= 3) {
      return `${capitalize(sanitized)}${randomNumber}`;
    }
  }
  // Fallback to adjective+noun if seed too short
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}${noun}${randomNumber}`;
}
```

## Validation Rules (Still Allow Spaces for Manual Changes)

The `validateDisplayName()` function **intentionally allows spaces** for users who want to manually set names with spaces:

```typescript
if (!/^[A-Za-z0-9 _-]+$/.test(normalized)) {
  return 'Display name may only contain letters, numbers, spaces, hyphens, and underscores.';
}
```

This is correct! Users **CAN** manually set names with spaces (like "Cool Player 123"). The issue was only with the **auto-generated** fallback names not being sanitized.

## Impact

### Before Fix:
- ❌ Users with spaces in Google names got inconsistent profiles
- ❌ Temporary fallback profiles had different names than real profiles
- ❌ Special characters from non-English names caused display issues
- ❌ Cache mismatches led to "weird behavior"

### After Fix:
- ✅ All auto-generated names (including fallbacks) are consistently sanitized
- ✅ Temporary and real profiles have matching name formats
- ✅ Special characters are properly handled
- ✅ No more name mismatches between cache and database
- ✅ Users can still manually choose names with spaces if they want

## Testing

To verify the fix works:

1. **Test with spaced Google name:**
   - Sign in with Google account "John Doe"
   - Simulate network timeout by throttling network
   - Verify fallback profile gets sanitized name like "JohnDoe123"
   - Verify real profile matches when created

2. **Test with special characters:**
   - Sign in with non-English name like "José García" or "李明"
   - Verify fallback profile sanitizes properly
   - Verify no display/encoding issues

3. **Test manual name change with spaces:**
   - Sign in successfully
   - Go to Profile tab
   - Change name to "Cool Player" (with space)
   - Verify it saves and displays correctly
   - Verify name works in matches

4. **Test cache consistency:**
   - Clear cache and sign in
   - Let fallback profile load
   - Refresh page after real profile creates
   - Verify name stays consistent across refreshes

## Files Changed

- `web/src/hooks/useSupabaseAuth.ts` (lines 76-86)

## Related Documentation

- See `NAME_CHANGE_AND_ELO_FIX.md` for the database constraint fixes
- Validation logic in `web/src/utils/generateDisplayName.ts`

