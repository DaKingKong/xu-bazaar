// 英雄原型定义（技能含词条：条件类 + 效果类）。

import type { HeroDef } from '../engine/types.ts';

export const DUMMY_HERO_ID = 'dummy';
export const HELL_WARLOCK_ID = 'hell-warlock';

/** 无特点的训练假人：敌人默认英雄，无技能。 */
export const DUMMY_HERO: HeroDef = {
  defId: DUMMY_HERO_ID,
  name: '训练假人',
  attack: 2,
  hp: 30,
  skill: null,
};

/**
 * 地狱术士（玩家默认英雄）。
 * 技能：2 费，对目标造成 2 伤害。击杀：抽取 1。
 */
export const HELL_WARLOCK: HeroDef = {
  defId: HELL_WARLOCK_ID,
  name: '地狱术士',
  attack: 2,
  hp: 30,
  skill: {
    skillId: 'hell-warlock-drain',
    name: '灵魂汲取',
    cost: 2,
    description: '对目标造成 2 点伤害。击杀：抽取 1。',
    damage: 2,
    targeting: {
      needsTarget: true,
      allowHero: true,
      respectTaunt: false,
      side: 'enemy',
    },
    triggered: [{ trigger: 'onKill', effects: [{ type: 'draw', amount: 1 }] }],
  },
};

export const HERO_DEFS: HeroDef[] = [DUMMY_HERO, HELL_WARLOCK];

export const HERO_DB: Record<string, HeroDef> = Object.fromEntries(
  HERO_DEFS.map((h) => [h.defId, h]),
);
