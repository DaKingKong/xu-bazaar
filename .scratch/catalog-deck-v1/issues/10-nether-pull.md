# 10 — 冥界牵引

**What to build:** **冥界牵引** costs its mana, then the player chooses **any** card in their discard except the 冥界牵引 instance just played. That card **returns to hand** and is **played once for free** (consumes one cast). If the card still has casts remaining (施法数 > 1), it **stays in hand** for later paid plays; otherwise spells/attacks return to discard. Minions stay on board (discard only on death). UI must support discard targeting.

**Blocked by:** 01 — 弃牌堆生命周期; 03 — 施法数留手与基础法术; 06 — 入场、召唤物与重生; 07 — 仪式场地效果

**Status:** ready-for-agent

- [x] Playing 冥界牵引 with a non-empty legal discard presents discard targets and excludes the just-played instance.
- [x] Resolving a discarded minion summons it without paying its cost (board rules still apply); does not discard on summon.
- [x] Resolving a discarded spell/ritual runs one free play without paying its cost; rituals create field effects as in 07.
- [x] After a free play of a castCount-1 spell/attack, the reused card is in discard again; multi-cast may remain in hand.
- [x] Empty / only-self-illegal discard: cannot illegally resolve (no throw; action illegal or no-op per engine conventions).
- [x] Engine tests + minimal UI path to pick a discard card in battle.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md` (冥界牵引 + 施法数 updated 2026-07-23).
