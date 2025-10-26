# 🌐 Deployment Guide

The Santorini web client is a Vite + React single-page application. Running
`npm --prefix web run build` emits a fully static bundle in `dist/` that can be
served by any CDN or static hosting platform. The only runtime dependency is
Supabase, which the client reaches over HTTPS/WebSockets using the URL and anon
key you configure.

This guide covers two zero-cost hosting options:

1. **GitHub Pages** – builds and publishes the static bundle on every push.
2. **Supabase Hosting (beta)** – serves the bundle directly from your Supabase
   project alongside the database and auth stack you already configured.

Regardless of the platform, make sure the ONNX evaluator is available at build
and at runtime. The simplest approach is to download
`model_no_god.onnx` from the latest release during your deploy step and place it
under `web/public/santorini/` before running `npm run build`.

---

## 1. Deploying to GitHub Pages

GitHub Pages can host the static `dist/` bundle automatically using a workflow.
The supplied workflow publishes the site whenever `main` is updated.

### 1.1. Configure repository secrets

Add the following secrets under **Settings → Secrets and variables → Actions**:

- `SUPABASE_URL` – your project URL, e.g. `https://xyzcompany.supabase.co`.
- `SUPABASE_ANON_KEY` – the anon key from the Supabase dashboard.

The workflow also downloads the Santorini model at build time. If you prefer to
mirror the file yourself, change the download URL accordingly.

### 1.2. Optional: override the base path

When a Vite app is hosted under a subpath (e.g. `https://username.github.io/<repo>`),
it must be built with the matching base. Set the repository variable
`PUBLIC_BASE_PATH` to `/<repo>/` or edit the workflow’s `VITE_PUBLIC_BASE_PATH`
value directly. The `base` option in `vite.config.ts` reads from
`VITE_PUBLIC_BASE_PATH`, defaulting to `/` for user/organization pages.

### 1.3. Enable GitHub Pages

1. Push the workflow file to `main`.
2. In the repository settings, go to **Pages** and pick **GitHub Actions** as the
   source. GitHub automatically creates the `github-pages` environment on the
   first deploy.

After the initial run completes, the site is served from
`https://<username>.github.io/<repo>/`. Subsequent pushes to `main` re-run the
workflow and update the hosted bundle.

---

## 2. Deploying with Supabase Hosting (beta)

Supabase Hosting lets you serve static assets from the same platform powering
your database. The free tier is sufficient for the web bundle.

### 2.1. Install and log in with the Supabase CLI

```bash
npm install -g supabase
supabase login
```

### 2.2. Initialise hosting in the repository

```bash
supabase init      # generates supabase/config.toml if you have not created it yet
supabase link --project-ref <project-ref-from-dashboard>
```

Inside the generated `supabase/config.toml`, add an `apps` entry:

```toml
[apps.santorini-web]
path = "dist"
```

### 2.3. Build and deploy

```bash
npm --prefix web install
curl -L -o web/public/santorini/model_no_god.onnx \
  https://github.com/cestpasphoto/alpha-zero-general-santorini/releases/latest/download/model_no_god.onnx
VITE_SUPABASE_URL="https://xyzcompany.supabase.co" \
VITE_SUPABASE_ANON_KEY="<anon-key>" \
npm --prefix web run build
supabase deploy santorini-web
```

Supabase serves the uploaded assets from a generated domain similar to
`https://<project-ref>.supabase.co`. You can attach a custom domain through the
Supabase dashboard if desired.

---

## 3. Other static hosts

Because the build output is static, you can deploy to Netlify, Vercel, Cloudflare
Pages, Render, or any other provider. The key requirements are:

1. Run `npm --prefix web run build` with the necessary environment variables
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optional
   `VITE_PUBLIC_BASE_PATH`).
2. Ensure the ONNX model file is present under `dist/santorini/model_no_god.onnx`
   after the build step.
3. Serve the resulting `dist/` directory.

Refer to the hosting platform’s documentation for configuring environment
variables and upload steps.
