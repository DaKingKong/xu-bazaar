# 数据模型草案（Data Model）

> 本文档为 xu-bazaar 战斗系统的数据结构设计草案。
> 下方 TypeScript 代码块仅为**设计示意**，非实际源码；实现时以此为参考。

---

## 1. 基础类型

```ts
type EntityId = string;        // 实体唯一 ID（仆从、卡牌实例等）
type Side = 'player' | 'enemy';

// 目标引用：可指向角色或某个仆从
type TargetRef =
  | { kind: 'hero'; side: Side }
  | { kind: 'minion'; side: Side; id: EntityId };
```

---

## 2. 卡牌

```ts
type CardType = 'minion' | 'attack' | 'spell';
// 装备/武器不作为卡牌；见 Hero.equipmentSlot。

// 卡牌原型（静态定义，存放在 data 层）
interface CardDef {
  defId: string;             // 原型 ID
  name: string;
  type: CardType;
  cost: number;              // 能量消耗
  description: string;

  // 仆从召唤卡
  minion?: MinionDef;

  // 直接攻击卡 / 伤害法术
  damage?: number;

  // 治疗法术
  heal?: number;

  // 效果目标约束
  targeting?: TargetingRule;

  // 施法数：同一实例最多可打出次数（默认 1）；每次打出结算一次
  castCount?: number;

  // 卡牌级词条（如先锋 vanguard）
  keywords?: CardKeyword[];
}

// 卡牌实例（进入牌堆/手牌后的运行时实体）
interface CardInstance {
  id: EntityId;              // 实例 ID
  defId: string;            // 引用 CardDef
  // 疲劳生成的直接攻击卡会带动态覆盖值
  overrideDamage?: number;
  // 剩余可打出次数；未设置时视为 CardDef.castCount ?? 1；进弃牌时清除
  castsRemaining?: number;
}

// 目标规则
interface TargetingRule {
  needsTarget: boolean;      // 是否需要手动选目标
  allowHero: boolean;        // 是否可指向角色
  respectTaunt: boolean;     // 是否受打脸/嘲讽限制（法术为 false，直接攻击卡为 true）
  side: 'enemy' | 'ally' | 'any';
}
```

---

## 3. 仆从与词条

```ts
// 状态类词条（挂在仆从上，持续生效）
type StatusKeyword = 'taunt'; // 嘲讽

// 卡牌级词条（挂在 CardDef）
type CardKeyword = 'vanguard'; // 先锋：战斗开始时置于牌库顶端

// 条件类词条：满足条件时触发后续效果词条
type TriggerKeyword = 'onKill'; // 击杀：造成的伤害击杀目标时触发

// 效果类词条
type EffectKeyword = { type: 'draw'; amount: number }; // 抽取 X 张牌

interface TriggeredEffect {
  trigger: TriggerKeyword;
  effects: EffectKeyword[];
}

// 仆从原型
interface MinionDef {
  name: string;
  attack: number;
  hp: number;
  size: 1 | 2;               // 占格数，大型仆从为 2
  keywords: StatusKeyword[];
}

// 场上仆从实例
interface Minion {
  id: EntityId;
  defId: string;
  attack: number;
  hp: number;               // 当前 HP
  maxHp: number;
  size: 1 | 2;
  keywords: StatusKeyword[];
  hasAttackedThisTurn?: boolean;
}
```

---

## 4. 英雄与技能

```ts
interface SkillDef {
  skillId: string;
  name: string;
  cost: number;
  description: string;
  damage?: number;
  heal?: number;
  targeting?: TargetingRule;
  triggered?: TriggeredEffect[]; // 如击杀：抽取1
}

interface HeroDef {
  defId: string;
  name: string;
  attack: number;
  hp: number;
  skill?: SkillDef | null;
}

interface Hero {
  side: Side;
  defId: string;
  name: string;
  attack: number;            // 角色攻击力（用于双向打脸反伤）
  hp: number;
  maxHp: number;
  skillUsedThisTurn?: boolean; // 英雄技能每回合至多一次

  // 装备/武器非卡牌，不进牌组（第一版 UI 占位）
  equipmentSlot?: EntityId | null;
  relics?: string[];
}
```

