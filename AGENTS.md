# AGENTS.md

## Cursor Cloud specific instructions

### Project state

This is an early-stage repo. As of the M1 milestone it is a **Vite + React + TypeScript**
skeleton (see `docs/implementation-plan.md` for the M1–M7 roadmap). The battle engine, AI,
and full battle UI/animations described in `docs/` are **not implemented yet** — `src/engine`,
`src/store`, and `src/ui` currently hold core types plus a small placeholder demo scene.

### Services

There is a single service: the Vite dev web app. Standard commands live in `package.json`
`scripts` — use those rather than duplicating them here:

- `npm run dev` — dev server on `http://localhost:5173` (HMR enabled).
- `npm test` — Vitest (jsdom). `npm run build` — `tsc -b` type-check then `vite build`.
- `npm run lint` — ESLint. `npm run format` / `npm run format:check` — Prettier.

### Non-obvious notes

- Toolchain is intentionally very new: React 19, Vite 8, ESLint 10 (flat config only),
  TypeScript 6. ESLint 10 rejects legacy array-string `plugins`, so `eslint.config.js`
  wires `react-hooks` / `react-refresh` as plugin **objects** manually — do not switch back
  to the plugins' bundled `recommended-latest` preset (it uses the old array form and breaks).
- `eslint.config.js` enforces the architecture rule from `docs/architecture.md`:
  files under `src/engine/**` may not import React, `react-dom`, `framer-motion`, `zustand`,
  or anything from `../ui`/`../store`. Keep the engine pure TS.
- Prettier is scoped by `.prettierignore` to skip `docs/` (pre-existing Chinese design docs).
  Don't reformat `docs/`; `npm run format:check` intentionally ignores them.
- TS uses `verbatimModuleSyntax` + `allowImportingTsExtensions`, so intra-`src` imports must
  include the `.ts`/`.tsx` extension and type-only imports must use `import type`.
