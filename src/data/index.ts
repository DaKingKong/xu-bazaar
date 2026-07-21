// 静态卡牌/仆从定义数据（M1 骨架占位）。
//
// data 层与 engine 解耦，engine 通过 defId 引用。
// 第一版完整示例卡组将在实现出牌/战斗规则时补齐（见 docs/battle-design.md §5.5）。

import type { CardDef } from '../engine/types.ts';

// 少量示例卡定义，用于骨架期占位与演示。
export const SAMPLE_CARDS: CardDef[] = [
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
    defId: 'spell-firebolt',
    name: '火焰箭',
    type: 'spell',
    cost: 1,
    description: '造成 3 点伤害。',
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
];
