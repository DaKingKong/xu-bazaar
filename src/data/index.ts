// 静态卡牌/仆从/英雄定义数据（目录基础正文 + 血战机制卡）。

import type { CardDef, CardInstance } from '../engine/types.ts';

export {
  DUMMY_HERO,
  DUMMY_HERO_ID,
  HELL_WARLOCK,
  HELL_WARLOCK_ID,
  HERO_DB,
  HERO_DEFS,
} from './heroes.ts';

/** 疲劳机制生成的直接攻击卡（血战）。 */
export const FATIGUE_STRIKE_DEF_ID = 'blood-war';

const ATTACK_TARGETING = {
  needsTarget: true,
  allowHero: true,
  respectTaunt: true,
  side: 'enemy' as const,
};

const ANY_TARGET = {
  needsTarget: true,
  allowHero: true,
  respectTaunt: false,
  side: 'any' as const,
};

const ALLY_MINION = {
  needsTarget: true,
  allowHero: false,
  respectTaunt: false,
  side: 'ally' as const,
};

const ALLY_ANY = {
  needsTarget: true,
  allowHero: true,
  respectTaunt: false,
  side: 'ally' as const,
};

export const CARD_DEFS: CardDef[] = [
  // --- 机制 ---
  {
    defId: FATIGUE_STRIKE_DEF_ID,
    name: '血战',
    type: 'attack',
    cost: 0,
    description: '疲劳生成的直接攻击卡，攻击力随疲劳递增。',
    damage: 0,
    targeting: ATTACK_TARGETING,
  },

  // --- 仆从 ---
  {
    defId: 'minion-ice',
    name: '冰晶人',
    type: 'minion',
    cost: 1,
    description: '廉价的冰系仆从。',
    minion: { name: '冰晶人', attack: 1, hp: 3, size: 1, keywords: [] },
  },
  {
    defId: 'minion-flame',
    name: '火焰人',
    type: 'minion',
    cost: 1,
    description: '廉价的火系仆从。',
    minion: { name: '火焰人', attack: 3, hp: 1, size: 1, keywords: [] },
  },
  {
    defId: 'minion-golem-guard',
    name: '石像守卫',
    type: 'minion',
    cost: 3,
    description: '嘲讽。大型。',
    minion: {
      name: '石像守卫',
      attack: 2,
      hp: 10,
      size: 2,
      keywords: ['taunt'],
      tags: ['large'],
    },
  },
  {
    defId: 'minion-demon',
    name: '恶魔',
    type: 'minion',
    cost: 2,
    description: '入场：召唤 1 名小恶魔。',
    minion: {
      name: '恶魔',
      attack: 2,
      hp: 3,
      size: 1,
      keywords: [],
      tags: ['hell'],
    },
    onEnter: [{ type: 'summon', defId: 'token-imp-demon' }],
  },
  {
    defId: 'minion-scroll-cat',
    name: '书卷猫',
    type: 'minion',
    cost: 2,
    description: '入场：抽取 1。',
    minion: { name: '书卷猫', attack: 2, hp: 2, size: 1, keywords: [] },
    onEnter: [{ type: 'draw', amount: 1 }],
  },

  // --- Token ---
  {
    defId: 'token-imp-portal',
    name: '小恶魔',
    type: 'minion',
    cost: 1,
    description: '恶魔传送门的召唤物。',
    minion: {
      name: '小恶魔',
      attack: 1,
      hp: 2,
      size: 1,
      keywords: [],
      tags: ['hell'],
    },
  },
  {
    defId: 'token-imp-demon',
    name: '小恶魔',
    type: 'minion',
    cost: 1,
    description: '恶魔的召唤物。',
    minion: {
      name: '小恶魔',
      attack: 1,
      hp: 2,
      size: 1,
      keywords: [],
      tags: ['hell'],
    },
  },
  {
    defId: 'token-demon-summon',
    name: '恶魔',
    type: 'minion',
    cost: 2,
    description: '恶魔召唤的召唤物。',
    minion: {
      name: '恶魔',
      attack: 2,
      hp: 3,
      size: 1,
      keywords: [],
      tags: ['hell'],
    },
  },
  {
    defId: 'token-kest',
    name: '地狱兽凯斯提',
    type: 'minion',
    cost: 10,
    description: '入场：场地变为地狱。若场地为地狱，吸血 5。',
    minion: {
      name: '地狱兽凯斯提',
      attack: 10,
      hp: 30,
      size: 2,
      keywords: [],
      tags: ['large', 'hell'],
    },
  },

  // --- 法术 ---
  {
    defId: 'spell-fireball',
    name: '火球术',
    type: 'spell',
    cost: 3,
    description: '对目标造成 8 伤害。',
    castCount: 1,
    targeting: ANY_TARGET,
    effects: [{ type: 'damage', amount: 8 }],
  },
  {
    defId: 'spell-aegis',
    name: '灵光之盾',
    type: 'spell',
    cost: 2,
    description: '目标护盾 +4，抽取 1。（施法数 2：最多打出 2 次，每次扣费）',
    castCount: 2,
    targeting: ALLY_ANY,
    effects: [
      { type: 'shield', amount: 4 },
      { type: 'draw', amount: 1 },
    ],
  },
  {
    defId: 'spell-death-flow',
    name: '死亡流转',
    type: 'spell',
    cost: 1,
    description: '消灭 1 名友方仆从，抽取目标费用数量的卡牌。',
    targeting: ALLY_MINION,
    effects: [{ type: 'destroyTarget' }, { type: 'drawByTargetCost' }],
  },
  {
    defId: 'spell-haste-infusion',
    name: '神速灌注',
    type: 'spell',
    cost: 2,
    description: '目标获得多重攻击 +1。',
    targeting: ALLY_MINION,
    effects: [{ type: 'grantMultiAttack', amount: 1 }],
  },
  {
    defId: 'spell-claw-infusion',
    name: '利爪灌注',
    type: 'spell',
    cost: 3,
    description: '目标仆从获得溅射。',
    targeting: ALLY_MINION,
    effects: [{ type: 'grantSplash' }],
  },
  {
    defId: 'spell-demon-summon',
    name: '恶魔召唤',
    type: 'spell',
    cost: 3,
    description: '召唤 1 名恶魔，并赋予重生 +1。',
    effects: [{ type: 'summon', defId: 'token-demon-summon', rebirth: 1 }],
  },
  {
    defId: 'spell-curse-blast',
    name: '诅咒爆破',
    type: 'spell',
    cost: 3,
    description: '使所有敌方仆从本回合受到 2 倍伤害，并对所有敌人造成 2 伤害。',
    effects: [{ type: 'fragileEnemyMinions' }, { type: 'aoeDamageEnemies', amount: 2 }],
  },
  {
    defId: 'spell-nether-pull',
    name: '冥界牵引',
    type: 'spell',
    cost: 3,
    description: '从弃牌堆指定 1 张卡回手并免费用打出一次。',
    targeting: {
      needsTarget: false,
      allowHero: false,
      respectTaunt: false,
      side: 'any',
      needsDiscard: true,
    },
    effects: [{ type: 'replayDiscard' }],
  },
  {
    defId: 'spell-demon-portal',
    name: '恶魔传送门',
    type: 'spell',
    cost: 3,
    description: '仪式占位（1 格，生命 5）：敌我仆从死亡时献祭 +1。献祭 5：召唤 1 名小恶魔；每次执行生命 -1。',
    effects: [{ type: 'ritual', ritualKey: 'demonPortal' }],
  },
  {
    defId: 'spell-hell-beast-ritual',
    name: '地狱兽仪式',
    type: 'spell',
    cost: 4,
    description:
      '仪式占位（大型 2 格，生命 1）：友方仆从死亡时献祭 +1，领主回复 +2。献祭 9：召唤地狱兽凯斯提；每次执行生命 -1。',
    effects: [{ type: 'ritual', ritualKey: 'hellBeast' }],
  },
];

