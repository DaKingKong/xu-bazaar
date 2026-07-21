// 战斗引擎公共入口。
//
// 纯 TS，不依赖 UI（见 docs/architecture.md）。对外暴露核心类型、常量、
// 随机源工具与五个战斗入口（见 docs/implementation-plan.md §3）。

export * from './types.ts';
export { makeRng, randInt, pick } from './rng.ts';
export { legalTargets, playCard } from './play.ts';
export { runAutoBattle } from './autoBattle.ts';
export { chooseCombo, runAiPlays } from './ai.ts';
export { createBattle, runEnemyTurn, endTurn } from './battle.ts';
export {
  otherSide,
  sideState,
  boardUsage,
  isEnded,
  tauntsOf,
  heroRef,
  minionRef,
} from './helpers.ts';