默认对局：玩家 `hell-warlock`（地狱术士），敌人 `dummy`（训练假人，无技能）。

---

## 5. 玩家/敌人状态

```ts
interface PlayerState {
  side: Side;
  hero: Hero;

  deck: CardInstance[];      // 卡组（有序，抽牌从顶部）
  hand: CardInstance[];      // 手牌，上限 10
  board: Minion[];           // 仆从区，最多 9 格（大型仆从占 2）

  energy: number;            // 当前能量
  maxEnergy: number;         // 每回合上限，固定 4

  fatigueCount: number;      // 疲劳计数（各自独立）
}
```

- **手牌上限**：`hand.length <= 10`，抽牌时若已满则跳过。
- **仆从区容量**：`sum(board[i].size) <= 9`。

---

## 6. 战斗状态

```ts
type Phase = 'enemyPlay' | 'playerPlay' | 'autoBattle' | 'ended';

interface BattleState {
  turn: number;              // 回合数（从 1 开始）
  activeSide: Side;          // 当前行动方（驱动中线箭头）
  phase: Phase;

  player: PlayerState;
  enemy: PlayerState;

  winner?: Side | null;      // 胜负判定，null/undefined 表示未结束

  fieldEffect?: string | null; // 第一版占位
  cardDb: Record<string, CardDef>;
  heroDb: Record<string, HeroDef>;
}
```

---

## 7. 战斗事件（供 UI 播放动画）

engine 处理动作后，除返回新状态外，还返回一串事件序列，供 store 驱动 UI 逐步播放动画。

```ts
type BattleEvent =
  | { type: 'draw'; side: Side; cardId: EntityId }
  | { type: 'drawSkipped'; side: Side }            // 手牌满跳过
  | { type: 'fatigue'; side: Side; damage: number; generatedAttack: number }
  | { type: 'playCard'; side: Side; cardId: EntityId; target?: TargetRef }
  | { type: 'useSkill'; side: Side; skillId: string; target?: TargetRef }
  | { type: 'summon'; side: Side; minionId: EntityId; index: number } // 插入位置
  | { type: 'attack'; attacker: TargetRef; target: TargetRef; damage: number }
  | { type: 'counter'; unit: TargetRef; damage: number }             // 双向反伤
  | { type: 'death'; side: Side; minionId: EntityId }
  | { type: 'heal'; target: TargetRef; amount: number }
  | { type: 'energyReset'; side: Side; value: number }
  | { type: 'phaseChange'; phase: Phase }
  | { type: 'gameOver'; winner: Side };
```

---

## 8. 装备/遗物/关键字扩展说明

| 项 | 当前 | 未来扩展 |
| --- | --- | --- |
| 装备/武器 | 非卡牌；`Hero.equipmentSlot` 与 UI 占位 | 战斗外装载后注入 Hero；engine 在攻击/受伤结算处接钩子。 |
| 遗物 | `Hero.relics` 字段占位 | 以事件钩子（如「回合开始」「造成伤害后」）触发遗物效果。 |
| 技能 | `HeroDef.skill` + `useSkill`；地狱术士已实现 | 更多英雄技能、AI 使用技能。 |
| 场地效果 | `BattleState.fieldEffect` 占位 | 全局结算修正，作用于双方结算钩子。 |
| 状态词条 | `taunt` | charge、divineShield 等。 |
| 卡牌词条 | `vanguard`（先锋：createBattle 洗牌后置顶） | 破碎等流转类词条。 |
| 条件/效果词条 | `onKill`（击杀）、`draw`（抽取 X） | 可挂到卡牌效果上复用同一套结算。 |

---

## 9. 与成长/解锁系统的衔接（预留）

- **卡组注入**：战斗初始化接收敌我 `CardInstance[]` 卡组，卡组由战斗外系统（构筑/关卡）生成，engine 不关心来源。
- **卡牌解锁**：data 层维护全量 `CardDef` 卡池与已解锁集合，构筑系统从已解锁集合选卡，与 engine 解耦。
- **角色成长**：战斗外系统修改 `Hero` 基础属性（HP/攻击/装备/遗物）或选择 `HeroDef` 后注入战斗初始状态。
