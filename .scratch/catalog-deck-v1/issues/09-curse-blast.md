# 09 — 诅咒爆破

**What to build:** **诅咒爆破** is a **spell**: all enemies take 2 damage, and all enemy minions take **double damage for the rest of the turn**. Available in definitions (themed deck cutover in 12).

**Blocked by:** 02 — 目录白板与嘲讽大型仆从; 03 — 施法数连结算与基础法术

**Status:** ready-for-agent

- [ ] Playing 诅咒爆破 deals 2 damage to all enemy characters that “所有敌人” covers in implementation (heroes and/or minions — match catalog “对所有敌人造成 2 伤害” and “使所有敌方仆从本回合受到 2 倍伤害”; document the hero inclusion choice in a short comment on the ticket when implementing).
- [ ] For the remainder of the turn, damage to enemy minions is doubled.
- [ ] Double-damage modifier clears at the same turn boundary used for other “本回合” effects.
- [ ] Engine tests: AOE application + doubled subsequent hit on an enemy minion + modifier expiry.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
