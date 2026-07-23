# 03 — 施法数留手与基础法术

**What to build:** Spells support **施法数 N**: the same instance may be played up to N times. Each play resolves the card text **once**. Hand plays each cost energy; remaining casts keep the card in hand (may retarget / later turns); exhausted → discard. Ship **火球术** (8 damage, N=1) and **灵光之盾** (shield +4 and draw 1, N=2). Shields absorb damage before HP and clear at the end-of-turn timing chosen for this ticket (document in comments if not already fixed).

**Blocked by:** 01 — 弃牌堆生命周期

**Status:** ready-for-agent

- [x] 火球术 deals 8 to the chosen target once per play (N=1) then discards.
- [x] 灵光之盾 first play: pay cost, shield+4 and draw×1, card stays in hand with 1 cast left.
- [x] 灵光之盾 second play: pay cost again, resolve once more, then discard.
- [x] Shield prevents HP loss until depleted; excess damage hits HP.
- [x] Shield is removed at the agreed turn boundary (state after the clear has no leftover shield).
- [x] Exhausted spells enter discard (via 01); multi-cast mid-use stays in hand.
- [x] Engine tests cover N=1 damage, N=2 two paid plays, and shield absorption.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md` (施法数 decision updated 2026-07-23 — stay in hand, not multi-resolve in one play).
