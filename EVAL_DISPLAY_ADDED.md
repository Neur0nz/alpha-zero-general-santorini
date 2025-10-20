# AI Evaluation Display - Web UI Enhancement

## 🎉 What's New

The Santorini web UI now displays **AI position evaluation** in real-time! Just like the terminal version, you can now see who's winning at any point in the game.

## ✨ Features

### Visual Evaluation Bars
- **Color-coded progress bars** showing position strength
- **Numerical values** from -1.0 (losing) to +1.0 (winning)
- **Win probability** shown as percentage (0% to 100%)
- **Automatic updates** after each AI move

### Color Coding
- 🟢 **Green** (> +0.6): Strongly winning
- 🔵 **Blue** (+0.2 to +0.6): Winning
- 🟡 **Yellow** (-0.2 to +0.2): Equal/balanced
- 🟣 **Purple** (-0.6 to -0.2): Losing
- 🔴 **Red** (< -0.6): Strongly losing

## 📸 What It Looks Like

```
🤖 AI EVALUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Player 0 (You):     [████████████████████████░░░░░░░░] +0.700 (85%)
Player 1 (AI):      [███████░░░░░░░░░░░░░░░░░░░░░░░░░] -0.700 (15%)
```

The evaluation appears between the player descriptions and the game board.

## 🔧 Files Modified

### 1. Python Backend (`santorini/proxy.py`)
**Changes:**
- Added `current_eval` global variable to store evaluation values
- Modified `guessBestAction()` to capture `q` values from MCTS
- Added `get_current_eval()` function to expose evaluation to JavaScript
- Added console logging of evaluation values

**Key Addition:**
```python
async def guessBestAction():
    # ...
    probs, q, _ = await mcts.getActionProb(...)  # Now captures q!
    current_eval = [float(q[0]), float(q[1]) if len(q) > 1 else -float(q[0])]
    print(f'AI Evaluation: Player 0: {current_eval[0]:+.3f}, Player 1: {current_eval[1]:+.3f}')
    # ...
```

### 2. JavaScript Game Logic (`santorini/main.js`)
**Changes:**
- Added `getEvalBarColor(value)` - determines bar color based on evaluation
- Added `getEvalBarHTML(value, width)` - generates HTML for evaluation bar
- Added `refreshEvaluation()` - async function to fetch and display evaluation

**Key Addition:**
```javascript
async function refreshEvaluation() {
    const evalValues = game.py.get_current_eval().toJs({create_proxies: false});
    // Generate and display evaluation bars
}
```

### 3. Common Game Framework (`common/game.js`)
**Changes:**
- Modified `ai_play_if_needed_async()` to call `refreshEvaluation()` after AI moves
- Made evaluation display game-agnostic (only calls if function exists)

**Key Addition:**
```javascript
// Refresh evaluation if function exists (game-specific)
if (typeof refreshEvaluation === 'function') {
    await refreshEvaluation();
}
```

### 4. HTML Pages
**Changed Files:**
- `santorini_with_gods.html` - Added evaluation container
- `santorini.html` - Added evaluation container

**Key Addition:**
```html
<!-- Evaluation Display -->
<div id="evalContainer" style="display: none;"></div>
```

## 🚀 How to Use

### Option 1: Test Locally

```bash
# From the monorepo root
./serve_web_ui.sh

# Open in browser:
# http://localhost:8000/santorini_with_gods.html
```

### Option 2: Deploy to GitHub Pages

The changes are ready to be deployed. Simply push the `web-ui/` folder to a GitHub Pages repository and the evaluation display will work automatically.

### Option 3: Play Online

If these changes are merged to the live site:
- https://cestpasphoto.github.io/santorini_with_gods.html
- https://cestpasphoto.github.io/santorini.html

## 🎮 User Experience

1. **Start a game** - evaluation display is hidden initially
2. **AI makes first move** - evaluation appears showing position assessment
3. **Every AI move** - evaluation updates automatically
4. **You make a move** - evaluation persists (shows last AI assessment)
5. **Game ends** - evaluation shows final position

## 🔍 Technical Details

### How It Works

1. **Python Side**: MCTS returns `(probs, q, is_full_search)` where `q` is the evaluation
2. **Capture**: `proxy.py` stores `q` values in `current_eval` global
3. **Expose**: `get_current_eval()` makes values accessible to JavaScript
4. **JavaScript Side**: Calls `game.py.get_current_eval()` after AI moves
5. **Display**: Renders color-coded HTML bars with values

### Data Flow

```
MCTS.getActionProb() 
    → returns (probs, q, is_full_search)
    → proxy.guessBestAction() captures q
    → stores in current_eval
    → JavaScript calls get_current_eval()
    → refreshEvaluation() renders bars
    → Updates evalContainer div
```

### Evaluation Values

- **q[0]**: Evaluation from Player 0's perspective (-1 to +1)
- **q[1]**: Evaluation from Player 1's perspective (usually = -q[0])
- **Normalization**: Converted to 0-100% for display

## 🎨 Styling

The evaluation display uses:
- **Fomantic UI** segments for container
- **Inline CSS** for progress bars
- **Gradient background** for visual appeal
- **Responsive design** works on mobile and desktop

## 🐛 Debugging

If evaluation doesn't appear:

1. **Check console** for errors (F12 in browser)
2. **Verify Python is loaded**: Look for "AI Evaluation:" in console after AI moves
3. **Check evalContainer exists**: `document.getElementById('evalContainer')`
4. **Test get_current_eval()**: In console: `game.py.get_current_eval().toJs({create_proxies: false})`

## 🔄 Compatibility

### Works With:
- ✅ Santorini (with gods)
- ✅ Santorini (without gods)
- ✅ All difficulty levels
- ✅ Human vs AI mode
- ✅ AI vs Human mode
- ✅ AI vs AI mode (shows both perspectives)

### Browser Support:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## 📝 Future Enhancements

Possible improvements:
- [ ] Show evaluation history as a graph
- [ ] Display evaluation for each possible move (before selection)
- [ ] Add tooltips explaining evaluation values
- [ ] Allow toggling evaluation display on/off
- [ ] Show evaluation confidence/uncertainty
- [ ] Add evaluation to other games (Splendor, Smallworld)

## 🤝 Contributing

To add evaluation display to other games:

1. Modify `{game}/proxy.py` to capture `q` values
2. Add `get_current_eval()` function
3. Add `refreshEvaluation()` function to `{game}/main.js`
4. Add `evalContainer` div to HTML
5. Test!

## 📚 Related Documentation

- **Backend Eval Display**: `../santorini/EVAL_DISPLAY_README.md`
- **Monorepo Overview**: `../MONOREPO_README.md`
- **Quick Reference**: `../MONOREPO_QUICK_REFERENCE.md`

---

**Note**: This enhancement brings the web UI's capabilities closer to the terminal version, making AI insights available to all players, regardless of platform!

