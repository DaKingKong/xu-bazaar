// 英雄技能：消耗能量、指向性效果、词条（如击杀：抽取）。
// 每回合至多使用一次。

import { resolveTriggered } from './effects.ts';
import {
  damageHero,
  damageMinion,
  heroSkillDef,
  isEnded,
  sideState,
} from './helpers.ts';
import { legalTargets } from './play.ts';
import type {
  BattleEvent,
  BattleResult,
  BattleState,
  SkillDef,
  TargetRef,
  UseSkillAction,
} from './types.ts';

function targetsEqual(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind || a.side !== b.side) return false;
  if (a.kind === 'minion' && b.kind === 'minion') return a.id === b.id;
  return true;
}

function applySkillToTarget(
  state: BattleState,
  skill: SkillDef,
  target: TargetRef,
  events: BattleEvent[],
): boolean {
  if (skill.heal != null) {
    const ps = sideState(state, target.side);
    if (target.kind === 'hero') {
      ps.hero.hp = Math.min(ps.hero.maxHp, ps.hero.hp + skill.heal);
    } else {
      const m = ps.board.find((x) => x.id === target.id);
      if (m) m.hp = Math.min(m.maxHp, m.hp + skill.heal);
    }
    events.push({ type: 'heal', target, amount: skill.heal });
    return false;
  }

  const dmg = skill.damage ?? 0;
  if (dmg <= 0) return false;

  if (target.kind === 'hero') {
    return damageHero(state, target.side, dmg, events);
  }
  return damageMinion(state, target.side, target.id, dmg, events);
}

/** 当前行动方使用英雄技能。 */
export function useSkill(state: BattleState, action: UseSkillAction, _rng?: unknown): BattleResult {
  const s = structuredClone(state);
  const events: BattleEvent[] = [];
  if (isEnded(s)) return { state: s, events };

  const side = s.activeSide;
  const ps = sideState(s, side);
  const skill = heroSkillDef(s, side);
  if (!skill) throw new Error('hero has no skill');
  if (ps.hero.skillUsedThisTurn) throw new Error('skill already used this turn');
  if (ps.energy < skill.cost) throw new Error('not enough energy');

  if (skill.targeting?.needsTarget) {
    if (!action.target) throw new Error('target required');
    const legal = legalTargets(s, side, skill);
    if (!legal.some((t) => targetsEqual(t, action.target!))) {
      throw new Error('illegal target');
    }
  }

  ps.energy -= skill.cost;
  ps.hero.skillUsedThisTurn = true;
  events.push({
    type: 'useSkill',
    side,
    skillId: skill.skillId,
    target: action.target,
  });

  let killed = false;
  if (skill.targeting?.needsTarget || skill.damage != null || skill.heal != null) {
    killed = applySkillToTarget(s, skill, action.target!, events);
  }

  if (killed) {
    resolveTriggered(s, side, skill.triggered, 'onKill', events);
  }

  return { state: s, events };
}
