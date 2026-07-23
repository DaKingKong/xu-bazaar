# 08 — 全局地狱与凯斯提

**What to build:** **地狱兽凯斯提** enter sets **global** 地狱 (stackable intensity). While the field is 地狱, 凯斯提 has **吸血 5** as an aura (not “gain +5 lifesteal each turn”). Hell damage to all non-地狱-tagged minions resolves **after auto-battle and before the next side’s play phase**, amount scaled by intensity per catalog notes.

**Blocked by:** 07 — 仪式场地效果

**Status:** ready-for-agent

- [ ] Global hell state exists once per battle (not per side).
- [ ] 凯斯提 enter makes the field 地狱; entering again while already 地狱 increases intensity (damage +2 per catalog note).
- [ ] While 地狱 is active, 凯斯提’s 吸血 5 aura works on its damage instances (heal 5 per keyword catalog reading of 吸血 N).
- [ ] Hell tick runs after auto-battle completes and before the next play phase for a side; non-地狱 TAG minions take the intensity-appropriate damage; 地狱 TAG minions are spared.
- [ ] Engine tests: enter sets hell; second enter stacks; post-auto-battle damage; lifesteal aura while hell active.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
