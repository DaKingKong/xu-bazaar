// 卡牌效果结算与召唤。

import { drawOne } from './draw.ts';
import {
  activateOrStackHell,
  boardUsage,
  clampCombatInsertIndex,
  combatMinions,
  damageHero,
  damageMinion,
  isEnded,
  isRitual,
  nextId,
  otherSide,
  pushDiscard,
  scaleAttributeGain,
  setRitualSummonHook,
  sideState,
} from './helpers.ts';
import type {
  BattleEvent,
  BattleState,
  CardDef,
  CardEffect,
  CardInstance,
  Minion,
  RitualKey,
  Side,
  TargetRef,
} from './types.ts';
import { BOARD_CAPACITY, RITUAL_DEFS } from './types.ts';

function targetsEqual(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind || a.side !== b.side) return false;
  if (a.kind === 'minion' && b.kind === 'minion') return a.id === b.id;
  return true;
}

export { targetsEqual };

export function createMinionFromDef(
  def: CardDef,
  instanceId: string,
  extras?: { rebirth?: number },
): Minion {
  const md = def.minion!;
  return {
    id: `m_${instanceId}`,
    defId: def.defId,
    attack: md.attack,
    hp: md.hp,
    maxHp: md.hp,
    size: md.size,
    keywords: [...md.keywords],
    tags: [...(md.tags ?? [])],
    rebirth: extras?.rebirth,
  };
}

export function trySummon(
  state: BattleState,
  side: Side,
  defId: string,
  events: BattleEvent[],
  opts?: { position?: number; rebirth?: number; instanceId?: string },
): Minion | null {
  const def = state.cardDb[defId];
  if (!def?.minion) return null;
  const ps = sideState(state, side);
  if (boardUsage(ps.board) + def.minion.size > BOARD_CAPACITY) return null;

  const instanceId = opts?.instanceId ?? nextId(state, `sum-${side}`);
  const minion = createMinionFromDef(def, instanceId, { rebirth: opts?.rebirth });
  // 参战仆从插在仪式区左侧；默认贴着仪式区（最右参战位）。
  const index = clampCombatInsertIndex(ps.board, opts?.position);
  ps.board.splice(index, 0, minion);
  events.push({ type: 'summon', side, minionId: minion.id, index, defId: def.defId });

  if (def.defId === 'token-kest') {
    activateOrStackHell(state, events);
  }

  if (def.onEnter) {
    for (const effect of def.onEnter) {
      applyCardEffect(state, side, effect, events, {
        sourceDef: def,
        hostMinionId: minion.id,
      });
    }
  }

  return minion;
}

function ritualSummonDefId(key: RitualKey): string {
  return key === 'demonPortal' ? 'token-imp-portal' : 'token-kest';
}

function onRitualThreshold(
  state: BattleState,
  side: Side,
  ritual: Minion,
  events: BattleEvent[],
): void {
  const key = ritual.ritual?.ritualKey;
  if (!key) return;
  trySummon(state, side, ritualSummonDefId(key), events);
}

setRitualSummonHook(onRitualThreshold);

export function isRitualSpell(def: CardDef): boolean {
  return !!def.effects?.some((e) => e.type === 'ritual');
}

export function createRitualUnit(
  def: CardDef,
  ritualKey: RitualKey,
  instanceId: string,
): Minion {
  const meta = RITUAL_DEFS[ritualKey];
  return {
    id: `ritual_${instanceId}`,
    defId: def.defId,
    attack: 0,
    hp: meta.hp,
    maxHp: meta.hp,
    size: meta.size,
    keywords: [],
    tags: meta.large ? ['large'] : [],
    ritual: { ritualKey, sacrifice: 0 },
  };
}

export function tryPlaceRitual(
  state: BattleState,
  side: Side,
  def: CardDef,
  ritualKey: RitualKey,
  events: BattleEvent[],
  opts?: { position?: number; instanceId?: string },
): Minion | null {
  const meta = RITUAL_DEFS[ritualKey];
  const ps = sideState(state, side);
  if (boardUsage(ps.board) + meta.size > BOARD_CAPACITY) return null;

  const instanceId = opts?.instanceId ?? nextId(state, `rit-${side}`);
  const unit = createRitualUnit(def, ritualKey, instanceId);
  // 仪式永远贴在棋盘最右侧（现有仪式之后）。
  const index = ps.board.length;
  ps.board.splice(index, 0, unit);
  events.push({ type: 'summon', side, minionId: unit.id, index, defId: def.defId });
  events.push({
    type: 'ritualUpdate',
    side,
    ritualId: unit.id,
    sacrifice: 0,
    hp: unit.hp,
  });
  return unit;
}

