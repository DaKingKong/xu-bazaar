# Catalog deck v1 — replace sample cards with full catalog fidelity (base text)

**Status:** ready-for-agent

## Problem Statement

The default battle still uses placeholder sample cards (铁壁守卫、突击兵、火焰箭等). Design sources already define the real card pool and keywords (`docs/card-catalog.md`, `docs/keyword-catalog.md`), but the engine only supports a thin slice (嘲讽、击杀抽牌、伤害/治疗). Players cannot play the intended 地狱术士 fantasy (仪式、献祭、地狱场地、召唤物、弃牌再用等).

## Solution

Implement every **buildable catalog card’s base rules text** (no 强化 1/2), plus Tokens spawned only by effects. Keep the default match as **地狱术士 vs 训练假人**, but give both sides a **地狱术士主题组** (enemy omits 地狱兽仪式). Switch the default decks and delete sample cards only when the full stack is playable (“一次到位”), including enemy AI that can legally finish its turns with the new cards.

## User Stories

1. As a player, I want the default battle to use catalog cards, so that what I play matches the design docs.
2. As a player, I want spent and dead cards to go to a discard pile, so that “墓地” effects have somewhere to read from.
3. As a player, I want 冰晶人 / 火焰人 / 石像守卫 to summon with correct stats, so that the board feels like the catalog.
4. As a player, I want 石像守卫 to have 嘲讽 and 大型 (two slots + +50% attribute gains), so that tanking and size rules match design.
5. As a player, I want spells with 施法数 N to be playable up to N times from hand (each play costs energy and resolves once), so that 灵光之盾 (N=2) can be used twice across turns or targets.
6. As a player, I want 火球术 to deal 8 damage to a chosen target, so that I have a clear removal spell.
7. As a player, I want 灵光之盾 to grant shield and draw once per play (up to twice while it remains in hand), so that defense and card advantage work.
8. As a player, I want shields to absorb damage before HP and clear at the agreed end-of-turn timing, so that shield is not permanent padding.
9. As a player, I want 死亡流转 to destroy a friendly minion and draw cards equal to its cost, so that sacrifice-draw lines exist.
10. As a player, I want 神速灌注 to grant 多重攻击, so that a minion can strike extra times in auto-battle.
11. As a player, I want 利爪灌注 to grant 溅射, so that primary attacks also hit adjacent enemies.
12. As a player, I want 恶魔 to battlecry-summon a 小恶魔, so that the hell swarm starts from one card.
13. As a player, I want 书卷猫 to draw on enter, so that tempo minions refill the hand.
14. As a player, I want 恶魔召唤 to summon a 恶魔 Token with 重生, so that sticky threats exist.
15. As a player, I want ritual spells to leave **field persistent effects** (not board units), so that 仪式 is not confused with minions.
16. As a player, I want multiple rituals on my side at once, each with its own sacrifice counter, so that 传送门 and 地狱兽仪式 can coexist.
17. As a player, I want a death of a friendly minion to increment all of my rituals’ sacrifice (and apply each ritual’s on-death rider, e.g. lord heal on 地狱兽仪式), so that engines feel fair and stackable.
18. As a player, I want a ritual that reaches its threshold to summon its Token, then reset sacrifice to zero and keep running, so that rituals are engines not one-shots.
19. As a player, I want 地狱兽仪式 available in my deck (hero-locked fantasy) but not in the dummy’s deck, so that the signature card stays on the warlock side.
20. As a player, I want 凯斯提’s enter to set a **global** 地狱 field (stackable intensity), so that the battlefield climate is shared.
21. As a player, I want 凯斯提 to have 吸血 5 as an aura while the field is 地狱 (not “+5 lifesteal each turn”), so that the catalog note is respected.
22. As a player, I want 地狱 end-of-round damage to resolve **after auto-battle and before the next side’s play phase**, so that combat happens before the climate tick.
23. As a player, I want 诅咒爆破 as a spell that damages all enemies and doubles damage to enemy minions for the rest of the turn, so that finishers exist.
24. As a player, I want 冥界牵引 to return a discard card to hand and play it once for free (consuming one cast), so that grave recursion works; multi-cast cards may remain in hand with remaining casts.
25. As a player, I want any card currently in discard to be a legal 冥界牵引 target except the 冥界牵引 instance that was just played, so that infinite self-chains are blocked but other recursion remains.
26. As a player, I want Tokens to appear only via effects, never as deck builds, so that the deck list stays clean.
27. As the enemy AI (训练假人), I want to legally play the themed hand (targets, rituals, discard picks), so that the default match does not stall.
28. As a developer, I want sample placeholder cards removed and fatigue renamed to 血战 only at cutover, so that mid-work defaults never ship half-broken catalog decks.
29. As a developer, I want engine tests to prove each slice before cutover, so that “一次到位” is verifiable.
30. As a player, I want battle log / UI to remain understandable for new events (ritual counters, hell field, discard pick), so that new systems are observable in the client.

