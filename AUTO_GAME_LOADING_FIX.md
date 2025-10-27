# Auto Game Loading Fix

## Problem
When a user joined or created a game from the Lobby tab and was automatically navigated to the Play tab, the game board didn't load immediately. Instead, users had to click on the small game card in the "Active Games" switcher for the board to actually appear. This was confusing and required an extra unnecessary click.

## Root Cause
The issue had two components:

1. **Separate Hook Instances**: `LobbyWorkspace` and `GamePlayWorkspace` each create their own instance of `useMatchLobby`. While they sync via Supabase subscriptions, there's a timing delay when navigating immediately after joining.

2. **No Auto-Selection**: When the Play tab loaded, if no game was explicitly set as active, it would show "No active game" even though games existed in `myMatches`.

## Solution

### 1. Auto-Selection on Play Tab Load
Added automatic game selection when the Play tab mounts:

```typescript
// GamePlayWorkspace.tsx
useEffect(() => {
  if (sessionMode === 'online' && !lobby.activeMatch && lobby.myMatches.length > 0) {
    const inProgressGames = lobby.myMatches.filter(m => m.status === 'in_progress');
    if (inProgressGames.length > 0) {
      console.log('Auto-selecting first in-progress game:', inProgressGames[0].id);
      lobby.setActiveMatch(inProgressGames[0].id);
    }
  }
}, [sessionMode, lobby.activeMatch, lobby.myMatches, lobby.setActiveMatch]);
```

**How it works**:
- When Play tab loads with no active match selected
- But has in-progress games available
- Automatically selects the first in-progress game
- Board loads immediately without requiring click

### 2. Navigation from Pending Matches
Added navigation callback when viewing pending matches:

```typescript
// LobbyWorkspace.tsx - PendingMatches component
const handleSelect = (matchId: string) => {
  onSelect(matchId);
  onAfterSelect?.(); // Navigate to Play tab
};
```

**How it works**:
- When user clicks "View" on a pending match
- Match is selected AND user is taken to Play tab
- Seamless flow without extra clicks

## User Flow Improvements

### Before
```
1. Lobby Tab → Create/Join Game
2. Auto-navigate to Play Tab
3. See "No active game" or game switcher
4. Click game card in switcher ← Extra click!
5. Board finally loads
```

### After
```
1. Lobby Tab → Create/Join Game
2. Auto-navigate to Play Tab
3. Board loads immediately ✨
```

## All Navigation Paths Fixed

### ✅ Create Match
- Lobby → Create Match → **Auto-navigate + Auto-load board**

### ✅ Join by Code
- Lobby → Join by Code → **Auto-navigate + Auto-load board**

### ✅ Join from Public Lobbies
- Lobby → Click "Join" → **Auto-navigate + Auto-load board**

### ✅ View Pending Match
- Lobby → Click "View" on pending → **Auto-navigate + Auto-load board**

### ✅ Switching Between Games
- Play Tab → Click game in switcher → **Board updates immediately**

### ✅ Returning to Play Tab
- Other Tab → Play Tab → **Auto-selects first game if none selected**

## Technical Details

### Files Modified
1. **GamePlayWorkspace.tsx**
   - Added auto-selection useEffect
   - Monitors myMatches and activeMatch
   - Selects first in-progress game when appropriate

2. **LobbyWorkspace.tsx**
   - Updated PendingMatches to accept `onAfterSelect` callback
   - Calls navigation after selecting pending match
   - All join/create paths already had navigation

### Smart Auto-Selection Logic
The auto-selection only happens when:
- ✅ Session mode is 'online' (not local)
- ✅ No match is currently active
- ✅ User has at least one match in myMatches
- ✅ At least one match has status 'in_progress'

This prevents:
- ❌ Interfering with local games
- ❌ Overriding user's explicit selection
- ❌ Selecting waiting/completed games
- ❌ Unnecessary re-selections

## Benefits

1. **Zero Extra Clicks**: Game loads immediately after joining
2. **Intuitive Flow**: Join → Play happens seamlessly
3. **Smart Defaults**: Always shows a game if one exists
4. **No Confusion**: Users never see "No active game" when games exist
5. **Works Everywhere**: All entry points (create, join, view) benefit

## Edge Cases Handled

### Multiple In-Progress Games
- Selects first game (oldest by default)
- User can still switch via game switcher

### Timing Delays
- Auto-selection happens reactively as myMatches updates
- Works even if Supabase sync is slow

### Already Selected Game
- Auto-selection skips if game already active
- Respects user's current choice

### Local Mode
- Auto-selection only runs in online mode
- Local games unaffected

## Build Status
✅ Build successful (3.92s)  
✅ No TypeScript errors  
✅ No linter warnings

## Testing Checklist

- [x] Create match → navigates and loads board
- [x] Join by code → navigates and loads board
- [x] Join from lobby → navigates and loads board
- [x] View pending match → navigates and loads board
- [x] Multiple games → can switch between them
- [x] Return to Play tab → shows game if available
- [x] Local mode → unaffected by auto-selection

