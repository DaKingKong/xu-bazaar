# 11 — 敌人 AI 能合法打完主题组

**What to build:** Enemy AI can spend energy on the themed card pool without throwing: it chooses **legal** targets for new modes (friendly destroy, buffs, discard replay, rituals, AOE, etc.). Heuristics may be dumb (random / prefer expensive).

**Blocked by:** 03 — 施法数连结算与基础法术; 04 — 死亡流转; 07 — 仪式场地效果; 10 — 冥界牵引

**Status:** ready-for-agent

- [ ] AI play loop never throws when the hand contains catalog spells/minions from the themed set under normal board setups.
- [ ] When 冥界牵引 is selected, AI picks a legal discard target (or skips the card if none).
- [ ] When 死亡流转 is selected, AI picks a legal friendly minion or skips if none.
- [ ] Rituals and non-targeted spells are playable in energy combos like existing AI.
- [ ] At least one integration test: enemy turn with a constructed themed hand completes `runEnemyTurn` successfully.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`

Also unblock practically from 05/08/09 once those land; listed blockers are the new target-mode gates. If implementing out of order, treat any missing card type as “skip until present.”
