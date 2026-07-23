// 引擎内部共享工具：状态访问、目标解析、伤害/死亡结算。
// 纯 TS，不依赖 UI。所有函数直接在（调用方已克隆的）状态上就地修改。

import type {
  BattleEvent,
  BattleState,
  CardInstance,
  Minion,
  MinionTag,
  PlayerState,
  RitualEffect,
  Side,
  TargetRef,
} from './types.ts';

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

export function tauntsOf(board: Minion[]): Minion[] {
  return board.filter((m) => m.keywords.includes('taunt'));
}

export function hasTag(m: Minion, tag: MinionTag): boolean {
  return m.tags.includes(tag);
}

export function nextId(state: BattleState, prefix: string): string {
  state.nextEntitySeq = (state.nextEntitySeq ?? 0) + 1;
  return `${prefix}_${state.nextEntitySeq}`;
}

/** 大型：属性增益 +50%（向上取整）。 */
export function scaleAttributeGain(minion: Minion, gain: number): number {
  if (gain === 0) return 0;
  if (hasTag(minion, 'large')) return Math.ceil(gain * 1.5);
  return gain;
}

export function pushDiscard(
  state: BattleState,
  side: Side,
  card: CardInstance,
  events: BattleEvent[],
): void {
  const ps = sideState(state, side);
  ps.discard.push(card);
  events.push({ type: 'discard', side, cardId: card.id });
}

const RITUAL_THRESHOLDS: Record<RitualEffect['ritualKey'], number> = {
  demonPortal: 5,
  hellBeast: 7,
};

/** 友方仆从真正死亡（非重生）后：进弃牌、推进仪式。 */
export function onMinionRemoved(
  state: BattleState,
  side: Side,
  minion: Minion,
  events: BattleEvent[],
): void {
  pushDiscard(
    state,
    side,
    { id: nextId(state, `gy-${side}`), defId: minion.defId },
    events,
  );
  notifyRitualsOnFriendlyDeath(state, side, events);
}

function notifyRitualsOnFriendlyDeath(
  state: BattleState,
  side: Side,
  events: BattleEvent[],
): void {
  const ps = sideState(state, side);
  for (const ritual of ps.rituals) {
    ritual.sacrifice += 1;
    if (ritual.ritualKey === 'hellBeast') {
      ps.hero.hp = Math.min(ps.hero.maxHp, ps.hero.hp + 2);
      events.push({ type: 'heal', target: heroRef(side), amount: 2 });
    }
    events.push({
      type: 'ritualUpdate',
      side,
      ritualId: ritual.id,
      sacrifice: ritual.sacrifice,
    });
  }
}

/**
 * 尝试触发仪式献祭达标召唤。由 play/resolve 在死亡链之后调用，
 * 避免在 damage 深处递归召唤过深；也可在死亡后立即调用。
 */
export type RitualSummonHook = (
  state: BattleState,
  side: Side,
  ritual: RitualEffect,
  events: BattleEvent[],
) => void;

let ritualSummonHook: RitualSummonHook | null = null;

export function setRitualSummonHook(hook: RitualSummonHook | null): void {
  ritualSummonHook = hook;
}

export function checkRitualThresholds(
  state: BattleState,
  side: Side,
  events: BattleEvent[],
): void {
  const ps = sideState(state, side);
  for (const ritual of ps.rituals) {
    const need = RITUAL_THRESHOLDS[ritual.ritualKey];
    while (ritual.sacrifice >= need) {
      ritual.sacrifice -= need;
      events.push({
        type: 'ritualUpdate',
        side,
        ritualId: ritual.id,
        sacrifice: ritual.sacrifice,
      });
      ritualSummonHook?.(state, side, ritual, events);
    }
  }
}

/** 造成伤害前的最终数值：装甲、易伤倍率。 */
export function computeIncomingDamage(
  state: BattleState,
  side: Side,
  minion: Minion | null,
  amount: number,
): number {
  if (amount <= 0) return 0;
  let dmg = amount;
  const ps = sideState(state, side);
  if (minion && (ps.incomingDamageMultiplier ?? 1) !== 1) {
    dmg = Math.floor(dmg * (ps.incomingDamageMultiplier ?? 1));
  }
  if (minion?.armor && minion.armor > 0) {
    dmg = Math.max(0, dmg - minion.armor);
  }
  return dmg;
}

function applyShieldThenHp(minion: Minion, amount: number): number {
  let dmg = amount;
  if (minion.shield && minion.shield > 0) {
    const absorb = Math.min(minion.shield, dmg);
    minion.shield -= absorb;
    dmg -= absorb;
  }
  if (dmg > 0) minion.hp -= dmg;
  return dmg;
}

