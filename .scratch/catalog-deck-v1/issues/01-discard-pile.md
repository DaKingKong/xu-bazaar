# 01 — 弃牌堆生命周期

**What to build:** After a card is played, or a minion dies, the corresponding card sits in that side’s **discard pile** (墓地 = 弃牌堆). Callers and tests can observe discard contents. No catalog deck cutover yet.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Each side has a discard collection on battle state that starts empty for a fresh battle.
- [ ] Playing a spell/attack/minion card moves that instance into the acting side’s discard (not destroyed silently).
- [ ] When a board minion dies, an associated card instance ends up in that side’s discard (so later 冥界牵引 can see it).
- [ ] Existing draw / fatigue / play flows still pass their prior tests; fatigue mechanism card remains available under its pre-cutover id until ticket 12.
- [ ] Engine tests cover: play → discard grows; minion death → discard grows; discard is per-side.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
