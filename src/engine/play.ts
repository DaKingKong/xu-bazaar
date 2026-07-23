// 出牌：仆从召唤 / 直接攻击卡 / 法术卡。

import {
  boardUsage,
  damageHero,
  damageMinion,
  isEnded,
  otherSide,
  pushDiscard,
  sideState,
  tauntsOf,
} from './helpers.ts';
import { resolvePlayedCard, targetsEqual } from './resolve.ts';
import type {
  BattleEvent,
  BattleResult,
  BattleState,
  CardInstance,
  PlayCardAction,
  Side,
  TargetRef,
  TargetingRule,
} from './types.ts';
import { BOARD_CAPACITY } from './types.ts';

export function legalTargets(
  state: BattleState,
  actingSide: Side,
  def: { targeting?: TargetingRule },
): TargetRef[] {
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

export function legalDiscardTargets(
  state: BattleState,
  actingSide: Side,
  excludeCardId?: string,
): CardInstance[] {
  return sideState(state, actingSide).discard.filter((c) => c.id !== excludeCardId);
}

function targetAttack(state: BattleState, target: TargetRef): number {
  const ps = sideState(state, target.side);
  if (target.kind === 'hero') return ps.hero.attack;
  const m = ps.board.find((x) => x.id === target.id);
  return m ? m.attack : 0;
}

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

  if (def.targeting?.needsTarget) {
    if (!action.target) throw new Error('target required');
    const legal = legalTargets(s, side, def);
    if (!legal.some((t) => targetsEqual(t, action.target!))) {
      throw new Error('illegal target');
    }
  }

  if (def.targeting?.needsDiscard) {
    if (!action.discardCardId) throw new Error('discard card required');
    if (action.discardCardId === instance.id) {
      throw new Error('cannot choose the card being played');
    }
    if (!ps.discard.some((c) => c.id === action.discardCardId)) {
      throw new Error('illegal discard target');
    }
  }

  if (def.type === 'minion') {
    const md = def.minion!;
    if (boardUsage(ps.board) + md.size > BOARD_CAPACITY) {
      throw new Error('board is full: cannot summon minion');
    }
  }

  ps.energy -= def.cost;
  ps.hand.splice(handIdx, 1);
  events.push({ type: 'playCard', side, cardId: instance.id, target: action.target });

  if (def.type === 'attack') {
    const target = action.target!;
    const dmg = instance.overrideDamage ?? def.damage ?? 0;
    const counter = targetAttack(s, target);
    if (target.kind === 'hero') {
      damageHero(s, target.side, dmg, events);
    } else {
      damageMinion(s, target.side, target.id, dmg, events);
    }
    if (counter > 0 && !isEnded(s)) {
      events.push({ type: 'counter', unit: { kind: 'hero', side }, damage: counter });
      damageHero(s, side, counter, events);
    }
    pushDiscard(s, side, instance, events);
    return { state: s, events };
  }

  resolvePlayedCard(s, side, instance, def, events, {
    target: action.target,
    position: action.position,
    discardCardId: action.discardCardId,
    playedInstance: instance,
  });

  // 法术进弃牌；仆从在死亡时进弃牌（召唤成功时不进）
  if (def.type === 'spell') {
    pushDiscard(s, side, instance, events);
  }

  return { state: s, events };
}
