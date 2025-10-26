# 🏛️ Santorini (No Gods) — AlphaZero Web UI

Play the classic Santorini board game against a Monte Carlo Tree Search (MCTS) + neural network opponent directly in your browser. This repository contains a **single, streamlined experience** focused on the standard no-gods rule set. Everything runs client-side thanks to [Pyodide](https://pyodide.org/) and [ONNX Runtime](https://onnxruntime.ai/), so there is nothing to install or compile.

## ✨ Features

- 🤖 **In-browser AI** powered by AlphaZero-style self-play training
- 🎚️ **Adjustable difficulty** by tuning the number of MCTS simulations
- 📊 **Live evaluation bar** that visualises who is ahead at a glance
- 🧩 **Multiple game modes**: play first, play second, hot-seat, or let the AI play itself
- 📱 **Responsive UI** built with Fomantic UI and tested on desktop & mobile

## 🚀 Quick start

```bash
# Serve the static files
python3 -m http.server 8000

# Then open http://localhost:8000/santorini.html
```

Or launch the helper script:

```bash
./serve.sh            # defaults to port 8000
./serve.sh 9000       # serve on a custom port
```

On first load the browser fetches Pyodide, ONNX Runtime and the Santorini model (~20s on a typical connection). Subsequent loads are instant thanks to caching.

## 🧑‍💻 Development workflow

Santorini combines JavaScript, Python and ONNX models. The most common development tasks are:

1. **Modify the UI / UX** in [`santorini.html`](santorini.html) and [`santorini/main.js`](santorini/main.js).
2. **Tweak the shared UI helpers** in [`common/game.js`](common/game.js) (e.g. adding a new button or status message).
3. **Update the Python game logic** under `santorini/`:
   - [`SantoriniGame.py`](santorini/SantoriniGame.py) exposes the game to the AI infrastructure.
   - [`SantoriniLogicNumba.py`](santorini/SantoriniLogicNumba.py) implements the rules (movement, building, victory checks) for the no-god variant.
   - [`proxy.py`](santorini/proxy.py) bridges JavaScript and Python inside Pyodide.

The UI loads `santorini/constants_nogod.js`, which in turn selects the Python constants file, so updating those constants keeps JavaScript and Python in sync.

When iterating locally:

1. Run `python3 -m http.server 8000` (or `./serve.sh`).
2. Open `http://localhost:8000/santorini.html`.
3. Make changes and refresh the page—Pyodide will hot-reload Python modules on demand.

## 🌐 Deploying

The project is a static site: deploy the repository as-is to any static host (GitHub Pages, Netlify, S3, …). The entry point is [`santorini.html`](santorini.html); [`index.html`](index.html) simply redirects there.

No build step is required, but make sure `model_no_god.onnx` is available alongside the code if you are packaging the model.

## 📂 Repository layout

```
.
├── common/                  # Shared browser utilities (game framework, AI helpers)
├── santorini/               # Santorini-specific JS + Python logic
│   ├── main.js              # Front-end logic & UI bindings
│   ├── proxy.py             # Pyodide bridge between JS and Python
│   ├── SantoriniGame.py     # Game adapter for AlphaZero-style agents
│   ├── SantoriniLogicNumba.py # Core no-god rules implementation
│   ├── SantoriniConstantsNoGod.py # Action encoding helpers
│   └── model_no_god.onnx    # (Expected location) pretrained policy/value network
├── santorini.html           # Main UI entry point
├── index.html               # Redirects to santorini.html
└── serve.sh                 # Convenience script to run a local static server
```

## 🙏 Credits

- Original AlphaZero implementation: [alpha-zero-general](https://github.com/suragnair/alpha-zero-general)
- Web UI and training data: [cestpasphoto](https://github.com/cestpasphoto)
- This pared-down experience focuses exclusively on the no-god Santorini variant.

## 📝 License

This project is distributed under the terms of the [MIT License](LICENSE).