export interface EffectContext {
  target?: TargetRef;
  targetCost?: number;
  sourceDef?: CardDef;
  playedInstance?: CardInstance;
  discardCardId?: string;
  position?: number;
  freeReplay?: boolean;
  /** 仪式已成功占位（勿再进弃牌） */
  ritualPlaced?: boolean;
  /** 仪式因场满未能占位 */
  ritualFailed?: boolean;
  /** 入场效果召唤时：次生仆从贴在该主仆从右侧 */
  hostMinionId?: string;
}

export function applyCardEffect(
  state: BattleState,
  actingSide: Side,
  effect: CardEffect,
  events: BattleEvent[],
  ctx: EffectContext = {},
): void {
  if (isEnded(state)) return;

  switch (effect.type) {
    case 'damage': {
      if (!ctx.target) return;
      if (ctx.target.kind === 'hero') {
        damageHero(state, ctx.target.side, effect.amount, events);
      } else {
        damageMinion(state, ctx.target.side, ctx.target.id, effect.amount, events);
      }
      break;
    }
    case 'heal': {
      if (!ctx.target) return;
      const target = ctx.target;
      const ps = sideState(state, target.side);
      if (target.kind === 'hero') {
        ps.hero.hp = Math.min(ps.hero.maxHp, ps.hero.hp + effect.amount);
      } else {
        const m = ps.board.find((x) => x.id === target.id);
        if (m && !isRitual(m)) m.hp = Math.min(m.maxHp, m.hp + effect.amount);
        else if (!m || isRitual(m)) return;
      }
      events.push({ type: 'heal', target, amount: effect.amount });
      break;
    }
    case 'draw': {
      for (let i = 0; i < effect.amount; i += 1) drawOne(state, actingSide, events);
      break;
    }
    case 'shield': {
      if (!ctx.target || ctx.target.kind !== 'minion') return;
      const target = ctx.target;
      const m = sideState(state, target.side).board.find((x) => x.id === target.id);
      if (!m || isRitual(m)) return;
      m.shield = (m.shield ?? 0) + effect.amount;
      events.push({ type: 'shield', target, amount: effect.amount });
      break;
    }
    case 'destroyTarget': {
      if (!ctx.target || ctx.target.kind !== 'minion') return;
      const target = ctx.target;
      const ps = sideState(state, target.side);
      const m = ps.board.find((x) => x.id === target.id);
      if (!m || isRitual(m)) return;
      ctx.targetCost = state.cardDb[m.defId]?.cost ?? 0;
      m.rebirth = 0;
      damageMinion(state, target.side, target.id, 9999, events);
      break;
    }
    case 'drawByTargetCost': {
      const n = ctx.targetCost ?? 0;
      for (let i = 0; i < n; i += 1) drawOne(state, actingSide, events);
      break;
    }
    case 'grantMultiAttack': {
      if (!ctx.target || ctx.target.kind !== 'minion') return;
      const target = ctx.target;
      const m = sideState(state, target.side).board.find((x) => x.id === target.id);
      if (!m || isRitual(m)) return;
      m.multiAttack = (m.multiAttack ?? 0) + effect.amount;
      break;
    }
    case 'grantSplash': {
      if (!ctx.target || ctx.target.kind !== 'minion') return;
      const target = ctx.target;
      const m = sideState(state, target.side).board.find((x) => x.id === target.id);
      if (!m || isRitual(m)) return;
      if (!m.keywords.includes('splash')) m.keywords.push('splash');
      break;
    }
    case 'summon': {
      const count = effect.count ?? 1;
      const ps = sideState(state, actingSide);
      for (let i = 0; i < count; i += 1) {
        let position: number | undefined;
        if (ctx.hostMinionId) {
          const hostIdx = ps.board.findIndex((m) => m.id === ctx.hostMinionId);
          if (hostIdx >= 0) position = hostIdx + 1 + i;
        }
        trySummon(state, actingSide, effect.defId, events, {
          rebirth: effect.rebirth,
          position,
        });
      }
      break;
    }
    case 'ritual': {
      const placed = tryPlaceRitual(state, actingSide, ctx.sourceDef!, effect.ritualKey, events, {
        position: ctx.position,
        instanceId: ctx.playedInstance?.id,
      });
      if (!placed && ctx.playedInstance) {
        // 场满：仪式卡进弃牌（由调用方决定是否再走 placeAfterCast）
        ctx.ritualFailed = true;
      } else if (placed) {
        ctx.ritualPlaced = true;
      }
      break;
    }
    case 'aoeDamageEnemies': {
      const opp = otherSide(actingSide);
      const minionIds = combatMinions(sideState(state, opp).board).map((m) => m.id);
      for (const id of minionIds) {
        if (isEnded(state)) return;
        damageMinion(state, opp, id, effect.amount, events);
      }
      if (!isEnded(state)) damageHero(state, opp, effect.amount, events);
      break;
    }
    case 'fragileEnemyMinions': {
      sideState(state, otherSide(actingSide)).incomingDamageMultiplier = 2;
      break;
    }
    case 'replayDiscard': {
      const ps = sideState(state, actingSide);
      const discardId = ctx.discardCardId;
      if (!discardId) throw new Error('discard card required');
      if (ctx.playedInstance && discardId === ctx.playedInstance.id) {
        throw new Error('cannot replay the just-played nether pull');
      }
      const dIdx = ps.discard.findIndex((c) => c.id === discardId);
      if (dIdx < 0) throw new Error('discard card not found');
      const [chosen] = ps.discard.splice(dIdx, 1);
      // 进弃牌时可能残留次数；回手按满施法数起算
      delete chosen.castsRemaining;
      const chosenDef = state.cardDb[chosen.defId];
      if (!chosenDef) throw new Error(`unknown card def: ${chosen.defId}`);

      if (chosenDef.targeting?.needsTarget && !ctx.target) {
        throw new Error('target required for replayed card');
      }

      // 弃牌 → 回手 → 免费打出一次
      ps.hand.push(chosen);
      events.push({
        type: 'playCard',
        side: actingSide,
        cardId: chosen.id,
        target: ctx.target,
      });
      const handIdx = ps.hand.findIndex((c) => c.id === chosen.id);
      if (handIdx >= 0) ps.hand.splice(handIdx, 1);

      const replayCtx: EffectContext = {
        target: ctx.target,
        position: ctx.position,
        freeReplay: true,
        playedInstance: chosen,
      };
      resolvePlayedCard(state, actingSide, chosen, chosenDef, events, replayCtx);
      if (chosenDef.type === 'spell') {
        if (!replayCtx.ritualPlaced) {
          placeAfterCast(state, actingSide, chosen, chosenDef, events);
        }
      } else if (chosenDef.type === 'attack') {
        delete chosen.castsRemaining;
        pushDiscard(state, actingSide, chosen, events);
      }
      break;
    }
    default:
      break;
  }
}