/**
 * 对仆从造成伤害；护盾优先；重生可阻止移除。
 * 返回：未命中/无伤害 → false；真正击杀移除 → true；命中但存活或重生 → false。
 * 若发生重生，opts.outReborn?.value 会设为 true。
 */
export function damageMinion(
  state: BattleState,
  side: Side,
  minionId: string,
  amount: number,
  events: BattleEvent[],
  opts?: {
    fromLifestealSource?: { side: Side; minionId: string };
    /** 若本次伤害触发了重生，设为 true（供自动战斗取消后续连击） */
    outReborn?: { value: boolean };
  },
): boolean {
  const ps = sideState(state, side);
  const idx = ps.board.findIndex((m) => m.id === minionId);
  if (idx < 0) return false;
  const minion = ps.board[idx];
  const dmg = computeIncomingDamage(state, side, minion, amount);
  if (dmg <= 0) return false;

  applyShieldThenHp(minion, dmg);

  if (opts?.fromLifestealSource && dmg > 0) {
    maybeLifesteal(state, opts.fromLifestealSource.side, opts.fromLifestealSource.minionId, events);
  }

  if (minion.hp > 0) return false;

  if ((minion.rebirth ?? 0) > 0) {
    minion.rebirth = (minion.rebirth ?? 0) - 1;
    minion.hp = minion.maxHp;
    // 行动完成标记继承重生前（已攻击的仍算本回合已行动）
    events.push({ type: 'rebirth', side, minionId });
    if (opts?.outReborn) opts.outReborn.value = true;
    return false;
  }

  const dead = ps.board.splice(idx, 1)[0];
  events.push({ type: 'death', side, minionId });
  onMinionRemoved(state, side, dead, events);
  checkRitualThresholds(state, side, events);
  return true;
}

/** 凯斯提：场地为地狱时，造成伤害回复 5。 */
export function maybeLifesteal(
  state: BattleState,
  side: Side,
  minionId: string,
  events: BattleEvent[],
): void {
  if ((state.hell?.intensity ?? 0) <= 0) return;
  const m = sideState(state, side).board.find((x) => x.id === minionId);
  if (!m) return;
  const def = state.cardDb[m.defId];
  // 仅凯斯提带「若场地为地狱，吸血 5」——用 defId 识别
  if (def?.defId !== 'token-kest') return;
  m.hp = Math.min(m.maxHp, m.hp + 5);
  events.push({ type: 'heal', target: minionRef(side, m.id), amount: 5 });
}

export function damageHero(
  state: BattleState,
  side: Side,
  amount: number,
  events: BattleEvent[],
): boolean {
  if (isEnded(state)) return false;
  const ps = sideState(state, side);
  ps.hero.hp -= amount;
  if (ps.hero.hp <= 0) {
    ps.hero.hp = 0;
    const winner = otherSide(side);
    state.winner = winner;
    state.phase = 'ended';
    events.push({ type: 'gameOver', winner });
    return true;
  }
  return false;
}

/** 查当前英雄的技能原型；无技能则 null。 */
export function heroSkillDef(state: BattleState, side: Side) {
  const hero = sideState(state, side).hero;
  const def = state.heroDb[hero.defId];
  return def?.skill ?? null;
}

/** 回合末：清护盾、清易伤。 */
export function clearEndOfRoundEffects(state: BattleState): void {
  for (const side of ['player', 'enemy'] as Side[]) {
    const ps = sideState(state, side);
    ps.incomingDamageMultiplier = undefined;
    for (const m of ps.board) {
      m.shield = 0;
    }
  }
}

/** 地狱回合伤害：对所有非地狱 TAG 仆从。 */
export function resolveHellTick(state: BattleState, events: BattleEvent[]): void {
  const intensity = state.hell?.intensity ?? 0;
  if (intensity <= 0) return;
  const amount = 2 + (intensity - 1) * 2;
  for (const side of ['player', 'enemy'] as Side[]) {
    const ids = sideState(state, side).board.map((m) => m.id);
    for (const id of ids) {
      if (isEnded(state)) return;
      const m = sideState(state, side).board.find((x) => x.id === id);
      if (!m || hasTag(m, 'hell')) continue;
      damageMinion(state, side, id, amount, events);
    }
  }
}

export function activateOrStackHell(state: BattleState, events: BattleEvent[]): void {
  if (!state.hell) state.hell = { intensity: 0 };
  state.hell.intensity += 1;
  events.push({ type: 'hellChange', intensity: state.hell.intensity });
}

export { RITUAL_THRESHOLDS };
