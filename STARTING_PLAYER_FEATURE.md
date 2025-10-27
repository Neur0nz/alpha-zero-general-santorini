# Starting Player Selection Feature

## Feature Overview

Added the ability to choose which player starts the game when creating a match.

**Options:**
- **You (Creator)** - The match creator moves first
- **Opponent** - The joining player moves first  
- **Random** - 50/50 chance for either player (default)

---

## Implementation Details

### Backend Changes

**File:** `supabase/functions/_shared/santorini.ts`

Modified `createInitial()` to accept a starting player parameter:

```typescript
static createInitial(startingPlayer: number = 0): { engine: SantoriniEngine; snapshot: SantoriniSnapshot } {
  const player = startingPlayer === 1 ? 1 : 0; // Ensure it's 0 or 1
  const engine = new SantoriniEngine(baseState, player, ...);
  // ...
}
```

**File:** `supabase/functions/create-match/index.ts`

1. Added `StartingPlayer` type and field to `CreateMatchRequest`:
```typescript
type StartingPlayer = 'creator' | 'opponent' | 'random';

interface CreateMatchRequest {
  // ...existing fields...
  startingPlayer?: StartingPlayer;
}
```

2. Added logic to convert the option to a player index:
```typescript
let startingPlayerIndex = 0; // 0 = creator, 1 = opponent
if (startingPlayerOption === 'opponent') {
  startingPlayerIndex = 1;
} else if (startingPlayerOption === 'random') {
  startingPlayerIndex = Math.random() < 0.5 ? 0 : 1;
}
```

3. Pass the index to `SantoriniEngine.createInitial(startingPlayerIndex)`

### Frontend Changes

**File:** `web/src/hooks/useMatchLobby.ts`

Added `StartingPlayer` type and field to `CreateMatchPayload`:
```typescript
export type StartingPlayer = 'creator' | 'opponent' | 'random';

export interface CreateMatchPayload {
  // ...existing fields...
  startingPlayer: StartingPlayer;
}
```

**File:** `web/src/components/play/PlayWorkspace.tsx`

1. Imported the `StartingPlayer` type
2. Added state: `const [startingPlayer, setStartingPlayer] = useState<StartingPlayer>('random');`
3. Added radio group to the form:

```tsx
<FormControl as={Stack} spacing={2}>
  <FormLabel fontSize="sm">Starting player</FormLabel>
  <RadioGroup value={startingPlayer} onChange={(value) => setStartingPlayer(value as StartingPlayer)}>
    <HStack spacing={4}>
      <Radio value="creator">You</Radio>
      <Radio value="opponent">Opponent</Radio>
      <Radio value="random">Random</Radio>
    </HStack>
  </RadioGroup>
</FormControl>
```

4. Included `startingPlayer` in the `onCreate` payload

---

## UI Location

The starting player selector appears in the "Create a match" form, positioned:
1. After "Visibility" (Public/Private)
2. Before "Rated game" switch
3. Before "Enable clock" switch

---

## Default Behavior

- **Default:** Random (50/50 chance)
- **Rationale:** Fair for both players, especially in rated games

---

## How It Works

### Game Creation Flow:

1. **User selects option** (You/Opponent/Random) in create form
2. **Frontend sends** `startingPlayer: 'creator' | 'opponent' | 'random'`
3. **Server converts** to player index:
   - `'creator'` → `0`
   - `'opponent'` → `1`  
   - `'random'` → `Math.random() < 0.5 ? 0 : 1`
4. **Engine creates** initial state with specified player
5. **Match stored** with `initial_state.player` set correctly
6. **Game starts** with chosen player moving first

### What the Opponent Sees:

- If creator chose "You", opponent sees they move second (Blue pieces to place second)
- If creator chose "Opponent", opponent sees they move first (Blue pieces to place first)
- If creator chose "Random", it's determined server-side when match is created

---

## Testing

### Test Cases:

**Test 1: Creator Starts**
```
1. Create match with "Starting player: You"
2. Join with second player
3. Verify creator (Player 1 / Blue) places pieces first
```

**Test 2: Opponent Starts**  
```
1. Create match with "Starting player: Opponent"
2. Join with second player
3. Verify opponent (Player 2 / Red) places pieces first
```

**Test 3: Random**
```
1. Create match with "Starting player: Random"
2. Join with second player
3. Either player should place first (check initial_state.player)
```

**Test 4: Edge Case - Invalid Value**
```
Server handles invalid values gracefully:
- Non-existent value → defaults to 'creator'
- Missing field → defaults to 'creator'
```

---

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `supabase/functions/_shared/santorini.ts` | Added parameter to `createInitial()` | ~5 |
| `supabase/functions/create-match/index.ts` | Added type, logic, and logging | ~20 |
| `web/src/hooks/useMatchLobby.ts` | Added type and interface field | ~3 |
| `web/src/components/play/PlayWorkspace.tsx` | Added UI form control | ~15 |
| **Total** | **~43 lines** | **4 files** |

---

## Benefits

- ✅ **Fairness:** Random option ensures no advantage
- ✅ **Flexibility:** Players can choose based on preference
- ✅ **Strategy:** Advanced players can experiment with opening strategies
- ✅ **UX:** Clear, simple UI with sensible default

---

## Future Enhancements

1. **Show starting player in match listing**
   - Add badge: "You start" / "Opponent starts"
   
2. **Statistics tracking**
   - Win rate by starting player
   - Helps analyze first-move advantage

3. **Tournament modes**
   - Alternate starting player in rematches
   - Swiss pairings with balanced starts

---

## Deployment Notes

- No database schema changes required
- Backward compatible (uses default if field missing)
- Works with existing matches
- Edge function update required (redeploy)

---

## Status

✅ **Implemented and tested**  
✅ **Build passing**  
✅ **Ready for deployment**

The starting player selection feature is complete and ready to use!

