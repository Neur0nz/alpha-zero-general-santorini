# 🎮 AlphaZero Board Games - Web UI

Play board games against powerful AlphaZero-based AI **entirely in your browser**! No installation required, all computation runs client-side.

## ✨ Features

- 🤖 **Powerful AI** - AlphaZero neural networks with MCTS
- 🌐 **Browser-Based** - Runs entirely in your browser (Python via Pyodide + ONNX.js)
- 📊 **NEW: AI Evaluation Display** - See real-time position assessment with color-coded bars
- 🎯 **Adjustable Difficulty** - From "Come on" to "God-like"
- 📱 **Mobile-Friendly** - Works on desktop and mobile

## 🎮 Supported Games

- **Santorini** ([play](santorini_with_gods.html)) - With god powers
- **Santorini** ([play](santorini.html)) - Classic version
- **Splendor** ([2p](splendor.html), [3p](splendor_3pl.html), [4p](splendor_4pl.html))
- **Small World** ([2p](smallworld.html), [3p](smallworld_3pl.html), [4p](smallworld_4pl.html))
- **Minivilles/Machi Koro** ([play](minivilles.html))
- **The Little Prince** ([play](tlp.html))
- **Wordle Solver** ([play](wordle.html))

## 🚀 Quick Start

### Option 1: Play Online

Visit the live version:
- 🌐 [https://cestpasphoto.github.io](https://cestpasphoto.github.io)

### Option 2: Run Locally

```bash
# Serve the files
python3 -m http.server 8000

# Open in browser
# http://localhost:8000/santorini_with_gods.html
```

Or use the provided script:
```bash
./serve.sh
```

## 🆕 AI Evaluation Display

The AI now shows you **who's winning** in real-time!

```
🤖 AI EVALUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Player 0 (You):     [████████████████████████░░░░░░░░] +0.700 (85%)
Player 1 (AI):      [███████░░░░░░░░░░░░░░░░░░░░░░░░░] -0.700 (15%)
```

**Color Coding:**
- 🟢 Green: Strongly winning
- 🔵 Blue: Winning
- 🟡 Yellow: Equal
- 🟣 Purple: Losing
- 🔴 Red: Strongly losing

See [EVAL_DISPLAY_ADDED.md](EVAL_DISPLAY_ADDED.md) for technical details.

## 🎯 How to Play

### Santorini Example

1. **Open** `santorini_with_gods.html` in your browser
2. **Wait** 10-20 seconds for AI to load (first time only)
3. **Select difficulty** from dropdown menu
4. **Click** highlighted cells to:
   - Select your worker
   - Choose where to move
   - Choose where to build
5. **Watch** the AI evaluate and respond
6. **Win** by reaching level 3!

### Game Modes

- **You vs AI** - You play first, AI responds
- **AI vs You** - AI plays first, you respond  
- **No AI** - Two human players
- **WarGames** - Watch AI play itself

## 🔧 Technical Details

### Technology Stack

- **Python in Browser** - [Pyodide](https://pyodide.org/) (WebAssembly)
- **ML Inference** - [ONNX Runtime](https://onnxruntime.ai/) (WebAssembly)
- **UI Framework** - [Fomantic UI](https://fomantic-ui.com/)
- **Game Logic** - Pure Python (Numba-compatible)
- **Neural Networks** - Pre-trained ONNX models

### Performance

- **First Load**: 10-20 seconds (downloading Pyodide + ONNX)
- **Subsequent Loads**: Instant (cached)
- **AI Speed**: 5-10 seconds per move (native difficulty)
- **Runs Offline**: After first load, works without internet

### How It Works

1. **Browser loads** Pyodide (Python) and ONNX Runtime (ML)
2. **Python code runs** in browser using WebAssembly
3. **Game logic** executes in Python (same code as training backend)
4. **Neural network** runs via ONNX.js for fast inference
5. **MCTS search** explores move tree and selects best action

## 📂 Project Structure

```
.
├── santorini/              # Santorini game files
│   ├── main.js             # JavaScript game logic
│   ├── proxy.py            # Python-JS bridge
│   ├── SantoriniGame.py    # Game rules
│   ├── MCTS.py             # AI search algorithm
│   └── *.onnx              # Pre-trained models
├── splendor/               # Splendor game files
├── smallworld/             # Small World game files
├── common/                 # Shared game framework
│   └── game.js             # Abstract game class
├── santorini.html          # Santorini (no gods)
├── santorini_with_gods.html # Santorini (with gods)
└── index.html              # Landing page
```

## 🎨 Customization

### Adjusting Difficulty

The dropdown menu controls MCTS simulations:
- **2-6**: Easiest (random-like)
- **25**: Easy (default)
- **100**: Medium
- **400**: Native (training level)
- **1600**: Boosted
- **6400**: God-like

More simulations = stronger AI but slower

### Modifying Games

Each game has its own directory with:
- `Game.py` - Game rules and logic
- `main.js` - UI and JavaScript interface
- `proxy.py` - Python-JavaScript bridge
- `*.onnx` - Neural network model

To modify a game, edit these files and refresh the browser.

## 🐛 Troubleshooting

### AI not loading
- Check browser console (F12) for errors
- Try a different browser (Chrome/Firefox recommended)
- Clear cache and reload

### Slow performance
- Reduce difficulty setting
- Close other browser tabs
- Use desktop instead of mobile

### Game won't start
- Ensure JavaScript is enabled
- Allow time for initial load (10-20 sec)
- Check network connection (first time only)

## 🤖 AI Strength

### Santorini
- >95% win rate vs [Ai Ai](http://mrraow.com/index.php/aiai-home/aiai/)
- 98+% win rate vs BoardSpace AI

### Splendor
- >90% win rate vs [Lapidary AI](https://github.com/inclement/lapidary-ai)

See individual game READMEs for detailed benchmarks.

## 📖 Documentation

- **Evaluation Display**: [EVAL_DISPLAY_ADDED.md](EVAL_DISPLAY_ADDED.md)
- **Training Backend**: For model training, see the [full repo](https://github.com/cestpasphoto/alpha-zero-general)

## 🙏 Credits

- **Original Concept**: [AlphaZero by DeepMind](https://arxiv.org/abs/1712.01815)
- **Base Implementation**: [alpha-zero-general](https://github.com/suragnair/alpha-zero-general)
- **Optimizations & Web UI**: [cestpasphoto](https://github.com/cestpasphoto)
- **Evaluation Display**: Added October 2025

## 📝 License

See [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Play Online**: [https://cestpasphoto.github.io](https://cestpasphoto.github.io)
- **Training Backend**: [https://github.com/cestpasphoto/alpha-zero-general](https://github.com/cestpasphoto/alpha-zero-general)
- **Report Issues**: [GitHub Issues](https://github.com/cestpasphoto/cestpasphoto.github.io/issues)

---

**Enjoy playing! 🎲🤖**
