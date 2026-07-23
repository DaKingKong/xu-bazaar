// 卡牌效果结算与召唤。

import { drawOne } from './draw.ts';
import {
  activateOrStackHell,
  boardUsage,
  damageHero,
  damageMinion,
  isEnded,
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
import { BOARD_CAPACITY } from './types.ts';

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
  const index =
    opts?.position == null
      ? ps.board.length
      : Math.max(0, Math.min(opts.position, ps.board.length));
  ps.board.splice(index, 0, minion);
  events.push({ type: 'summon', side, minionId: minion.id, index });

  if (def.defId === 'token-kest') {
    activateOrStackHell(state, events);
  }

  if (def.onEnter) {
    for (const effect of def.onEnter) {
      applyCardEffect(state, side, effect, events, { sourceDef: def });
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
  ritual: { ritualKey: RitualKey },
  events: BattleEvent[],
): void {
  trySummon(state, side, ritualSummonDefId(ritual.ritualKey), events);
}

setRitualSummonHook(onRitualThreshold);

export interface EffectContext {
  target?: TargetRef;
  targetCost?: number;
  sourceDef?: CardDef;
  playedInstance?: CardInstance;
  discardCardId?: string;
  position?: number;
  freeReplay?: boolean;
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
        if (m) m.hp = Math.min(m.maxHp, m.hp + effect.amount);
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
      if (!m) return;
      m.shield = (m.shield ?? 0) + effect.amount;
      events.push({ type: 'shield', target, amount: effect.amount });
      break;
    }
    case 'destroyTarget': {
      if (!ctx.target || ctx.target.kind !== 'minion') return;
      const target = ctx.target;
      const ps = sideState(state, target.side);
      const m = ps.board.find((x) => x.id === target.id);
      if (m) ctx.targetCost = state.cardDb[m.defId]?.cost ?? 0;
      if (m) m.rebirth = 0;
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
      if (!m) return;
      m.multiAttack = (m.multiAttack ?? 0) + effect.amount;
      break;
    }
    case 'grantSplash': {
      if (!ctx.target || ctx.target.kind !== 'minion') return;
      const target = ctx.target;
      const m = sideState(state, target.side).board.find((x) => x.id === target.id);
      if (!m) return;
      if (!m.keywords.includes('splash')) m.keywords.push('splash');
      break;
    }
    case 'summon': {
      const count = effect.count ?? 1;
      for (let i = 0; i < count; i += 1) {
        trySummon(state, actingSide, effect.defId, events, { rebirth: effect.rebirth });
      }
      break;
    }
    case 'ritual': {
      const ps = sideState(state, actingSide);
      const ritual = {
        id: nextId(state, `ritual-${actingSide}`),
        ritualKey: effect.ritualKey,
        sacrifice: 0,
      };
      ps.rituals.push(ritual);
      events.push({
        type: 'ritualUpdate',
        side: actingSide,
        ritualId: ritual.id,
        sacrifice: 0,
      });
      break;
    }
    case 'aoeDamageEnemies': {
      const opp = otherSide(actingSide);
      const minionIds = sideState(state, opp).board.map((m) => m.id);
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
      const chosenDef = state.cardDb[chosen.defId];
      if (!chosenDef) throw new Error(`unknown card def: ${chosen.defId}`);

      if (chosenDef.targeting?.needsTarget && !ctx.target) {
        throw new Error('target required for replayed card');
      }

      events.push({
        type: 'playCard',
        side: actingSide,
        cardId: chosen.id,
        target: ctx.target,
      });
      resolvePlayedCard(state, actingSide, chosen, chosenDef, events, {
        target: ctx.target,
        position: ctx.position,
        freeReplay: true,
        playedInstance: chosen,
      });
      if (chosenDef.type !== 'minion') {
        pushDiscard(state, actingSide, chosen, events);
      }
      break;
    }
    default:
      break;
  }
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

  const casts = def.castCount ?? 1;
  const effectList: CardEffect[] =
    def.effects && def.effects.length > 0 ? def.effects : legacyEffects(def, instance);

  for (let c = 0; c < casts; c += 1) {
    const shared: EffectContext = {
      ...ctx,
      playedInstance: instance,
      sourceDef: def,
    };
    for (const effect of effectList) {
      applyCardEffect(state, actingSide, effect, events, shared);
    }
  }
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
