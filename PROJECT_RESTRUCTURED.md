# ✅ Project Restructured — Santorini Only

## 🎯 Summary

The repository now ships a **single static web application** for playing the classic (no-gods) variant of Santorini against an AlphaZero-style AI. All other board games and the optional god-mode assets have been removed to keep the footprint lean and the experience focused.

## 📦 What Changed

- 🗑️ Removed legacy game folders (`splendor/`, `smallworld/`, `minivilles/`, `thelittleprince/`, …)
- 🗑️ Deleted alternate Santorini entry points (`santorini_with_gods.html`, `constants_withgods.js`, `SantoriniConstantsWithGods.py`)
- 🗑️ Pruned documentation that referenced the multi-game setup
- 🧹 Simplified the UI to remove god-power toggles
- 🧠 Streamlined the Python logic so only the no-god rules remain
- 🧾 Rewrote `README.md` to describe the Santorini-only workflow

## 📂 Current Layout

```
.
├── common/                  # Shared JS utilities (Pyodide bridge, base classes)
├── santorini/               # Santorini-specific JS + Python
│   ├── main.js              # Front-end logic
│   ├── proxy.py             # Pyodide bridge
│   ├── SantoriniGame.py     # Game adapter
│   ├── SantoriniLogicNumba.py # No-god rule implementation
│   └── SantoriniConstantsNoGod.py
├── santorini.html           # Single application entry point
├── index.html               # Redirects to santorini.html
├── serve.sh                 # Local static-server helper
└── README.md                # Updated documentation
```

## 🚀 Developing & Deploying

1. Serve locally with `python3 -m http.server 8000` (or `./serve.sh`).
2. Open `http://localhost:8000/santorini.html` and refresh as you iterate.
3. Deploy the folder to any static host (GitHub Pages, Netlify, S3, …).

The code base is now lightweight, deterministic and easy to maintain—perfect for a focused Santorini experience.
