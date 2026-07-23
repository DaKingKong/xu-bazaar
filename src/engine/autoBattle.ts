// 自动战斗：场上仆从自动结算 + 回合末地狱/清场效果。

import { pick } from './rng.ts';
import {
  clearEndOfRoundEffects,
  damageHero,
  damageMinion,
  heroRef,
  isEnded,
  maybeLifesteal,
  minionRef,
  otherSide,
  resolveHellTick,
  sideState,
  tauntsOf,
} from './helpers.ts';
import type { BattleEvent, BattleResult, BattleState, Minion, Rng, Side } from './types.ts';

function chooseTargetMinion(board: Minion[], rng: Rng): Minion {
  const taunts = tauntsOf(board);
  const pool = taunts.length > 0 ? taunts : board;
  return pick(rng, pool);
}

function adjacentMinionIds(board: Minion[], targetId: string): string[] {
  const idx = board.findIndex((m) => m.id === targetId);
  if (idx < 0) return [];
  const ids: string[] = [];
  if (idx > 0) ids.push(board[idx - 1]!.id);
  if (idx < board.length - 1) ids.push(board[idx + 1]!.id);
  return ids;
}

function resolveOneSwing(
  state: BattleState,
  attackerSide: Side,
  attackerId: string,
  rng: Rng,
  events: BattleEvent[],
): void {
  if (isEnded(state)) return;
  const attacker = sideState(state, attackerSide).board.find((m) => m.id === attackerId);
  if (!attacker) return;
  if (attacker.attack === 0) return;

  const defSide = otherSide(attackerSide);
  const defBoard = sideState(state, defSide).board;
  const lifestealOpts = { fromLifestealSource: { side: attackerSide, minionId: attackerId } };

  if (defBoard.length > 0) {
    const target = chooseTargetMinion(defBoard, rng);
    const attackerDamage = attacker.attack;
    const targetDamage = target.attack;
    const targetId = target.id;
    const splash = attacker.keywords.includes('splash');
    const adj = splash ? adjacentMinionIds(defBoard, targetId) : [];

    events.push({
      type: 'attack',
      attacker: minionRef(attackerSide, attacker.id),
      target: minionRef(defSide, targetId),
      damage: attackerDamage,
    });
    if (targetDamage > 0) {
      events.push({
        type: 'counter',
        unit: minionRef(attackerSide, attacker.id),
        damage: targetDamage,
      });
    }
    damageMinion(state, defSide, targetId, attackerDamage, events, lifestealOpts);
    damageMinion(state, attackerSide, attacker.id, targetDamage, events);

    if (splash && !isEnded(state)) {
      for (const adjId of adj) {
        if (isEnded(state)) break;
        if (!sideState(state, defSide).board.some((m) => m.id === adjId)) continue;
        damageMinion(state, defSide, adjId, attackerDamage, events, lifestealOpts);
      }
    }
    return;
  }

  const defHero = sideState(state, defSide).hero;
  events.push({
    type: 'attack',
    attacker: minionRef(attackerSide, attacker.id),
    target: heroRef(defSide),
    damage: attacker.attack,
  });
  damageHero(state, defSide, attacker.attack, events);
  maybeLifesteal(state, attackerSide, attackerId, events);

  if (defHero.attack > 0) {
    events.push({
      type: 'counter',
      unit: minionRef(attackerSide, attacker.id),
      damage: defHero.attack,
    });
    damageMinion(state, attackerSide, attacker.id, defHero.attack, events);
  }
}

function resolveMinionAttacks(
  state: BattleState,
  attackerSide: Side,
  attackerId: string,
  rng: Rng,
  events: BattleEvent[],
): void {
  const attacker = sideState(state, attackerSide).board.find((m) => m.id === attackerId);
  if (!attacker) return;
  const swings = 1 + (attacker.multiAttack ?? 0);
  for (let i = 0; i < swings; i += 1) {
    if (isEnded(state)) return;
    if (!sideState(state, attackerSide).board.some((m) => m.id === attackerId)) return;
    resolveOneSwing(state, attackerSide, attackerId, rng, events);
  }
}

function resolveSideAttacks(state: BattleState, side: Side, rng: Rng, events: BattleEvent[]): void {
  const order = sideState(state, side).board.map((m) => m.id);
  for (const id of order) {
    if (isEnded(state)) return;
    resolveMinionAttacks(state, side, id, rng, events);
  }
}

export function runAutoBattle(state: BattleState, rng: Rng): BattleResult {
  const s = structuredClone(state);
  const events: BattleEvent[] = [];
  if (isEnded(s)) return { state: s, events };

  s.phase = 'autoBattle';

  resolveSideAttacks(s, 'player', rng, events);
  if (!isEnded(s)) resolveSideAttacks(s, 'enemy', rng, events);

  if (!isEnded(s)) resolveHellTick(s, events);
  if (!isEnded(s)) clearEndOfRoundEffects(s);

  if (!isEnded(s)) {
    s.turn += 1;
    s.phase = 'enemyPlay';
    s.activeSide = 'enemy';
    events.push({ type: 'phaseChange', phase: 'enemyPlay' });
  }

  return { state: s, events };
}