/** 当前实例还剩几次可打出（未设置时用原型施法数）。 */
export function castsLeft(instance: CardInstance, def: CardDef): number {
  return instance.castsRemaining ?? def.castCount ?? 1;
}

/**
 * 法术打出结算后：消耗 1 次施法数；有剩余则留手，否则进弃牌。
 * 仆从不走此路径（上场；死亡才进弃牌）。
 */
export function placeAfterCast(
  state: BattleState,
  side: Side,
  instance: CardInstance,
  def: CardDef,
  events: BattleEvent[],
): void {
  const left = castsLeft(instance, def) - 1;
  if (left > 0) {
    instance.castsRemaining = left;
    sideState(state, side).hand.push(instance);
    return;
  }
  delete instance.castsRemaining;
  pushDiscard(state, side, instance, events);
}

export function resolvePlayedCard(
  state: BattleState,
  actingSide: Side,
  instance: CardInstance,
  def: CardDef,
  events: BattleEvent[],
  ctx: EffectContext,
): void {
  if (def.type === 'minion') {
    const m = trySummon(state, actingSide, def.defId, events, {
      position: ctx.position,
      instanceId: instance.id,
    });
    if (!m) {
      pushDiscard(state, actingSide, instance, events);
    }
    return;
  }

  const effectList: CardEffect[] =
    def.effects && def.effects.length > 0 ? def.effects : legacyEffects(def, instance);

  const shared: EffectContext = {
    ...ctx,
    playedInstance: instance,
    sourceDef: def,
  };
  for (const effect of effectList) {
    applyCardEffect(state, actingSide, effect, events, shared);
  }
  // 把仪式占位结果回写，供 playCard / replay 决定是否进弃牌
  ctx.ritualPlaced = shared.ritualPlaced;
  ctx.ritualFailed = shared.ritualFailed;
}

function legacyEffects(def: CardDef, instance: CardInstance): CardEffect[] {
  const out: CardEffect[] = [];
  if (def.heal != null) out.push({ type: 'heal', amount: def.heal });
  const dmg = instance.overrideDamage ?? def.damage;
  if (dmg != null && dmg > 0) out.push({ type: 'damage', amount: dmg });
  return out;
}

export function grantAttackBonus(minion: Minion, amount: number): void {
  minion.attack += scaleAttributeGain(minion, amount);
}
