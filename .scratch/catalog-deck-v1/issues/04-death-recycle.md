# 04 — 死亡流转

**What to build:** **死亡流转** destroys one friendly minion and draws cards equal to that minion’s **cost**. The destroyed minion’s card is in discard afterward.

**Blocked by:** 01 — 弃牌堆生命周期; 02 — 目录白板与嘲讽大型仆从

**Status:** ready-for-agent

- [ ] Player can target a friendly board minion with 死亡流转.
- [ ] Target is destroyed immediately; draw count equals the minion definition’s cost.
- [ ] Draws follow existing hand-cap / empty-deck (fatigue) rules.
- [ ] Destroyed minion contributes to that side’s discard.
- [ ] Engine test: cost-3 friendly on board → play 死亡流转 → board empty of that minion, +3 cards drawn (or as many as rules allow), discard contains the minion card.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
