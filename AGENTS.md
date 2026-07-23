# AGENTS.md

## Cursor Cloud specific instructions

### Project state

First-version battle system (M1–M7) is implemented, and the default match now uses the
**catalog hell-warlock themed decks** (base card text from `docs/card-catalog.md`, no upgrades):
pure-TS engine (`createBattle` / `playCard` / `useSkill` / `endTurn` / `runAutoBattle` /
`runEnemyTurn`) with discard/graveyard, board-slot rituals (HP = execution count; sacrifice
threshold triggers; immune to damage; drag-reorderable), global hell field, multi-cast spells that
stay in hand until casts are exhausted (each hand play costs energy), shields, rebirth,
multi-attack, splash, and related keywords; **先锋** places tagged cards (地狱兽仪式) on
top of the deck after shuffle at battle start; 冥界牵引 returns a discard card to hand and
plays it once for free (remaining casts may stay in hand); Zustand store bridge with event
playback; playable battle UI (including discard pick for 冥界牵引) with Framer Motion; left-side
battle log. Default heroes: player **地狱术士**, enemy **训练假人** (no skill; enemy deck is
demon + golem guards only). Equipment / relics remain UI placeholders. Card upgrades, growth, unlocks, and
deckbuilding are out of scope for v1 — see `README.md` and `docs/implementation-plan.md`.

### Services

There is a single service: the Vite dev web app. Standard commands live in `package.json`
`scripts` — use those rather than duplicating them here:

- `npm run dev` — dev server on `http://localhost:5173/xu-bazaar/` (HMR; `base` is `/xu-bazaar/` for GitHub Pages).
- `npm test` — Vitest (jsdom). `npm run build` — `tsc -b` type-check then `vite build`.
- `npm run lint` — ESLint. `npm run format` / `npm run format:check` — Prettier.
- GitHub Pages: push to `main` runs `.github/workflows/deploy.yml` →
  `https://DaKingKong.github.io/xu-bazaar/` (Settings → Pages source must be GitHub Actions).

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
- `vite.config.ts` sets an absolute `root` via `import.meta.url` so Vitest does not break on
  Windows when the shell cwd uses a different drive-letter case (`d:` vs `D:`).

## Agent skills

### Issue tracker

Issues and specs live as markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` + `docs/adr/` at repo root). See `docs/agents/domain.md`.
