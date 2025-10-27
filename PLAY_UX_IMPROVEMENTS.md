# Play Tab UX Improvements

## Summary
Enhanced the Play tab with a cleaner, more focused design that makes the board larger and more prominent, similar to local play mode.

## Changes Made

### 1. **Persistent Mode Switcher** ✅
- **Always visible** at the top of Play tab
- Small, compact `Online | Local` toggle
- Works even when games are active
- Shows "Sign in to play online" hint for guests

**Before**: Mode selector only appeared when no active game  
**After**: Always accessible, allowing easy switching between modes

### 2. **Actions Bar Moved to Top** ✅
- Consolidated actions (Leave, Rematch, Analyze) into compact bar
- Placed at very top, before the board
- Shows game info badges (Rated/Casual, clock settings, join code)
- Quick turn indicator

**Before**: Actions buried in side panel  
**After**: Immediately accessible at top

### 3. **Board Size Maximized** ✅
- Online board now uses same large layout as local play
- Centered with `maxW="960px"` - matches Practice tab size
- Full-width responsive design
- Removed constraining two-column grid layout

**Before**: Board cramped in left column of 2-column grid  
**After**: Board takes center stage, fills available space beautifully

### 4. **Clocks Redesigned** ✅
- Moved below board instead of beside it
- Larger `size="2xl"` heading for better visibility
- Symmetric horizontal layout
- Centered alignment
- More breathing room with better spacing

**Before**: Small clocks squeezed in side panel  
**After**: Prominent, easy-to-read clocks with player names

### 5. **Removed Side Panel Clutter** ✅
- Eliminated the confining side panel entirely
- Removed redundant match status text
- Removed move history (can add back later if needed)
- Actions moved to top bar

**Before**: Right side panel took up space, made board smaller  
**After**: Clean, focused layout - board is the star

### 6. **Fixed Online Mode Bug** ✅
- Both LobbyWorkspace and GamePlayWorkspace now use `autoConnectOnline: true`
- Fixes "Online play is not enabled" error when creating games

## Visual Hierarchy

### Before
```
[Mode Selector] (only if no game)
[Game Switcher]
┌─────────────────────────────────────┐
│ Active Match Header                 │
├──────────────┬──────────────────────┤
│              │  Match Status        │
│   Board      │  Recent Moves        │
│  (small)     │  Actions             │
│              │  Clocks (small)      │
└──────────────┴──────────────────────┘
```

### After
```
[Mode Switcher: Online | Local]  (always visible)
[Game Switcher]
[Actions Bar: Leave | Rematch | Analyze]

        ┌─────────────────┐
        │                 │
        │      BOARD      │
        │    (LARGE)      │
        │                 │
        └─────────────────┘

    [Clock: 10:00]    [Clock: 09:45]
    Player 1 (Blue)   Player 2 (Red)
```

## Benefits

1. **Larger Board**: Online play now has same spacious feel as local play
2. **Cleaner Focus**: No distracting side panels, board takes center stage
3. **Better Readability**: Larger clocks and cleaner typography
4. **Always Accessible**: Mode switcher always available
5. **Quick Actions**: Top bar makes common actions one click away
6. **Responsive**: Layout adapts beautifully to mobile and desktop
7. **Consistent**: Matches the visual quality of Practice tab

## Technical Details

- Removed complex `Grid` layout with `xl:` breakpoints
- Used simple `Flex` and `Stack` for cleaner responsive design
- Increased clock size from `lg` to `2xl`
- Centered board with `maxW="960px"` for optimal viewing
- Consolidated CardHeader info into compact top bar
- Fixed lobby initialization with `autoConnectOnline` option

## Files Modified

- `web/src/components/play/GamePlayWorkspace.tsx` - Complete redesign of online game layout
- `web/src/components/play/LobbyWorkspace.tsx` - Added autoConnectOnline option

## Build Status
✅ Build successful (3.01s)  
✅ No TypeScript errors  
✅ No linter warnings

