// 静态卡牌/仆从定义数据。
//
// data 层与 engine 解耦：engine 通过 defId 引用原型，运行期原型表（CardDb）
// 随 BattleState 一并携带（见 docs/architecture.md §2.2、docs/data-model.md §9）。

import type { CardDef, CardInstance } from '../engine/types.ts';

// 疲劳机制生成的「直接攻击卡」原型 ID。
// 基础 damage 为 0，实际攻击力由实例的 overrideDamage 覆盖（每次疲劳递增 1）。
export const FATIGUE_STRIKE_DEF_ID = 'fatigue-strike';

// 指向性直接攻击卡的通用目标规则：需选目标、可打脸、受打脸/嘲讽限制、只指向敌方。
const ATTACK_TARGETING = {
  needsTarget: true,
  allowHero: true,
  respectTaunt: true,
  side: 'enemy',
} as const;

// 全量卡牌原型定义。
export const CARD_DEFS: CardDef[] = [
  {
    defId: 'minion-guard',
    name: '铁壁守卫',
    type: 'minion',
    cost: 2,
    description: '嘲讽。为你的仆从阵线挡下攻击。',
    minion: { name: '铁壁守卫', attack: 1, hp: 4, size: 1, keywords: ['taunt'] },
  },
  {
    defId: 'minion-striker',
    name: '突击兵',
    type: 'minion',
    cost: 3,
    description: '一个攻守均衡的仆从。',
    minion: { name: '突击兵', attack: 3, hp: 3, size: 1, keywords: [] },
  },
  {
    defId: 'minion-recruit',
    name: '新兵',
    type: 'minion',
    cost: 1,
    description: '廉价的前排消耗品。',
    minion: { name: '新兵', attack: 1, hp: 2, size: 1, keywords: [] },
  },
  {
    defId: 'minion-golem',
    name: '巨型魔像',
    type: 'minion',
    cost: 4,
    description: '大型仆从，占据两格。',
    minion: { name: '巨型魔像', attack: 5, hp: 6, size: 2, keywords: [] },
  },
  {
    defId: 'attack-strike',
    name: '快速斩击',
    type: 'attack',
    cost: 1,
    description: '造成 2 点伤害。需先清空对方仆从才能打脸。',
    damage: 2,
    targeting: ATTACK_TARGETING,
  },
  {
    defId: 'spell-firebolt',
    name: '火焰箭',
    type: 'spell',
    cost: 1,
    description: '造成 3 点伤害（可自由选目标）。',
    damage: 3,
    targeting: { needsTarget: true, allowHero: true, respectTaunt: false, side: 'any' },
  },
  {
    defId: 'spell-mend',
    name: '治疗术',
    type: 'spell',
    cost: 1,
    description: '恢复 3 点生命。',
    heal: 3,
    targeting: { needsTarget: true, allowHero: true, respectTaunt: false, side: 'ally' },
  },
  {
    defId: FATIGUE_STRIKE_DEF_ID,
    name: '疲劳突袭',
    type: 'attack',
    cost: 0,
    description: '疲劳生成的直接攻击卡，攻击力随疲劳递增。',
    damage: 0,
    targeting: ATTACK_TARGETING,
  },
];

// 运行期原型表：defId -> CardDef。
export const CARD_DB: Record<string, CardDef> = Object.fromEntries(
  CARD_DEFS.map((c) => [c.defId, c]),
);

// 向后兼容的示例集合（骨架期占位 UI 曾使用）。
export const SAMPLE_CARDS: CardDef[] = CARD_DEFS.filter((c) => c.defId !== FATIGUE_STRIKE_DEF_ID);

// 构建一副示例卡组（有序，抽牌从顶部 index 0 取）。
// prefix 用于生成唯一的实例 id，确保敌我实例 id 不冲突。
export function buildSampleDeck(prefix: string): CardInstance[] {
  const recipe: string[] = [
    'minion-recruit',
    'minion-guard',
    'attack-strike',
    'minion-striker',
    'spell-firebolt',
    'minion-recruit',
    'spell-mend',
    'minion-guard',
    'attack-strike',
    'minion-golem',
    'minion-striker',
    'spell-firebolt',
    'minion-recruit',
    'attack-strike',
    'spell-mend',
    'minion-striker',
  ];
  return recipe.map((defId, i) => ({ id: `${prefix}-${i}-${defId}`, defId }));
}
