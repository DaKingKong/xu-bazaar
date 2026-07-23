# 02 — 目录白板与嘲讽大型仆从

**What to build:** Catalog minions **冰晶人**, **火焰人**, and **石像守卫** can be summoned with catalog base stats. 石像守卫 has 嘲讽 and **大型** (occupies two board slots and receives +50% attribute gains when gains apply). Default decks unchanged.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Card definitions exist for 冰晶人 (1/3/1), 火焰人 (1/1/3), 石像守卫 (3/10/2, 嘲讽, 大型).
- [ ] 大型 minions use two slots toward the 7-slot board cap; cannot summon if remaining capacity < 2.
- [ ] 石像守卫 is a legal taunt target for attack-face / auto-battle taunt priority (existing taunt rules).
- [ ] When an attribute gain is applied to a 大型 minion, the gained amount is increased by 50% (prove with a test double or temporary gain API if no catalog buff card is in this ticket).
- [ ] Engine tests summon each minion and assert stats, keywords, and board usage; default battle recipe still uses sample cards.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
