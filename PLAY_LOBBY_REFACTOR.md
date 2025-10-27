# Play/Lobby Architecture Refactor

## Overview
Refactored the online play experience to cleanly separate match-finding/creation from active gameplay, providing better organization and easier navigation between multiple concurrent games.

## Changes Made

### 1. New Component Architecture

#### **ActiveGameSwitcher.tsx**
- Compact horizontal switcher showing all active games
- Shows opponent name, clock settings, and "Your turn" indicator
- Click to instantly switch between active games
- Filters to only show in-progress games (not waiting or completed)

#### **LobbyWorkspace.tsx** (new "Lobby" tab)
- **Match Creation**: Create public or private games with custom settings
- **Join by Code**: Quick modal to join private games
- **Your Pending Matches**: Shows games waiting for opponents with join codes
- **Open Public Lobbies**: Browse and join available public games
- **Sign-in Gate**: Clean prompt for unauthenticated users

#### **GamePlayWorkspace.tsx** (new "Play" tab)
- **Active Game Switcher**: Quick access to all your in-progress games
- **Game Board Area**: Focused, distraction-free gameplay
- **Game Info Panel**: Clocks, move history, and match actions
- **Mode Selector**: Choose between Online and Local games when no active game
- **Clean Layout**: No lobby browsing or creation UI clutter

### 2. Updated Navigation

#### **App.tsx**
- Updated tab order: `['lobby', 'play', 'practice', 'analyze', 'profile']`
- Default tab changed to 'lobby' for better onboarding
- Separated PlayWorkspace into LobbyWorkspace and GamePlayWorkspace

#### **HeaderBar.tsx**
- Added support for 'lobby' tab type
- Updated TabList to show: Lobby | Play | Practice | Analyze | Profile

### 3. Removed Component
- **PlayWorkspace.tsx** - functionality split into LobbyWorkspace and GamePlayWorkspace

## User Experience Improvements

### Before
- Everything in one long scrolling "Play" tab
- Lobby browsing mixed with active gameplay
- Hard to find or switch between multiple games
- Cluttered interface with too many actions visible at once

### After
- **Lobby Tab**: Clean focus on finding/creating matches
  - See all open lobbies
  - Create new matches
  - Join by code
  - View pending games waiting for opponent
  
- **Play Tab**: Clean focus on active gameplay
  - Quick game switcher at top
  - Large game board with minimal distractions
  - All game actions in side panel
  - Easy to switch between multiple simultaneous games

## Technical Details

### State Management
- Used existing `useMatchLobby` hook for all state
- No changes to backend or data flow
- Clean separation of concerns between components

### Type Safety
- All TypeScript types properly defined
- Fixed type narrowing issues with sessionMode checks
- No linter errors

### Build Status
✅ Build successful (2.83s)
✅ No TypeScript errors
✅ No linter warnings

## Benefits

1. **Better Organization**: Clear mental model - "Lobby" for finding games, "Play" for playing
2. **Multi-Game Support**: Easy to manage multiple concurrent games with switcher
3. **Less Scrolling**: Relevant UI only, no mixing of concerns
4. **Cleaner UX**: Each tab has single, clear purpose
5. **Mobile Friendly**: Switcher adapts to mobile layout with vertical stacking
6. **Faster Navigation**: Jump between games with one click

## Migration Notes

- Users will land on "Lobby" tab by default
- Active games automatically appear in "Play" tab
- Game switcher only shows in-progress games
- Local match mode still available in "Play" tab
- All existing functionality preserved, just reorganized

