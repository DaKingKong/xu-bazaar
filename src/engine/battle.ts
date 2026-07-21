// 回合状态机编排：createBattle / runEnemyTurn / endTurn。
// 见 docs/battle-design.md §1、docs/implementation-plan.md §3。
//
// 回合流程：敌人打牌 → 玩家打牌 → 自动战斗。
// - createBattle：构造起始状态（回合 1，敌人打牌阶段），不含事件。
// - runEnemyTurn：敌人回合开始（能量重置 + 抽牌）→ AI 出牌 → 切换到玩家打牌
//   阶段并执行玩家回合开始（能量重置 + 抽牌）。返回后即等待玩家出牌/结束回合。
// - endTurn：玩家结束回合 → 进入自动战斗阶段（随后由 runAutoBattle 结算）。

import { runAiPlays } from './ai.ts';
import { beginTurn } from './draw.ts';
import { isEnded } from './helpers.ts';
import type {
  BattleInit,
  BattleResult,
  BattleState,
  PlayerInit,
  PlayerState,
  Rng,
  Side,
} from './types.ts';
import { MAX_ENERGY } from './types.ts';

function buildPlayerState(side: Side, init: PlayerInit): PlayerState {
  return {
    side,
    hero: {
      side,
      attack: init.hero.attack,
      hp: init.hero.hp,
      maxHp: init.hero.hp,
      equipmentSlot: null,
      relics: [],
      skill: null,
    },
    deck: init.deck.map((c) => ({ ...c })),
    hand: [],
    board: [],
    energy: 0,
    maxEnergy: MAX_ENERGY,
    fatigueCount: 0,
  };
}

export function createBattle(config: BattleInit, _rng?: Rng): BattleState {
  const startingSide = config.startingSide ?? 'enemy';
  return {
    turn: 1,
    activeSide: startingSide,
    phase: startingSide === 'enemy' ? 'enemyPlay' : 'playerPlay',
    player: buildPlayerState('player', config.player),
    enemy: buildPlayerState('enemy', config.enemy),
    winner: null,
    fieldEffect: null,
    cardDb: config.cardDb,
  };
}

// 敌人回合：敌人开始（能量+抽牌）→ AI 出牌 → 切到玩家打牌阶段并执行玩家开始。
export function runEnemyTurn(state: BattleState, rng: Rng): BattleResult {
  let s = structuredClone(state);
  const events: BattleResult['events'] = [];
  if (isEnded(s)) return { state: s, events };

  s.phase = 'enemyPlay';
  s.activeSide = 'enemy';
  events.push({ type: 'phaseChange', phase: 'enemyPlay' });

  beginTurn(s, 'enemy', events);

  if (!isEnded(s)) {
    const res = runAiPlays(s, rng);
    s = res.state;
    events.push(...res.events);
  }

  if (!isEnded(s)) {
    s.phase = 'playerPlay';
    s.activeSide = 'player';
    events.push({ type: 'phaseChange', phase: 'playerPlay' });
    beginTurn(s, 'player', events);
  }

  return { state: s, events };
}

// 玩家结束回合：进入自动战斗阶段（结算由 runAutoBattle 负责）。
export function endTurn(state: BattleState, _rng?: Rng): BattleResult {
  const s = structuredClone(state);
  const events: BattleResult['events'] = [];
  if (isEnded(s)) return { state: s, events };
  s.phase = 'autoBattle';
  events.push({ type: 'phaseChange', phase: 'autoBattle' });
  return { state: s, events };
}