export const CARD_DB: Record<string, CardDef> = Object.fromEntries(
  CARD_DEFS.map((c) => [c.defId, c]),
);

export const SAMPLE_CARDS: CardDef[] = CARD_DEFS.filter((c) => c.defId !== FATIGUE_STRIKE_DEF_ID);

/** 玩家地狱术士主题组（含地狱兽仪式）。 */
export function buildPlayerHellDeck(prefix: string): CardInstance[] {
  const recipe: string[] = [
    'minion-ice',
    'minion-ice',
    'minion-ice',
    'minion-flame',
    'minion-flame',
    'minion-flame',
    'minion-scroll-cat',
    'minion-scroll-cat',
    'minion-demon',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'spell-fireball',
    'spell-fireball',
    'spell-aegis',
    'spell-death-flow',
    'spell-haste-infusion',
    'spell-claw-infusion',
    'spell-demon-summon',
    'spell-demon-portal',
    'spell-hell-beast-ritual',
    'spell-curse-blast',
    'spell-nether-pull',
  ];
  return recipe.map((defId, i) => ({ id: `${prefix}-${i}-${defId}`, defId }));
}

/** 敌人主题组：仅恶魔与石像守卫（无仪式/法术）。 */
export function buildEnemyHellDeck(prefix: string): CardInstance[] {
  const recipe: string[] = [
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
  ];
  return recipe.map((defId, i) => ({ id: `${prefix}-${i}-${defId}`, defId }));
}

/** @deprecated 使用 buildPlayerHellDeck / buildEnemyHellDeck */
export function buildSampleDeck(prefix: string): CardInstance[] {
  return prefix.startsWith('e') ? buildEnemyHellDeck(prefix) : buildPlayerHellDeck(prefix);
}
