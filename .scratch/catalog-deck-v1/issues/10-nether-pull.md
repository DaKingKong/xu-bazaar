# 10 — 冥界牵引

**What to build:** **冥界牵引** costs its mana, then the player chooses **any** card in their discard except the 冥界牵引 instance just played, and **uses it for free**. After that use, the chosen card returns to discard. Works for minions (re-summon), spells, and rituals. UI must support discard targeting.

**Blocked by:** 01 — 弃牌堆生命周期; 03 — 施法数连结算与基础法术; 06 — 入场、召唤物与重生; 07 — 仪式场地效果

**Status:** ready-for-agent

- [ ] Playing 冥界牵引 with a non-empty legal discard presents discard targets and excludes the just-played instance.
- [ ] Resolving a discarded minion summons it without paying its cost (board rules still apply).
- [ ] Resolving a discarded spell/ritual runs its play resolution without paying its cost; rituals create field effects as in 07.
- [ ] After resolution, the reused card is in discard again.
- [ ] Empty / only-self-illegal discard: cannot illegally resolve (no throw; action illegal or no-op per engine conventions).
- [ ] Engine tests + minimal UI path to pick a discard card in battle.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
