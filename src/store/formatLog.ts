// 将 BattleEvent 格式化为战斗日志文案（见 docs/battle-log.md）。
// 纯函数：不依赖 React；命名解析读传入的 BattleState（应为事件应用前的 view）。

import { sideState } from '../engine/index.ts';
import type { BattleEvent, BattleState, Side, TargetRef } from '../engine/types.ts';

export type LogKind = 'phase' | 'resource' | 'play' | 'combat' | 'fatigue' | 'system';

export interface LogEntry {
  id: number;
  text: string;
  kind: LogKind;
  side?: Side;
  sourceEvent: BattleEvent['type'];
}

export const LOG_CAP = 100;

export type LogFields = Omit<LogEntry, 'id'>;

function who(side: Side): string {
  return side === 'player' ? '你' : '敌人';
}

function targetsEqual(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind || a.side !== b.side) return false;
  if (a.kind === 'minion' && b.kind === 'minion') return a.id === b.id;
  return true;
}

function cardName(state: BattleState, side: Side, cardId: string): string {
  const ps = sideState(state, side);
  const inst =
    ps.hand.find((c) => c.id === cardId) ??
    ps.deck.find((c) => c.id === cardId) ??
    ps.discard.find((c) => c.id === cardId);
  if (!inst) return '未知卡牌';
  return state.cardDb[inst.defId]?.name ?? '未知卡牌';
}

function minionName(state: BattleState, side: Side, minionId: string): string {
  const m = sideState(state, side).board.find((x) => x.id === minionId);
  if (!m) return '仆从';
  const def = state.cardDb[m.defId];
  return def?.minion?.name ?? def?.name ?? '仆从';
}

function unitLabel(state: BattleState, ref: TargetRef): string {
  if (ref.kind === 'hero') return who(ref.side);
  const name = minionName(state, ref.side, ref.id);
  return `${ref.side === 'player' ? '你的' : '敌人的'}「${name}」`;
}

function pairedCounter(
  attack: Extract<BattleEvent, { type: 'attack' }>,
  next: BattleEvent | undefined,
): Extract<BattleEvent, { type: 'counter' }> | null {
  if (!next || next.type !== 'counter') return null;
  if (!targetsEqual(next.unit, attack.attacker)) return null;
  return next;
}

/**
 * 将单个事件格式化为日志字段；返回 null 表示静默（不追加）。
 * `nextEv` 用于 attack+counter 交锋合并；`counter` 本身始终静默。
 * `view` 须为事件应用到展示状态之前的快照（抽牌/出牌/死亡等从中解析名字）。
 * `authoritative` 为整批结算后的最终状态；召唤名从中读取（view 上尚未插入该仆从）。
 */
export function formatLog(
  ev: BattleEvent,
  nextEv: BattleEvent | undefined,
  view: BattleState,
  authoritative: BattleState = view,
): LogFields | null {
  switch (ev.type) {
    case 'energyReset':
    case 'counter':
    case 'draw':
    case 'drawSkipped':
      return null;

    case 'phaseChange': {
      const label = {
        enemyPlay: '敌人出牌',
        playerPlay: '你的回合',
        autoBattle: '自动战斗',
        ended: '战斗结束',
      }[ev.phase];
      return {
        text: `—— ${label} ——`,
        kind: 'phase',
        sourceEvent: ev.type,
      };
    }

    case 'fatigue': {
      const fatigueName = view.cardDb['blood-war']?.name ?? '血战';
      return {
        text: `${who(ev.side)}疲劳：受到 ${ev.damage} 点伤害，获得「${fatigueName}」（${ev.generatedAttack} 攻）`,
        kind: 'fatigue',
        side: ev.side,
        sourceEvent: ev.type,
      };
    }

    case 'playCard': {
      let text = `${who(ev.side)}打出「${cardName(view, ev.side, ev.cardId)}」`;
      if (ev.target) text += `，目标：${unitLabel(view, ev.target)}`;
      return {
        text,
        kind: 'play',
        side: ev.side,
        sourceEvent: ev.type,
      };
    }

    case 'useSkill': {
      const skillName =
        view.heroDb[sideState(view, ev.side).hero.defId]?.skill?.name ?? '英雄技能';
      let text = `${who(ev.side)}使用技能「${skillName}」`;
      if (ev.target) text += `，目标：${unitLabel(view, ev.target)}`;
      return {
        text,
        kind: 'play',
        side: ev.side,
        sourceEvent: ev.type,
      };
    }

    case 'summon':
      return {
        text: `${who(ev.side)}召唤了「${minionName(authoritative, ev.side, ev.minionId)}」`,
        kind: 'play',
        side: ev.side,
        sourceEvent: ev.type,
      };

    case 'attack': {
      const attacker = unitLabel(view, ev.attacker);
      const target = unitLabel(view, ev.target);
      const counter = pairedCounter(ev, nextEv);
      let text = `${attacker} X ${target}， ${target} -${ev.damage}HP`;
      if (counter) text += `，${attacker} -${counter.damage}HP`;
      return {
        text,
        kind: 'combat',
        side: ev.attacker.side,
        sourceEvent: 'attack',
      };
    }

    case 'heal':
      return {
        text: `${unitLabel(view, ev.target)}恢复 ${ev.amount} 点生命`,
        kind: 'combat',
        side: ev.target.side,
        sourceEvent: ev.type,
      };

    case 'death':
      return {
        text: `${ev.side === 'player' ? '你的' : '敌人的'}「${minionName(view, ev.side, ev.minionId)}」阵亡`,
        kind: 'combat',
        side: ev.side,
        sourceEvent: ev.type,
      };

    case 'rebirth':
      return {
        text: `${ev.side === 'player' ? '你的' : '敌人的'}「${minionName(view, ev.side, ev.minionId)}」重生`,
        kind: 'combat',
        side: ev.side,
        sourceEvent: ev.type,
      };

    case 'gameOver':
      return {
        text: ev.winner === 'player' ? '你获胜！' : '敌人获胜！',
        kind: 'system',
        side: ev.winner,
        sourceEvent: ev.type,
      };

    case 'discard':
    case 'ritualUpdate':
    case 'hellChange':
    case 'shield':
      return null;

    default:
      return null;
  }
}
