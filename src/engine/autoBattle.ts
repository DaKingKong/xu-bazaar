// M3（自动战斗部分）：场上仆从自动结算。
// 见 docs/battle-design.md §8、§9。

import { pick } from './rng.ts';
import {
  damageHero,
  damageMinion,
  heroRef,
  isEnded,
  minionRef,
  otherSide,
  sideState,
  tauntsOf,
} from './helpers.ts';
import type { BattleEvent, BattleResult, BattleState, Minion, Rng, Side } from './types.ts';

// 从目标方场上按嘲讽优先规则随机选取一个仆从：
// 有嘲讽仆从则只能在嘲讽中随机；否则在全部仆从中随机。使用实时存活列表。
function chooseTargetMinion(board: Minion[], rng: Rng): Minion {
  const taunts = tauntsOf(board);
  const pool = taunts.length > 0 ? taunts : board;
  return pick(rng, pool);
}

// 单个仆从的一次攻击结算。
// 所有攻击均为「双向结算」：攻击方与被攻击方都会受到等同于对方攻击力的伤害。
// 仆从互打时伤害为「同时结算」——先各自读取对方攻击力，再一并扣血，
// 因此不会因先手把对方打死而少挨伤害（除非未来引入「先攻」类词条）。
function resolveMinionAttack(
  state: BattleState,
  attackerSide: Side,
  attackerId: string,
  rng: Rng,
  events: BattleEvent[],
): void {
  if (isEnded(state)) return;
  const attackerPS = sideState(state, attackerSide);
  const attacker = attackerPS.board.find((m) => m.id === attackerId);
  if (!attacker) return; // 已在本阶段死亡/移除
  if (attacker.attack === 0) return; // 攻击力 0 跳过

  const defSide = otherSide(attackerSide);
  const defBoard = sideState(state, defSide).board;

  if (defBoard.length > 0) {
    // 攻击敌方仆从：双向、同时结算。
    const target = chooseTargetMinion(defBoard, rng);
    // 先读取两侧攻击力快照，避免任一方先死导致伤害缺失。
    const attackerDamage = attacker.attack;
    const targetDamage = target.attack;
    const targetId = target.id;

    events.push({
      type: 'attack',
      attacker: minionRef(attackerSide, attacker.id),
      target: minionRef(defSide, targetId),
      damage: attackerDamage,
    });
    // 被攻击方对攻击方的同时反伤。
    if (targetDamage > 0) {
      events.push({
        type: 'counter',
        unit: minionRef(attackerSide, attacker.id),
        damage: targetDamage,
      });
    }
    // 同时扣血：两笔伤害都基于攻击前快照。
    damageMinion(state, defSide, targetId, attackerDamage, events);
    damageMinion(state, attackerSide, attacker.id, targetDamage, events);
    return;
  }

  // 打脸：目标方无仆从，攻击对方角色，双向结算。
  const defHero = sideState(state, defSide).hero;
  events.push({
    type: 'attack',
    attacker: minionRef(attackerSide, attacker.id),
    target: heroRef(defSide),
    damage: attacker.attack,
  });
  damageHero(state, defSide, attacker.attack, events);

  // 反伤：攻击方仆从受到等于对方角色攻击力的伤害。
  if (defHero.attack > 0) {
    events.push({
      type: 'counter',
      unit: minionRef(attackerSide, attacker.id),
      damage: defHero.attack,
    });
    damageMinion(state, attackerSide, attacker.id, defHero.attack, events);
  }
}

function resolveSideAttacks(state: BattleState, side: Side, rng: Rng, events: BattleEvent[]): void {
  // 快照攻击者顺序（左至右）；死亡即时影响后续目标选取，但攻击顺序固定。
  const order = sideState(state, side).board.map((m) => m.id);
  for (const id of order) {
    if (isEnded(state)) return;
    resolveMinionAttack(state, side, id, rng, events);
  }
}

// 自动战斗阶段：玩家仆从由左至右轮流攻击，随后敌方仆从攻击。
// 任一角色 HP 归零立即结束（即时判定）。若无胜负，回合数 +1，进入下一回合的敌人打牌阶段。
export function runAutoBattle(state: BattleState, rng: Rng): BattleResult {
  const s = structuredClone(state);
  const events: BattleEvent[] = [];
  if (isEnded(s)) return { state: s, events };

  s.phase = 'autoBattle';

  resolveSideAttacks(s, 'player', rng, events);
  if (!isEnded(s)) resolveSideAttacks(s, 'enemy', rng, events);

  if (!isEnded(s)) {
    s.turn += 1;
    s.phase = 'enemyPlay';
    s.activeSide = 'enemy';
    events.push({ type: 'phaseChange', phase: 'enemyPlay' });
  }

  return { state: s, events };
}
