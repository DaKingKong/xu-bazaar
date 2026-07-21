// 核心战斗类型定义（依据 docs/data-model.md）。
// 本文件为纯 TypeScript，严禁 import React 或任何 UI 库。

export type EntityId = string;
export type Side = 'player' | 'enemy';

// 目标引用：可指向角色或某个仆从
export type TargetRef = { kind: 'hero'; side: Side } | { kind: 'minion'; side: Side; id: EntityId };

// --- 卡牌 ---

export type CardType = 'minion' | 'attack' | 'spell' | 'equipment';

// 效果目标约束
export interface TargetingRule {
  needsTarget: boolean;
  allowHero: boolean;
  respectTaunt: boolean;
  side: 'enemy' | 'ally' | 'any';
}

// 装备卡（第一版仅预留）
export interface EquipmentDef {
  name: string;
  attack?: number;
}

// 卡牌原型（静态定义，存放在 data 层）
export interface CardDef {
  defId: string;
  name: string;
  type: CardType;
  cost: number;
  description: string;
  minion?: MinionDef;
  damage?: number;
  heal?: number;
  targeting?: TargetingRule;
  equipment?: EquipmentDef;
}

// 卡牌实例（进入牌堆/手牌后的运行时实体）
export interface CardInstance {
  id: EntityId;
  defId: string;
  // 疲劳生成的直接攻击卡会带动态覆盖值
  overrideDamage?: number;
}

// --- 仆从 ---

export type Keyword = 'taunt';

export interface MinionDef {
  name: string;
  attack: number;
  hp: number;
  size: 1 | 2;
  keywords: Keyword[];
}

export interface Minion {
  id: EntityId;
  defId: string;
  attack: number;
  hp: number;
  maxHp: number;
  size: 1 | 2;
  keywords: Keyword[];
  hasAttackedThisTurn?: boolean;
}

// --- 角色 ---

export interface Hero {
  side: Side;
  attack: number;
  hp: number;
  maxHp: number;
  // 第一版占位，仅预留
  equipmentSlot?: EntityId | null;
  relics?: string[];
  skill?: string | null;
}

// --- 玩家/敌人状态 ---

export interface PlayerState {
  side: Side;
  hero: Hero;
  deck: CardInstance[];
  hand: CardInstance[];
  board: Minion[];
  energy: number;
  maxEnergy: number;
  fatigueCount: number;
}

// --- 战斗状态 ---

export type Phase = 'enemyPlay' | 'playerPlay' | 'autoBattle' | 'ended';

export interface BattleState {
  turn: number;
  activeSide: Side;
  phase: Phase;
  player: PlayerState;
  enemy: PlayerState;
  winner?: Side | null;
  // 第一版占位
  fieldEffect?: string | null;
  // 静态卡牌原型表（defId -> CardDef）。随状态一并携带，令 engine 入口保持
  // (state, action, rng) 的纯函数签名，无需额外传入数据层引用。
  cardDb: Record<string, CardDef>;
}

// --- 动作与初始化契约 ---

// 出牌动作：
// - target：指向性卡（直接攻击卡 / 指向性法术）的目标。
// - position：仆从召唤卡的插入位置（board 中的下标，0..board.length）。
export interface PlayCardAction {
  cardId: EntityId;
  target?: TargetRef;
  position?: number;
}

export interface HeroInit {
  attack: number;
  hp: number;
}

export interface PlayerInit {
  hero: HeroInit;
  deck: CardInstance[];
}

export interface BattleInit {
  player: PlayerInit;
  enemy: PlayerInit;
  cardDb: Record<string, CardDef>;
  // 起始行动方，默认 'enemy'（回合流程：敌人 → 玩家 → 自动战斗）。
  startingSide?: Side;
}

// 结算类入口的统一返回结构。
export interface BattleResult {
  state: BattleState;
  events: BattleEvent[];
}

// --- 战斗事件（供 UI 播放动画）---

export type BattleEvent =
  | { type: 'draw'; side: Side; cardId: EntityId }
  | { type: 'drawSkipped'; side: Side }
  | { type: 'fatigue'; side: Side; damage: number; generatedAttack: number }
  | { type: 'playCard'; side: Side; cardId: EntityId; target?: TargetRef }
  | { type: 'summon'; side: Side; minionId: EntityId; index: number }
  | { type: 'attack'; attacker: TargetRef; target: TargetRef; damage: number }
  | { type: 'counter'; unit: TargetRef; damage: number }
  | { type: 'death'; side: Side; minionId: EntityId }
  | { type: 'heal'; target: TargetRef; amount: number }
  | { type: 'energyReset'; side: Side; value: number }
  | { type: 'phaseChange'; phase: Phase }
  | { type: 'gameOver'; winner: Side };

// 可注入的随机源（种子化，便于测试与回放）。
export type Rng = () => number;

// 战斗常量（依据 docs/battle-design.md）。
export const MAX_ENERGY = 4;
export const MAX_HAND_SIZE = 10;
export const BOARD_CAPACITY = 7;
export const FIRST_TURN_DRAW = 5;
export const PER_TURN_DRAW = 2;
