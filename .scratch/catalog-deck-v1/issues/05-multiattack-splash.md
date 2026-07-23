# 05 — 灌注：多重攻击与溅射

**What to build:** **神速灌注** grants a target minion **多重攻击 +1**. **利爪灌注** grants **溅射**. Auto-battle respects extra attacks and splash damage to adjacent enemies on **active** attacks only (not when being attacked).

**Blocked by:** 02 — 目录白板与嘲讽大型仆从

**Status:** ready-for-agent

- [ ] 神速灌注 can target a friendly minion; that minion gains multi-attack +1 (extra attack count per catalog wording).
- [ ] In auto-battle, a minion with multi-attack +1 performs the extra attack(s) beyond the default once-per-round attack.
- [ ] 利爪灌注 grants splash; when that minion actively attacks, adjacent enemy minions also take the attack damage (or agreed splash amount — match catalog: attack also damages adjacent).
- [ ] Being attacked does not trigger splash.
- [ ] Engine tests cover multi-attack count and splash adjacency on a small board.

## Comments

Parent spec: `.scratch/catalog-deck-v1/spec.md`
