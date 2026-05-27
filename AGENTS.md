# Project Notes for Codex

## Project Shape

- This is a Vite 7 + React 19 app for a junior-high English vocabulary study flow.
- Routing lives in `src/App.jsx` and uses `HashRouter`; keep routes compatible with GitHub Pages under `base: '/word-builder2/'`.
- Most app state is in Zustand stores under `src/stores/`.
- Supabase access is centralized through `src/lib/supabase.js`; user data is protected by RLS in `supabase/migration.sql`.
- DeepSeek generation must go through `supabase/functions/deepseek-proxy/`; do not add direct browser calls to DeepSeek.

## Commands

```powershell
npm run dev
npm run build
npm run lint
npm run preview
```

Run `npm run lint` after code changes. Run `npm run build` when routing, deployment base, Supabase imports, or broad UI behavior changes.

## Environment and Secrets

- Frontend env names are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Edge Function env names are `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `DEEPSEEK_API_KEY`.
- Never read, print, or commit actual `.env` values. Document variable names only.

## Data and Behavior Rules

- The canonical Supabase schema is `supabase/migration.sql`.
- Built-in wordlists are shared read-only data; user-owned tables are keyed by `user_id`.
- Learning state is unique by `user_id + word`, so duplicate English words across lists share one progress record.
- Daily study queue order is review, new learning, new-word review, then relapse words.
- New learning itself does not upgrade SRS level; review-style phases update level only when recall, spelling, and usage all pass.
- A failed recall or first spelling attempt adds the word to the same-day relapse queue.
- Florr support is a frontend theme in `src/stores/themeStore.js` plus optional built-in wordlist import; it must not change SRS behavior or user data shape.

## Documentation

- Keep `README.md` aligned with current setup, routes, env names, and Supabase initialization.
- Keep `requirementV1.md` as product/behavior reference; if implementation diverges, update the stale factual statement instead of adding a changelog note.
