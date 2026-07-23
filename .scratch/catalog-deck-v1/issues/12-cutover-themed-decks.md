# 12 — 一次到位换组与删旧卡

**What to build:** Cut over the default battle: delete all sample placeholder cards; rename fatigue card to **血战**; `CARD_DEFS` holds full catalog base text + Tokens; player/enemy use the agreed themed recipes (enemy: no 地狱兽仪式, extra 石像守卫); default start uses these decks. All prior tickets green.

**Blocked by:** 01 — 弃牌堆生命周期; 02 — 目录白板与嘲讽大型仆从; 03 — 施法数连结算与基础法术; 04 — 死亡流转; 05 — 灌注：多重攻击与溅射; 06 — 入场、召唤物与重生; 07 — 仪式场地效果; 08 — 全局地狱与凯斯提; 09 — 诅咒爆破; 10 — 冥界牵引; 11 — 敌人 AI 能合法打完主题组

**Status:** ready-for-agent

- [ ] No leftover sample defIds (铁壁守卫、突击兵、新兵、巨型魔像、快速斩击、火焰箭、治疗术, etc.) in card definitions or default recipes.
- [ ] Fatigue-generated card is named **血战** (id renamed consistently; tests/log updated).
- [ ] Player themed deck matches the grilled list including 地狱兽仪式 and 冥界牵引; enemy themed deck matches with 地狱兽仪式 replaced by a second 石像守卫.
- [ ] Tokens are not in either recipe but exist as definitions for summons.
- [ ] Default battle bootstrap (store / createBattle demo path) uses the new decks; enemy remains 训练假人, player 地狱术士.
- [ ] Full test suite green; manual smoke: start battle, both sides can play legal turns.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`

On commit: sync README / AGENTS.md / implementation-plan status per docs-sync-before-commit.
