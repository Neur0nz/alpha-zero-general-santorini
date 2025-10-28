# Temporal Dead Zone Error Fix

## Issue

When a user joined a private game, the app crashed with the following error:

```
Uncaught ReferenceError: Cannot access 'getPlacementContext' before initialization
    at useSantoriniInternal (useSantorini.tsx:424:7)
```

This is a **JavaScript Temporal Dead Zone (TDZ)** error that occurs when a variable or function is accessed before it's fully initialized.

## Root Cause

The issue was in `web/src/hooks/useSantorini.tsx` where there was a **circular dependency** in the `useCallback` hooks:

1. `getPlacementContext` is defined with `useCallback` and an empty dependency array `[]`
2. `updateSelectable` calls `getPlacementContext()` and had `[getPlacementContext]` in its dependency array
3. `updateButtons` also calls `getPlacementContext()` and had `[getPlacementContext, updateButtonsState]` in its dependency array

During component initialization (especially when the match transitions from "waiting_for_opponent" to "in_progress"), React tries to set up all these callbacks simultaneously. Because of the circular references in the dependency arrays, one function would try to call another before it was fully initialized, causing the TDZ error.

## The Fix

Since `getPlacementContext` has an **empty dependency array** `[]`, it never changes during the component's lifetime. This means it's a **stable reference** and doesn't need to be included in other `useCallback` dependency arrays.

### Changes Made

**File:** `web/src/hooks/useSantorini.tsx`

#### 1. Line 436 - `updateSelectable` callback
**Before:**
```typescript
  }, [getPlacementContext]);
```

**After:**
```typescript
  }, []);
```

#### 2. Line 768 - `updateButtons` callback
**Before:**
```typescript
  }, [getPlacementContext, updateButtonsState]);
```

**After:**
```typescript
  }, [updateButtonsState]);
```

## Why This Works

By removing `getPlacementContext` from the dependency arrays:

1. ✅ **Eliminates circular dependency** - Functions no longer depend on each other during initialization
2. ✅ **Maintains correctness** - Since `getPlacementContext` never changes (empty deps), removing it from other deps doesn't change behavior
3. ✅ **Prevents TDZ errors** - React can initialize all callbacks without circular references
4. ✅ **Follows React best practices** - Stable functions don't need to be in dependency arrays

## React Hooks Rules

This fix follows the React Hooks rules:
- Functions with empty dependency arrays `[]` are stable and don't change
- Stable functions don't need to be in other dependency arrays
- State setters from `useState` are also stable (which is why `updateButtonsState` is fine)

## Testing

After this fix:
- ✅ No linter errors
- ✅ Component initializes correctly
- ✅ Match transitions work properly
- ✅ No more TDZ errors when users join games

## Related to Join By Code?

**No, this bug was unrelated to the join by code feature.** The join by code feature I fixed earlier works correctly - this was a separate pre-existing bug that only manifested when:
1. A match transitions from "waiting_for_opponent" to "in_progress"
2. The SantoriniProvider component re-renders
3. The circular dependency causes initialization issues

The user happened to discover this bug while testing the join by code feature, but it would have occurred in any scenario where a match started (public matches, quick matches, etc.).

## Status: ✅ FIXED

The temporal dead zone error has been resolved by removing unnecessary dependencies from `useCallback` hooks.