## Implementation Decisions

Agreed in grilling (2026-07-23); **施法数 / 冥界牵引 updated 2026-07-23** — tickets/implementations follow the latest:

- **Fidelity:** Full catalog **base text** only; no 强化 1/2, no mid-run upgrade UI.
- **施法数 N:** Same instance may be played up to N times. Each play resolves the text **once**. Plays from hand each cost energy; may span turns and retarget. Remaining casts keep the card in hand; exhausted → discard. `castsRemaining` cleared on discard so the next draw/pull starts at full N.
- **Default heroes:** Player 地狱术士, enemy 训练假人 unchanged at cutover.
- **Decks:** Hell-warlock themed lists for both; enemy replaces 地狱兽仪式 with a second 石像守卫. Exact counts per grilled table (~19 cards). Tokens never in recipe.
- **冥界牵引 & 诅咒爆破:** In themed decks for both sides (诅咒爆破); 冥界牵引 in themed decks; 地狱兽仪式 player-only.
- **Sample cards:** Delete all placeholders at cutover; keep mechanism card, rename fatigue strike display/id to **血战**.
- **Rituals:** Spells that create **per-side field persistent effects** (not units). Multiple may coexist; friendly minion death broadcasts to all. On threshold: summon, **reset counter to 0**, effect remains.
- **Hell vs rituals:** Two systems. Hell is **one global** field state with stackable intensity. Rituals are per-side effect lists.
- **Hell damage timing:** After auto-battle, before the next side’s play phase begins.
- **大型:** `size: 2` **and** +50% attribute gains when gains apply.
- **诅咒爆破:** Typed as **spell** (catalog row “仆从” treated as data error).
- **墓地:** Equals **discard pile**. 冥界牵引: pay its cost → chosen card **returns to hand** → **free play once** (consumes one cast). If casts remain, card stays in hand (later hand plays cost normally); if exhausted (or attack card), goes to discard. Minions summoned this way stay on board (discard only on death). Just-played 冥界牵引 instance **cannot** be chosen as its own target.
- **仆从与弃牌:** Successful summon does **not** discard the card; minions enter discard **on death** only.
- **AI bar:** “能合法打完” — legal targets and legal plays; heuristics may be dumb.
- **Cutover policy:** Do not switch default `build*Deck` / delete samples until tickets 01–11 acceptance is green (“一次到位”).
- **Test seam:** Prefer existing engine entry points (`playCard`, turn/auto-battle orchestration, `runEnemyTurn` / AI) and `BattleResult.events`; add UI only for new interactions (discard targeting, field/ritual/hell readout).
- **Modules (conceptual):** battle state (discard, field effects, global hell, turn modifiers); play/resolution effects; auto-battle (multi-attack, splash, shield, rebirth, lifesteal); data card definitions + deck recipes; store event playback / log formatting; battle UI targeting; enemy AI target choice.

## Testing Decisions

- Prefer **external behavior** tests: given a constructed battle state, performing an action yields expected HP/board/discard/field/events — not private helper unit tests unless unavoidable.
- Primary harness: existing Vitest engine rules tests; extend rather than invent a parallel runner.
- Each ticket’s acceptance criteria should be provable with engine tests before relying on manual UI.
- AI ticket: at least one integration-style test that the enemy can empty a legal energy combo including a new target mode (e.g. discard pick or ritual) without throwing.
- Cutover ticket: createBattle/default store start uses themed decks; old defIds absent; 血战 is the fatigue card name/id.

## Out of Scope

- Card 强化 1 / 强化 2 and any upgrade meta/UI.
- Growth, unlocks, deckbuilder, equipment/relic gameplay (placeholders may remain).
- Perfect or tuned enemy AI beyond legal play.
- Replacing 训练假人 as the default enemy hero.
- Resolving every keyword in `keyword-catalog.md` that no catalog **base** card needs for this cut (e.g. 潜行、复仇、共鸣、生长、破碎) unless a base card requires it.
- Changing GitHub Pages / toolchain unrelated to battle.

## Further Notes

- Design sources: `docs/card-catalog.md`, `docs/keyword-catalog.md`; engine truth today documented as partial in those files’ “实现对照” notes — update design docs only when behavior lands (per repo docs-sync-before-commit on commit).
- Parent grilling consensus is the authority if a catalog row conflicts (e.g. 诅咒爆破 type).
- Suggested feature slug / tracker root: `.scratch/catalog-deck-v1/`.
- Work the frontier: any `ready-for-agent` ticket whose blockers are done.
