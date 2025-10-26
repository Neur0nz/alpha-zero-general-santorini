# 🏛️ Ascent Web Demo

The Santorini client now runs on a modern [Vite](https://vitejs.dev/) +
[React](https://react.dev/) stack with [Chakra UI](https://chakra-ui.com/) for
styling. Game logic still executes client-side through
[Pyodide](https://pyodide.org/) and [ONNX Runtime Web](https://onnxruntime.ai/),
so once the assets are cached you can continue playing offline.

## 🚀 Quick start

```bash
# Install dependencies and launch the dev server
./serve.sh

# The app will be available on http://localhost:5173
```

> ℹ️ The first run downloads Pyodide, ONNX Runtime Web and the Santorini model,
> so expect a 15–20s warm up.

## 🔐 Enabling online play with Supabase

The Practice tab works out of the box, but the Play and Analyze workspaces rely
on Supabase for authentication, lobby management, and match storage. If you
haven't connected a Supabase project yet, follow the step-by-step guide in
[`SUPABASE_SETUP.md`](SUPABASE_SETUP.md). It covers:

- creating the project and enabling email magic-link sign-in,
- applying the `players`, `matches`, and `match_moves` schema,
- adding Row Level Security policies so only participants can modify a match,
- turning on Realtime for lobby updates, and
- configuring the required `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  environment variables (see `web/.env.example`).

Once Supabase is configured, open the Play tab and submit your email address to
receive a magic link. Signing in automatically creates your player profile and
unlocks match creation, lobby browsing, and online play.

### Preparing the neural-network model

The AlphaZero evaluator is loaded from `web/public/santorini/model_no_god.onnx`.
The file is not checked into the repository to keep the footprint small. Grab
the model from the latest release or download it manually:

```bash
curl -L -o web/public/santorini/model_no_god.onnx \
  https://github.com/cestpasphoto/alpha-zero-general-santorini/releases/latest/download/model_no_god.onnx
```

## 🧩 Gameplay features

- Play Santorini without god powers against an AlphaZero-style agent.
- Adjustable difficulty via MCTS simulation count.
- Responsive board rendered with Chakra UI components.
- Evaluation bar, top-move explorer and move history modal.
- Undo/redo support with AI autopilot when appropriate.

## 🛠️ Development workflow

The front-end source now lives under `web/` and is organised like a typical
Vite/React project:

1. `npm --prefix web install` (handled automatically by `serve.sh`).
2. `npm --prefix web run dev` to start the dev server with hot-module reload.
3. Edit TypeScript/React files under `web/src/`.
4. Python gameplay code is copied into the Vite public directory and reloaded by
   Pyodide when changed.

### Useful paths

- `web/src/App.tsx` – Chakra-based layout and screen composition.
- `web/src/hooks/useSantorini.ts` – Pyodide/ONNX orchestration and game state
  management.
- `web/src/game/` – Port of the legacy Santorini game controller.
- `web/public/santorini/` – Python sources served to Pyodide.

## 📦 Repository layout

```
.
├── README.md
├── index.html                # Landing page pointing to the Vite app
├── serve.sh                  # Boots Vite dev server
├── web/                      # Vite + Chakra UI front-end
│   ├── public/
│   │   └── santorini/        # Python files + ONNX model (download separately)
│   └── src/
└── santorini/                # Legacy assets kept for reference
```

## 🧪 Continuous integration

Production bundles are emitted to `dist/` via `npm --prefix web run build`. Any
CI workflow should switch to the Vite commands (`npm run build`, `npm run test`
if applicable) instead of serving static files directly.

## 🚢 Deployment

The Vite build emits static assets, so you can host the site on any CDN or
static provider. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for:

- an end-to-end GitHub Pages workflow that rebuilds on each push to `main`, and
- instructions for publishing the bundle via Supabase Hosting or other
  providers.

## 📝 License

This project inherits the original license from
[`alpha-zero-general`](https://github.com/suragnair/alpha-zero-general). See
[LICENSE](LICENSE) for details.
