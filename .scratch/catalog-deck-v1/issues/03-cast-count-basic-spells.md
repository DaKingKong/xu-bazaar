# 03 — 施法数连结算与基础法术

**What to build:** Spells support **施法数 N**: one play, same chosen target, resolve the card text N times. Ship **火球术** (8 damage, N=1) and **灵光之盾** (shield +4 and draw 1, N=2). Shields absorb damage before HP and clear at the end-of-turn timing chosen for this ticket (document in comments if not already fixed).

**Blocked by:** 01 — 弃牌堆生命周期

**Status:** ready-for-agent

- [ ] 火球术 deals 8 to the chosen target once per play (N=1).
- [ ] 灵光之盾 on one target applies shield+4 and draw×1, then again (N=2) on that same target — two shield grants and two draws when legal.
- [ ] Shield prevents HP loss until depleted; excess damage hits HP.
- [ ] Shield is removed at the agreed turn boundary (state after the clear has no leftover shield).
- [ ] Played spells enter discard (via 01).
- [ ] Engine tests cover N=1 damage, N=2 shield+draw, and shield absorption.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
