# 🏛️ Santorini AlphaZero Web Demo

This repository hosts a browser-based Santorini client powered by AlphaZero.
Everything runs locally in your browser thanks to [Pyodide](https://pyodide.org/)
and [ONNX Runtime Web](https://onnxruntime.ai/). The project has been trimmed
down to a single **no-god** variant of Santorini to keep the footprint and
maintenance surface minimal.

## 🚀 Quick start

```bash
# Serve the static files (defaults to port 8000)
./serve.sh

# Or use Python directly
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. The landing page redirects to the Santorini
interface under `/santorini/index.html`.

The first load takes roughly 10–20 seconds while Pyodide and the ONNX model are
downloaded. Subsequent loads are instant thanks to browser caching.

## 🧩 Gameplay features

- Play Santorini without god powers against an AlphaZero-style agent.
- Adjustable difficulty via MCTS simulation count.
- Move history viewer and undo support.
- Evaluation bar displaying the current AI assessment of the position.

Everything happens client-side: once assets are cached you can disconnect from
the network and continue playing offline.

## 🛠️ Development workflow

1. Run a static file server (`./serve.sh` or `python3 -m http.server 8000`).
2. Make changes under the `santorini/` directory.
3. Refresh the browser; Pyodide re-fetches the updated Python sources
   automatically.

Useful files:

- `santorini/index.html` – App entry point and UI layout.
- `santorini/frontend.js` – Lightweight web harness (Pyodide bootstrapping,
  common UI actions).
- `santorini/main.js` – Santorini-specific UI logic.
- `santorini/proxy.py` – Bridge between JavaScript and the Python game logic.
- `santorini/SantoriniLogicNumba.py` – Core rules implementation (no-god mode).
- `santorini/SantoriniConstants.py` – Action encoding helpers and symmetry
  permutations.

## 📦 Repository layout

```
.
├── README.md
├── index.html                # Redirects to the Santorini app
├── serve.sh                  # Convenience server script
└── santorini/
    ├── constants_nogod.js
    ├── frontend.js
    ├── index.html            # Main UI
    ├── main.js
    ├── proxy.py
    ├── SantoriniConstants.py
    ├── SantoriniDisplay.py
    ├── SantoriniGame.py
    ├── SantoriniLogicNumba.py
    ├── Game.py
    └── MCTS.py
```

## 🚢 Deployment

The site is fully static and can be deployed to any static hosting provider
(e.g. GitHub Pages, Netlify, Vercel). Simply upload the repository contents and
point a browser to `index.html`.

## 📝 License

This project inherits the original license from
[`alpha-zero-general`](https://github.com/suragnair/alpha-zero-general). See
[LICENSE](LICENSE) for details.
