# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the TypeScript app: UI in `components/`, Supabase and board hooks in `hooks/`, game logic in `game/`, styling tokens in `theme/`, and shared helpers in `lib/` and `utils/`.
- Tests live beside their targets under `src/**/__tests__`; use `src/game/__tests__/localReducer.test.ts` as the baseline layout.
- Static assets and HTML shells sit in `public/`, production bundles land in `dist/`, and TypeScript aliases (`@components/HeaderBar`) keep imports readable.

## Build, Test, and Development Commands
- `npm run dev` starts the Vite dev server on port 5173 with hot reload.
- `npm run build` type-checks via `tsc` and emits an optimized bundle into `dist/`.
- `npm run preview` serves the production bundle locally for pre-release smoke tests.
- `npm run test` executes the Vitest suite; append `--watch` for iterative runs.

## Coding Style & Naming Conventions
- Favor function components with Chakra UI primitives; push shared state or effects into custom hooks.
- Keep two-space indentation and trailing commas consistent with existing files; enable your editor’s formatter to avoid drift.
- Components and files use PascalCase (`GameBoard.tsx`), hooks are camelCase prefixed with `use`, and helper utilities remain lower camelCase. Prefer the configured path aliases over long relative paths.

## Testing Guidelines
- Vitest (jsdom) is the default runner; add new `*.test.ts` or `*.test.tsx` files in a sibling `__tests__` directory.
- Mock Supabase and network effects, and focus on deterministic board positions when covering reducers, selectors, and hooks.
- Run `npm run test` before every PR and resolve or document all failures.

## Commit & Pull Request Guidelines
- Match current history with concise, imperative commit subjects such as `Add lobby matchmaking guard`; rebase to keep commits focused.
- PRs should outline scope, testing performed, linked issues, and UI screenshots or GIFs when screens change.
- Call out required env vars, migrations, or follow-up work directly in the PR body.

## Environment & Configuration
- Copy `.env.example` to `.env.local` for local secrets and keep real credentials out of git.
- Coordinate Supabase configuration or schema changes with backend maintainers and document any new RPCs.
- Update this guide whenever scripts, directories, or workflows change meaningfully.
