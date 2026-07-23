# 07 — 仪式场地效果

**What to build:** **恶魔传送门** and **地狱兽仪式** are spells that create **per-side field persistent effects** (never board units named after the spell). Multiple rituals may coexist. Friendly minion deaths add sacrifice to **each** ritual and apply riders (地狱兽仪式 also heals the lord +2). On reaching threshold, summon the Token, **reset sacrifice to 0**, keep the effect.

**Blocked by:** 01 — 弃牌堆生命周期; 06 — 入场、召唤物与重生

**Status:** ready-for-agent

- [ ] Playing a ritual adds a field effect for that side; the spell card goes to discard; no ritual “minion” appears.
- [ ] Two different rituals can be active on the same side with independent counters.
- [ ] One friendly minion death increments every active ritual’s sacrifice on that side.
- [ ] 恶魔传送门 at 5 sacrifice summons 小恶魔, then counter returns to 0 and the effect remains.
- [ ] 地狱兽仪式 at 7 sacrifice summons 地狱兽凯斯提 (definition may stub hell aura until ticket 08), heals lord +2 per intervening friendly deaths per card text, then counter resets and remains.
- [ ] Engine tests cover dual rituals, threshold summon, reset-and-continue.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`

Note: Full 凯斯提 hell climate behavior is ticket 08; this ticket may summon a sized Token with catalog combat stats even if hell field is incomplete.
