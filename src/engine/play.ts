// M3（出牌部分）：仆从召唤 / 直接攻击卡 / 法术卡。
// 见 docs/battle-design.md §5、§6。

import {
  boardUsage,
  damageHero,
  damageMinion,
  isEnded,
  otherSide,
  sideState,
  tauntsOf,
} from './helpers.ts';
import type {
  BattleEvent,
  BattleResult,
  BattleState,
  CardDef,
  CardInstance,
  Minion,
  PlayCardAction,
  Side,
  TargetRef,
} from './types.ts';
import { BOARD_CAPACITY } from './types.ts';

function targetsEqual(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind || a.side !== b.side) return false;
  if (a.kind === 'minion' && b.kind === 'minion') return a.id === b.id;
  return true;
}

// 计算一张指向性卡的全部合法目标。
// respectTaunt 表示「打脸/嘲讽限制」：仅作用于敌方——有嘲讽只能选嘲讽，
// 有非嘲讽仆从则不能打脸（角色），场上无仆从时才可打脸。
export function legalTargets(state: BattleState, actingSide: Side, def: CardDef): TargetRef[] {
  const t = def.targeting;
  if (!t || !t.needsTarget) return [];

  const opp = otherSide(actingSide);
  const sides: Side[] =
    t.side === 'enemy' ? [opp] : t.side === 'ally' ? [actingSide] : ['player', 'enemy'];

  const result: TargetRef[] = [];
  for (const s of sides) {
    const board = sideState(state, s).board;
    if (t.respectTaunt && s === opp) {
      const taunts = tauntsOf(board);
      if (taunts.length > 0) {
        for (const m of taunts) result.push({ kind: 'minion', side: s, id: m.id });
      } else if (board.length > 0) {
        for (const m of board) result.push({ kind: 'minion', side: s, id: m.id });
      } else if (t.allowHero) {
        result.push({ kind: 'hero', side: s });
      }
    } else {
      for (const m of board) result.push({ kind: 'minion', side: s, id: m.id });
      if (t.allowHero) result.push({ kind: 'hero', side: s });
    }
  }
  return result;
}

function resolveDamage(instance: CardInstance, def: CardDef): number {
  return instance.overrideDamage ?? def.damage ?? 0;
}

// 读取某目标的攻击力（用于直接攻击卡的双向反伤）。目标不存在则为 0。
function targetAttack(state: BattleState, target: TargetRef): number {
  const ps = sideState(state, target.side);
  if (target.kind === 'hero') return ps.hero.attack;
  const m = ps.board.find((x) => x.id === target.id);
  return m ? m.attack : 0;
}

function applyEffectToTarget(
  state: BattleState,
  def: CardDef,
  instance: CardInstance,
  actingSide: Side,
  target: TargetRef,
  events: BattleEvent[],
): void {
  if (def.heal != null) {
    const ps = sideState(state, target.side);
    if (target.kind === 'hero') {
      ps.hero.hp = Math.min(ps.hero.maxHp, ps.hero.hp + def.heal);
    } else {
      const m = ps.board.find((x) => x.id === target.id);
      if (m) m.hp = Math.min(m.maxHp, m.hp + def.heal);
    }
    events.push({ type: 'heal', target, amount: def.heal });
    return;
  }

  const dmg = resolveDamage(instance, def);

  // 直接攻击卡（type: 'attack'）由角色发起，伤害「双向结算」：
  // 除对目标造成伤害外，发起方角色也受到等于目标攻击力的反伤。
  // 法术卡（type: 'spell'）为无反伤的远程效果，不触发双向结算。
  const bidirectional = def.type === 'attack';
  const counter = bidirectional ? targetAttack(state, target) : 0;

  if (target.kind === 'hero') {
    damageHero(state, target.side, dmg, events);
  } else {
    damageMinion(state, target.side, target.id, dmg, events);
  }

  if (counter > 0 && !isEnded(state)) {
    events.push({ type: 'counter', unit: { kind: 'hero', side: actingSide }, damage: counter });
    damageHero(state, actingSide, counter, events);
  }
}

function summonMinion(
  state: BattleState,
  side: Side,
  def: CardDef,
  instance: CardInstance,
  position: number | undefined,
  events: BattleEvent[],
): void {
  const md = def.minion!;
  const ps = sideState(state, side);
  if (boardUsage(ps.board) + md.size > BOARD_CAPACITY) {
    throw new Error('board is full: cannot summon minion');
  }
  const minion: Minion = {
    id: `m_${instance.id}`,
    defId: def.defId,
    attack: md.attack,
    hp: md.hp,
    maxHp: md.hp,
    size: md.size,
    keywords: [...md.keywords],
  };
  // 未指定位置时默认插入到最右侧；场上无仆从时即为中间。
  const index =
    position == null ? ps.board.length : Math.max(0, Math.min(position, ps.board.length));
  ps.board.splice(index, 0, minion);
  events.push({ type: 'summon', side, minionId: minion.id, index });
}

// 出牌：由当前行动方（state.activeSide）打出手牌中的一张。
// engine 假定动作合法性由调用方（UI/AI）保证，非法动作将抛出错误。
export function playCard(state: BattleState, action: PlayCardAction, _rng?: unknown): BattleResult {
  const s = structuredClone(state);
  const events: BattleEvent[] = [];
  if (isEnded(s)) return { state: s, events };

  const side = s.activeSide;
  const ps = sideState(s, side);
  const handIdx = ps.hand.findIndex((c) => c.id === action.cardId);
  if (handIdx < 0) throw new Error(`card not in hand: ${action.cardId}`);

  const instance = ps.hand[handIdx];
  const def = s.cardDb[instance.defId];
  if (!def) throw new Error(`unknown card def: ${instance.defId}`);
  if (ps.energy < def.cost) throw new Error('not enough energy');

  // 指向性卡目标校验。
  if (def.targeting?.needsTarget) {
    if (!action.target) throw new Error('target required');
    const legal = legalTargets(s, side, def);
    if (!legal.some((t) => targetsEqual(t, action.target!))) {
      throw new Error('illegal target');
    }
  }

  // 仆从容量预校验（在扣费/移除手牌之前）。
  if (def.type === 'minion') {
    const md = def.minion!;
    if (boardUsage(ps.board) + md.size > BOARD_CAPACITY) {
      throw new Error('board is full: cannot summon minion');
    }
  }

  ps.energy -= def.cost;
  ps.hand.splice(handIdx, 1);
  events.push({ type: 'playCard', side, cardId: instance.id, target: action.target });

  if (def.type === 'minion') {
    summonMinion(s, side, def, instance, action.position, events);
  } else {
    applyEffectToTarget(s, def, instance, side, action.target!, events);
  }

  return { state: s, events };
}
