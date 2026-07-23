# 06 — 入场、召唤物与重生

**What to build:** **恶魔** (enter: summon 小恶魔), **书卷猫** (enter: draw 1), **恶魔召唤** (summon 恶魔 Token with 重生 +1). Tokens are not deckable. 重生: on death, restore full HP and consume one rebirth stack instead of leaving the board (first death).

**Blocked by:** 01 — 弃牌堆生命周期; 02 — 目录白板与嘲讽大型仆从

**Status:** ready-for-agent

- [ ] Playing 恶魔 summons it and immediately summons one 小恶魔 if board space allows.
- [ ] Playing 书卷猫 draws 1 on enter.
- [ ] 恶魔召唤 summons a 恶魔 Token with 重生 +1 (not the deckable 恶魔 card instance).
- [ ] A minion with 重生 surviving its first lethal death returns to full HP with rebirth reduced by 1; a second lethal death without rebirth removes it (and discard rules from 01 apply when it finally dies).
- [ ] Board-full / capacity failures skip or partially apply summons without crashing (define in test: at least “no throw”).
- [ ] Engine tests for enter draw, enter summon, rebirth once.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
