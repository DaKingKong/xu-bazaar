// 引擎内部共享工具：状态访问、目标解析、伤害/死亡结算。
// 纯 TS，不依赖 UI。所有函数直接在（调用方已克隆的）状态上就地修改。

import type { BattleEvent, BattleState, Minion, PlayerState, Side, TargetRef } from './types.ts';

export function otherSide(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

export function sideState(state: BattleState, side: Side): PlayerState {
  return side === 'player' ? state.player : state.enemy;
}

export function boardUsage(board: Minion[]): number {
  return board.reduce((sum, m) => sum + m.size, 0);
}

export function isEnded(state: BattleState): boolean {
  return state.phase === 'ended' || state.winner != null;
}

export function heroRef(side: Side): TargetRef {
  return { kind: 'hero', side };
}

export function minionRef(side: Side, id: string): TargetRef {
  return { kind: 'minion', side, id };
}

// 场上嘲讽仆从（若有）。
export function tauntsOf(board: Minion[]): Minion[] {
  return board.filter((m) => m.keywords.includes('taunt'));
}

// 对某仆从造成伤害；若死亡则立即移除并左移填补（splice 天然左移），并推入 death 事件。
export function damageMinion(
  state: BattleState,
  side: Side,
  minionId: string,
  amount: number,
  events: BattleEvent[],
): void {
  const ps = sideState(state, side);
  const idx = ps.board.findIndex((m) => m.id === minionId);
  if (idx < 0) return;
  ps.board[idx].hp -= amount;
  if (ps.board[idx].hp <= 0) {
    ps.board.splice(idx, 1);
    events.push({ type: 'death', side, minionId });
  }
}

// 对角色造成伤害；HP 归零立即判定胜负（即时结算），设置 winner 并推入 gameOver。
export function damageHero(
  state: BattleState,
  side: Side,
  amount: number,
  events: BattleEvent[],
): void {
  if (isEnded(state)) return;
  const ps = sideState(state, side);
  ps.hero.hp -= amount;
  if (ps.hero.hp <= 0) {
    ps.hero.hp = 0;
    const winner = otherSide(side);
    state.winner = winner;
    state.phase = 'ended';
    events.push({ type: 'gameOver', winner });
  }
}
