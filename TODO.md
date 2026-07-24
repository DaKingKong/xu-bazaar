# xu-bazaar — Project TODO

Living backlog for the whole game. First-version battle (M1–M7) is done; items below are post-v1 work, polish, and data hygiene. Keep this file honest: mark only work that still needs doing, and sync with `README.md` / `docs/implementation-plan.md` when milestones move.

---

## Current state (do not re-implement)

- Pure-TS battle engine: `createBattle` / `playCard` / `useSkill` / `endTurn` / `runAutoBattle` / `runEnemyTurn`
- Discard/graveyard, rituals, hell field, multi-cast spells, shields, rebirth, multi-attack, splash, vanguard, etc.
- Zustand bridge + playable battle UI (Framer Motion, discard pick, battle log)
- Default match: player **地狱术士** + catalog hell-themed deck; enemy **训练假人** + demon/golem guards
- Equipment / relics / upgrades / growth / unlocks / deckbuilding: **not** implemented (UI placeholders only where noted in README)

Design docs: `docs/architecture.md`, `docs/battle-design.md`, `docs/data-model.md`, `docs/card-catalog.md`, `docs/keyword-catalog.md`.

---

## Data convention (required)

**Put static game content in JSON, not TypeScript object literals.**

| Content | Preferred location | Notes |
| --- | --- | --- |
| Cards + heroes | `src/data/catalog.json` | Done: single file, Zod-validated, 1:1 `CardDef`/`HeroDef` |
| Decks / encounter presets | still TS recipes in `src/data/index.ts` (later: same catalog or decks JSON) | `defId` lists |
| Keywords metadata (display names, tooltips) | `src/data/keywords.json` | Engine behavior stays in TS |
| Locales / copy (optional later) | `src/data/i18n/*.json` | Keep strings out of components when practical |

**Rules:**

1. **Author in JSON** — card stats, names, descriptions, costs, keywords tags, upgrade lines, deck lists, hero baselines. Source of truth for designers; easy to diff and import from spreadsheets/CSV.
2. **Load + validate in TS** — thin loaders under `src/data/` parse JSON, assert shape (zod or hand-written guards), export typed maps (`CARD_DB`, `HERO_DB`). Engine keeps consuming `CardDef` / `HeroDef`; it must not care whether the def came from JSON or a test fixture.
3. **Logic stays in engine** — keywords, rituals, AI, fatigue, etc. remain TypeScript. JSON may *reference* keyword ids / effect tags; it must not embed executable code.
4. **Do not grow `src/data/index.ts` as a mega-literal catalog** — migrate existing hardcoded `CARD_DEFS` / hero objects into JSON as part of the data workstream below.
5. **Runtime debug / tweak config** (animation timings, particle knobs, etc.) is also JSON-shaped (defaults + import/export); see “Tooling & debug” below. That is separate from card/hero content.

---

## Workstreams

### 1. Data layer → JSON

- [x] Extract cards + heroes into `src/data/catalog.json` (aligned with catalog base text; no deprecated card `damage`/`heal`)
- [x] Zod load + validation; typed `CARD_DB` / `HERO_DB` exports
- [x] Dev config UI: search, per-def JSON edit, Save → localStorage (version = `package.json`), export full JSON, Reset; load once on refresh
- [x] Husky pre-commit bumps `package.json` patch each commit
- [ ] Extract default player/enemy deck lists into catalog (or decks JSON)
- [ ] Fixture cards used only in tests may stay inline TS or use small JSON fixtures under `src/test/` / `src/data/__fixtures__/`
- [x] Document the JSON shape briefly in `docs/data-model.md`

### 2. Battle / content completeness

- [ ] Card upgrades (强化 1 / 2) from catalog — data in JSON, apply as overlays or alternate defs
- [ ] Remaining catalog cards not yet in the live pool
- [ ] More heroes beyond 地狱术士 / 训练假人
- [ ] Token / parent-record generation fully driven from data where still hardcoded
- [ ] Enemy AI heuristics for newer targeting modes (discard pick, ally destroy, etc.) if still rough

### 3. Meta systems (post-battle)

- [ ] Equipment slot: real effects hooked into engine settlement (not just UI)
- [ ] Relics: list + hooks + data defs (JSON)
- [ ] Character growth / meta progression
- [ ] Card unlock pool + deckbuilding UI
- [ ] Persist unlocks / decks (localStorage or later backend)

### 4. UI / UX polish

- [ ] Richer card presentation (keywords, rarity, upgrade indicators) from JSON metadata
- [ ] Better targeting / invalid-action feedback
- [ ] Encounter / mode select (beyond single default match)
- [ ] Accessibility / mobile layout pass
- [ ] Optional: settings screen for non-debug preferences

### 5. Tooling & debug (GitHub Pages–friendly)

Runtime tuning without editing source (collaborators on Pages):

- [ ] Default config object with top-level `version` (JSON or TS defaults that serialize to JSON)
- [ ] ConfigManager: load / save / reset / import / export
- [ ] Single runtime config the app reads; Tweakpane (or similar) binds to it under `?debug`
- [ ] Debounced auto-save to `localStorage` (~500 ms)
- [ ] Import validates `version`, replaces runtime config, refreshes pane, persists
- [ ] Out of scope for MVP: presets, undo/redo, shareable URLs, config diff

Suggested layout:

```text
src/
  config/
    defaultConfig.ts      # or defaultConfig.json + loader
    ConfigManager.ts
    ConfigStorage.ts
    ConfigExporter.ts
    ConfigSchema.ts
  debug/
    DebugPanel.tsx
  data/
    cards/
    heroes.json
    decks/
```

### 6. Docs & process

- [ ] Keep README 进度 / AGENTS.md Project state / implementation-plan DoD in sync on each meaningful commit
- [ ] When JSON schemas land, update architecture “data” section to say JSON + typed loaders
- [ ] Triage new work via `.scratch/<feature-slug>/` when non-trivial (see `docs/agents/issue-tracker.md`)

---

## Priority suggestion

1. Deck lists into catalog (finish remaining data centralization)
2. Catalog completeness + upgrades
3. Meta (equipment / relics / unlocks / deckbuilding)
4. Debug config MVP for animation/gameplay knobs (separate from content catalog UI)
5. UI polish as needed for playability

---

## Out of scope (for now)

- Multiplayer / PVP
- Server-authoritative battles
- Full i18n pipeline (unless copy volume demands it)
- Canvas/Pixi battlefield rewrite
