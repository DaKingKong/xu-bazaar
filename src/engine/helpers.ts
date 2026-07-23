// 引擎内部共享工具：状态访问、目标解析、伤害/死亡结算。
// 纯 TS，不依赖 UI。所有函数直接在（调用方已克隆的）状态上就地修改。

import type {
  BattleEvent,
  BattleState,
  CardInstance,
  Minion,
  MinionTag,
  PlayerState,
  RitualKey,
  Side,
  TargetRef,
} from './types.ts';
import { RITUAL_DEFS } from './types.ts';

export function otherSide(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

export function sideState(state: BattleState, side: Side): PlayerState {
  return side === 'player' ? state.player : state.enemy;
}

export function isRitual(m: Minion): boolean {
  return m.ritual != null;
}

/** 参战仆从（排除仪式占位）。 */
export function combatMinions(board: Minion[]): Minion[] {
  return board.filter((m) => !isRitual(m));
}

/** 仪式占位（棋盘右侧区）。 */
export function ritualMinions(board: Minion[]): Minion[] {
  return board.filter(isRitual);
}

/**
 * 第一个仪式下标；无仪式时为 board.length。
 * 不变量：board = [...combatMinions, ...ritualMinions]。
 */
export function firstRitualIndex(board: Minion[]): number {
  const i = board.findIndex(isRitual);
  return i < 0 ? board.length : i;
}

/** 将 board 规范为「仆从在左、仪式在右」，各组内相对顺序不变。 */
export function normalizeBoardOrder(board: Minion[]): Minion[] {
  return [...combatMinions(board), ...ritualMinions(board)];
}

/**
 * 参战仆从插入下标：夹到仪式区之前。
 * `position == null` → 插在仪式区正前方（最右参战位）。
 */
export function clampCombatInsertIndex(board: Minion[], position?: number): number {
  const end = firstRitualIndex(board);
  if (position == null) return end;
  return Math.max(0, Math.min(position, end));
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
  return combatMinions(board).filter((m) => m.keywords.includes('taunt'));
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

export const RITUAL_THRESHOLDS: Record<RitualKey, number> = {
  demonPortal: RITUAL_DEFS.demonPortal.threshold,
  hellBeast: RITUAL_DEFS.hellBeast.threshold,
};

/** 仆从真正死亡（非重生）后：进弃牌、推进仪式。 */
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
  notifyRitualsOnMinionDeath(state, side, events);
}

/**
 * 死亡侧为 `deathSide`。
 * - 恶魔传送门：任意仆从死亡都 +1（双方各自的传送门都计）
 * - 地狱兽仪式：仅死亡侧友方仪式 +1，并回复该侧领主 +2
 */
function notifyRitualsOnMinionDeath(
  state: BattleState,
  deathSide: Side,
  events: BattleEvent[],
): void {
  for (const owner of ['player', 'enemy'] as Side[]) {
    const ps = sideState(state, owner);
    for (const unit of ps.board) {
      if (!unit.ritual) continue;
      const key = unit.ritual.ritualKey;
      if (key === 'hellBeast' && owner !== deathSide) continue;
      if (key !== 'demonPortal' && key !== 'hellBeast') continue;

      unit.ritual.sacrifice += 1;
      if (key === 'hellBeast') {
        ps.hero.hp = Math.min(ps.hero.maxHp, ps.hero.hp + 2);
        events.push({ type: 'heal', target: heroRef(owner), amount: 2 });
      }
      events.push({
        type: 'ritualUpdate',
        side: owner,
        ritualId: unit.id,
        sacrifice: unit.ritual.sacrifice,
        hp: unit.hp,
      });
    }
  }
}

/**
 * 尝试触发仪式献祭达标召唤。由 play/resolve 在死亡链之后调用，
 * 避免在 damage 深处递归召唤过深；也可在死亡后立即调用。
 */
export type RitualSummonHook = (
  state: BattleState,
  side: Side,
  ritual: Minion,
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
  const ritualIds = ps.board.filter(isRitual).map((m) => m.id);
  for (const id of ritualIds) {
    const unit = ps.board.find((m) => m.id === id);
    if (!unit?.ritual) continue;
    const need = RITUAL_THRESHOLDS[unit.ritual.ritualKey];
    while (unit.ritual.sacrifice >= need) {
      unit.ritual.sacrifice -= need;
      ritualSummonHook?.(state, side, unit, events);
      unit.hp -= 1;
      events.push({
        type: 'ritualUpdate',
        side,
        ritualId: unit.id,
        sacrifice: unit.ritual.sacrifice,
        hp: unit.hp,
      });
      if (unit.hp <= 0) {
        const idx = ps.board.findIndex((m) => m.id === id);
        if (idx >= 0) {
          const dead = ps.board.splice(idx, 1)[0]!;
          events.push({ type: 'death', side, minionId: dead.id });
          pushDiscard(
            state,
            side,
            { id: nextId(state, `gy-${side}`), defId: dead.defId },
            events,
          );
        }
        break;
      }
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
 * 仪式占位免疫伤害。
 * 返回：未命中/无伤害 → false；真正击杀移除 → true；命中但存活或重生 → false。
 * 重生仍计一次死亡（献祭等），但不发 death、不进弃牌。
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
  const minion = ps.board[idx]!;
  if (isRitual(minion)) return false;
  const dmg = computeIncomingDamage(state, side, minion, amount);
  if (dmg <= 0) return false;

  applyShieldThenHp(minion, dmg);

  if (opts?.fromLifestealSource && dmg > 0) {
    maybeLifesteal(state, opts.fromLifestealSource.side, opts.fromLifestealSource.minionId, events);
  }

  if (minion.hp > 0) return false;

  // 重生：仍视为一次死亡（推进献祭等），但不离场、不进弃牌。
  if ((minion.rebirth ?? 0) > 0) {
    minion.rebirth = (minion.rebirth ?? 0) - 1;
    minion.hp = minion.maxHp;
    notifyRitualsOnMinionDeath(state, side, events);
    checkRitualThresholds(state, 'player', events);
    checkRitualThresholds(state, 'enemy', events);
    // 行动完成标记继承重生前（已攻击的仍算本回合已行动）
    events.push({ type: 'rebirth', side, minionId });
    if (opts?.outReborn) opts.outReborn.value = true;
    return false;
  }

  const dead = ps.board.splice(idx, 1)[0]!;
  events.push({ type: 'death', side, minionId });
  onMinionRemoved(state, side, dead, events);
  // 传送门可能在非死亡侧也推进，两侧都要检查达标
  checkRitualThresholds(state, 'player', events);
  checkRitualThresholds(state, 'enemy', events);
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
  if (!m || isRitual(m)) return;
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
      if (isRitual(m)) continue;
      m.shield = 0;
    }
  }
}

/** 地狱回合伤害：对所有非地狱 TAG 仆从（跳过仪式）。 */
export function resolveHellTick(state: BattleState, events: BattleEvent[]): void {
  const intensity = state.hell?.intensity ?? 0;
  if (intensity <= 0) return;
  const amount = 2 + (intensity - 1) * 2;
  for (const side of ['player', 'enemy'] as Side[]) {
    const ids = combatMinions(sideState(state, side).board).map((m) => m.id);
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
