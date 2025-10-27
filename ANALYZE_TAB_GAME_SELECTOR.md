# Analyze Tab - Game Selector Feature

## Problem

The user journey to analyze a game was painful:

### Before
1. Finish a game in Play tab
2. Somehow copy the match ID (not obvious how)
3. Switch to Analyze tab
4. Paste the long UUID manually
5. Click Load

**Issues:**
- ❌ No clear way to get match ID
- ❌ Manual copy/paste of long UUIDs
- ❌ No visibility of past games
- ❌ Poor discoverability
- ❌ Friction-filled UX

## Solution

Added **"Your recent games"** selector to Analyze tab!

### New Flow
1. Finish a game
2. Go to Analyze tab
3. See your last 20 completed games in a list
4. Click any game → instantly loads for analysis ✅

## Features Implemented

### 1. Automatic Game Loading 🎮

When signed in, the tab automatically fetches your 20 most recent completed games:

```typescript
useEffect(() => {
  const fetchMyCompletedGames = async () => {
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        creator:players!matches_creator_id_fkey(*),
        opponent:players!matches_opponent_id_fkey(*)
      `)
      .eq('status', 'completed')
      .or(`creator_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
      .order('updated_at', { ascending: false })
      .limit(20);

    setMyCompletedGames(data);
  };

  fetchMyCompletedGames();
}, [auth.profile]);
```

### 2. Rich Game List Display 📋

Each game shows:
- **Opponent names** - "You vs [Opponent]" or "[Opponent] vs You"
- **Game type** - Rated/Casual badge
- **Clock settings** - "10+5" format
- **Date** - When the game was played
- **Visual feedback** - Currently loaded game highlighted
- **Quick load button** - Click "Analyze" or click entire row

### 3. Interactive UI

```
┌────────────────────────────────────────┐
│ Your recent games                      │
├────────────────────────────────────────┤
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓   │  ← Highlighted (currently loaded)
│ ┃ You vs Alice                   ┃   │
│ ┃ [Rated] [10+5] 10/27/2025      ┃   │
│ ┃                    [Loaded]    ┃   │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛   │
│ ┌──────────────────────────────────┐  │
│ │ Bob vs You                       │  │
│ │ [Casual] 10/26/2025              │  │
│ │                   [Analyze]      │  │
│ └──────────────────────────────────┘  │
│ ┌──────────────────────────────────┐  │
│ │ You vs Charlie                   │  │
│ │ [Rated] [5+3] 10/25/2025         │  │
│ │                   [Analyze]      │  │
│ └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### 4. Fallback to Manual Entry 🔑

Still supports manual ID entry for:
- Analyzing other people's games
- Games from before your account
- Sharing analysis links

```
Or enter a match ID
Paste any match ID to analyze games not in your history.
[Input field] [Load]
```

### 5. Smart Loading State 💫

- Shows spinner while fetching games
- Loading indicator on specific game when analyzing
- Currently loaded game stays highlighted
- Smooth transitions and hover effects

### 6. Sign-in Prompts 👤

- Shows game list only when signed in
- Shows helpful message when no completed games
- Manual ID entry always available (even without sign-in)

## User Experience Improvements

### Discovery
- **Before:** Hidden feature, unclear how to use
- **After:** Games prominently displayed, click to analyze

### Speed
- **Before:** Copy UUID → Switch tab → Paste → Load (4+ steps)
- **After:** Switch tab → Click game (2 clicks!)

### Clarity
- **Before:** Need to remember match IDs
- **After:** See all your games with opponent names

### Engagement
- **Before:** Rarely used feature
- **After:** Encourages post-game review

## Technical Implementation

### State Management

```typescript
const [myCompletedGames, setMyCompletedGames] = useState<LobbyMatch[]>([]);
const [loadingMyGames, setLoadingMyGames] = useState(false);
```

### Game Description

```typescript
function describeMatch(match: LobbyMatch, profile: PlayerProfile | null) {
  const isCreator = profile ? match.creator_id === profile.id : false;
  if (isCreator) {
    return `You vs ${match.opponent?.display_name ?? 'Unknown'}`;
  }
  if (profile && match.opponent_id === profile.id) {
    return `${match.creator?.display_name ?? 'Unknown'} vs You`;
  }
  return `${match.creator?.display_name} vs ${match.opponent?.display_name}`;
}
```

### Highlight Logic

```typescript
const isCurrentlyLoaded = loaded?.match.id === game.id;

<Box
  borderColor={isCurrentlyLoaded ? highlightBorder : cardBorder}
  bg={isCurrentlyLoaded ? highlightBg : 'transparent'}
  onClick={() => loadMatchById(game.id)}
/>
```

## Query Optimization

### Efficient Fetching

- ✅ Fetches only completed games
- ✅ Limits to 20 most recent
- ✅ Includes player profiles in single query
- ✅ Ordered by most recent first

```sql
SELECT *,
  creator:players!matches_creator_id_fkey(*),
  opponent:players!matches_opponent_id_fkey(*)
FROM matches
WHERE status = 'completed'
  AND (creator_id = $1 OR opponent_id = $1)
ORDER BY updated_at DESC
LIMIT 20
```

### No Unnecessary Refetching

- Fetches once on mount
- Uses auth.profile as dependency
- Only refetches when user changes

## Layout

### Two-Section Design

1. **Your Recent Games** (if signed in)
   - Scrollable list (max 300px height)
   - Click anywhere on card to load
   - Prominent "Analyze" button
   - Visual feedback

2. **Or Enter Match ID**
   - Divider separates sections
   - Still available for edge cases
   - Helpful description text

## Edge Cases Handled

### No Completed Games
```
No completed games yet. Finish a game to see it here.
```

### Not Signed In
- Section hidden entirely
- Manual ID entry still works

### Loading State
- Shows spinner while fetching
- Prevents multiple simultaneous loads
- Loading indicator on active button

### Error Handling
- Console logs errors (doesn't crash)
- Falls back gracefully
- User can still manually enter IDs

## Future Enhancements

Possible improvements:
- [ ] Search/filter games by opponent
- [ ] Sort options (date, rating, etc.)
- [ ] Show game result (who won)
- [ ] Pagination for >20 games
- [ ] Quick preview (board position thumbnail)
- [ ] Share analysis link from game list
- [ ] Add to favorites/bookmark games
- [ ] Export game list

## Build Status

✅ Build succeeds without errors  
✅ TypeScript compilation passes  
✅ No linter errors  
✅ Auth properly passed as prop

## Files Modified

- `web/src/components/analyze/AnalyzeWorkspace.tsx` - Added game selector
- `web/src/App.tsx` - Pass auth prop to AnalyzeWorkspace

## Breaking Changes

**None** - Fully backwards compatible!

## Accessibility

- ✅ Clickable cards with proper cursor
- ✅ Hover states for visual feedback
- ✅ Button labels clear
- ✅ Loading states announced
- ✅ Keyboard accessible (tab navigation)

## Mobile Responsive

- ✅ Scrollable game list
- ✅ Touch-friendly click targets
- ✅ Flexible layout
- ✅ Proper spacing on small screens

## Summary

Transformed the Analyze tab from a **hidden feature** requiring manual UUID entry into a **user-friendly analysis tool** where you can simply click your past games to review them!

### Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| **Discovery** | Hidden, unclear | Prominent, obvious |
| **Speed** | 4+ steps | 2 clicks |
| **Friction** | High (UUID copy/paste) | Low (click game) |
| **Visibility** | No past games shown | Last 20 games visible |
| **Engagement** | Low usage | Encourages review |

This makes the Analyze tab a **compelling feature** that users will actually use after games!

