// 核心战斗类型定义（依据 docs/data-model.md + catalog-deck-v1）。
// 本文件为纯 TypeScript，严禁 import React 或任何 UI 库。

export type EntityId = string;
export type Side = 'player' | 'enemy';

// 目标引用：可指向角色或某个仆从
export type TargetRef = { kind: 'hero'; side: Side } | { kind: 'minion'; side: Side; id: EntityId };

// --- 词条 ---

// 状态类词条（挂在仆从上，持续生效）
export type StatusKeyword = 'taunt' | 'splash';

/** @deprecated 使用 StatusKeyword；保留别名以兼容现有仆从字段 */
export type Keyword = StatusKeyword;

/** 卡牌级词条（挂在 CardDef，非场上仆从状态） */
export type CardKeyword = 'vanguard'; // 先锋：战斗开始时置于牌库顶端

export type MinionTag = 'hell' | 'large';

// 条件类词条：满足条件时触发后续效果词条
export type TriggerKeyword = 'onKill'; // 击杀：造成的伤害击杀目标时触发

// 效果类词条
export type EffectKeyword = { type: 'draw'; amount: number }; // 抽取 X 张牌

// 条件 → 效果（如「击杀：抽取1」）
export interface TriggeredEffect {
  trigger: TriggerKeyword;
  effects: EffectKeyword[];
}

/** 卡牌打出/入场时结算的效果（按数组顺序；每次打出结算一整段一次）。 */
export type CardEffect =
  | { type: 'damage'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'draw'; amount: number }
  | { type: 'shield'; amount: number }
  | { type: 'destroyTarget' }
  | { type: 'drawByTargetCost' }
  | { type: 'grantMultiAttack'; amount: number }
  | { type: 'grantSplash' }
  | { type: 'summon'; defId: string; count?: number; rebirth?: number }
  | { type: 'ritual'; ritualKey: RitualKey }
  | { type: 'aoeDamageEnemies'; amount: number }
  | { type: 'fragileEnemyMinions' }
  | { type: 'replayDiscard' };

export type RitualKey = 'demonPortal' | 'hellBeast';

/** 棋盘仪式占位上的运行时字段（挂在 Minion.ritual）。 */
export interface RitualState {
  ritualKey: RitualKey;
  sacrifice: number;
}

/** 仪式原型：生命=可执行次数；size 占格；threshold=献祭达标线。 */
export const RITUAL_DEFS: Record<
  RitualKey,
  { hp: number; size: 1 | 2; threshold: number; large?: boolean }
> = {
  demonPortal: { hp: 5, size: 1, threshold: 5 },
  hellBeast: { hp: 1, size: 2, threshold: 9, large: true },
};

// --- 卡牌 ---

export type CardType = 'minion' | 'attack' | 'spell';

// 效果目标约束
export interface TargetingRule {
  needsTarget: boolean;
  allowHero: boolean;
  respectTaunt: boolean;
  side: 'enemy' | 'ally' | 'any';
  /** 需要从弃牌堆选一张卡（冥界牵引） */
  needsDiscard?: boolean;
}

// 卡牌原型（静态定义，存放在 data 层）
export interface CardDef {
  defId: string;
  name: string;
  type: CardType;
  cost: number;
  description: string;
  minion?: MinionDef;
  /** @deprecated 优先使用 effects；保留以兼容旧卡与疲劳卡 */
  damage?: number;
  /** @deprecated 优先使用 effects */
  heal?: number;
  targeting?: TargetingRule;
  /**
   * 施法数：同一实例最多可打出的次数（默认 1）。
   * 每次打出结算一次正文并消耗 1 次；从手牌打出每次都扣费用；用尽后进弃牌。
   */
  castCount?: number;
  effects?: CardEffect[];
  /** 仆从入场时触发 */
  onEnter?: CardEffect[];
  /** 卡牌级词条（如先锋） */
  keywords?: CardKeyword[];
}

// 卡牌实例（进入牌堆/手牌后的运行时实体）
export interface CardInstance {
  id: EntityId;
  defId: string;
  // 疲劳生成的直接攻击卡会带动态覆盖值
  overrideDamage?: number;
  /**
   * 剩余可打出次数。未设置时视为 `CardDef.castCount ?? 1`。
   * 进弃牌时清除，再次入手（含冥界牵引）按满施法数起算。
   */
  castsRemaining?: number;
}

// --- 仆从 ---

export interface MinionDef {
  name: string;
  attack: number;
  hp: number;
  size: 1 | 2;
  keywords: StatusKeyword[];
  tags?: MinionTag[];
}

export interface Minion {
  id: EntityId;
  defId: string;
  attack: number;
  hp: number;
  maxHp: number;
  size: 1 | 2;
  keywords: StatusKeyword[];
  tags: MinionTag[];
  hasAttackedThisTurn?: boolean;
  /** 多重攻击：额外攻击次数（1 = 本回合共攻击 2 次） */
  multiAttack?: number;
  /** 重生层数 */
  rebirth?: number;
  /** 护盾（优先于生命消耗） */
  shield?: number;
  /** 装甲：每次受伤 -1 */
  armor?: number;
  /**
   * 仪式占位：存在时不受伤害、不参战、不可被选为目标。
   * hp / maxHp 表示剩余 / 初始可执行次数；每次献祭达标执行后 hp -1，归零进弃牌。
   */
  ritual?: RitualState;
}

// --- 英雄技能 ---

export interface SkillDef {
  skillId: string;
  name: string;
  cost: number;
  description: string;
  damage?: number;
  heal?: number;
  targeting?: TargetingRule;
  /** 词条效果，如击杀：抽取1 */
  triggered?: TriggeredEffect[];
}

// --- 角色 ---

export interface HeroDef {
  defId: string;
  name: string;
  attack: number;
  hp: number;
  skill?: SkillDef | null;
}

export interface Hero {
  side: Side;
  defId: string;
  name: string;
  attack: number;
  hp: number;
  maxHp: number;
  // 装备/武器槽（非卡牌；第一版仅 UI 占位）
  equipmentSlot?: EntityId | null;
  relics?: string[];
  /** 本回合是否已使用过英雄技能（每回合至多一次） */
  skillUsedThisTurn?: boolean;
}

// --- 玩家/敌人状态 ---

export interface PlayerState {
  side: Side;
  hero: Hero;
  deck: CardInstance[];
  hand: CardInstance[];
  board: Minion[];
  /** 弃牌堆（= 墓地） */
  discard: CardInstance[];
  energy: number;
  maxEnergy: number;
  fatigueCount: number;
  /** 本回合敌方仆从受伤倍率（诅咒爆破等）；挂在受害方 */
  incomingDamageMultiplier?: number;
}

// --- 战斗状态 ---

export type Phase = 'enemyPlay' | 'playerPlay' | 'autoBattle' | 'ended';

export interface HellField {
  /** 0 = 非地狱；>=1 为地狱，强度影响回合末伤害 */
  intensity: number;
}

export interface BattleState {
  turn: number;
  activeSide: Side;
  phase: Phase;
  player: PlayerState;
  enemy: PlayerState;
  winner?: Side | null;
  /** @deprecated 使用 hell；保留字段以免旧存档形状断裂 */
  fieldEffect?: string | null;
  /** 全局地狱场地 */
  hell: HellField;
  // 静态卡牌/英雄原型表。随状态一并携带，令 engine 入口保持
  // (state, action, rng) 的纯函数签名，无需额外传入数据层引用。
  cardDb: Record<string, CardDef>;
  heroDb: Record<string, HeroDef>;
  /** 生成弃牌/召唤等实例 id 用 */
  nextEntitySeq?: number;
}

// --- 动作与初始化契约 ---

// 出牌动作：
// - target：指向性卡（直接攻击卡 / 指向性法术）的目标。
// - position：仆从召唤卡的插入位置（board 中的下标，0..board.length）。
// - discardCardId：从弃牌堆选用的卡（冥界牵引）。
export interface PlayCardAction {
  cardId: EntityId;
  target?: TargetRef;
  position?: number;
  discardCardId?: EntityId;
}

export interface UseSkillAction {
  target?: TargetRef;
}

export interface HeroInit {
  defId: string;
  /** 可选覆盖（成长系统预留）；缺省取 HeroDef */
  attack?: number;
  hp?: number;
}

export interface PlayerInit {
  hero: HeroInit;
  deck: CardInstance[];
}

export interface BattleInit {
  player: PlayerInit;
  enemy: PlayerInit;
  cardDb: Record<string, CardDef>;
  heroDb: Record<string, HeroDef>;
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
  | { type: 'useSkill'; side: Side; skillId: string; target?: TargetRef }
  | { type: 'summon'; side: Side; minionId: EntityId; index: number; defId: string }
  | { type: 'attack'; attacker: TargetRef; target: TargetRef; damage: number }
  | { type: 'counter'; unit: TargetRef; damage: number }
  | { type: 'death'; side: Side; minionId: EntityId }
  | { type: 'rebirth'; side: Side; minionId: EntityId }
  | { type: 'heal'; target: TargetRef; amount: number }
  | { type: 'energyReset'; side: Side; value: number }
  | { type: 'phaseChange'; phase: Phase }
  | { type: 'gameOver'; winner: Side }
  | { type: 'discard'; side: Side; cardId: EntityId }
  | {
      type: 'ritualUpdate';
      side: Side;
      ritualId: EntityId;
      sacrifice: number;
      hp: number;
    }
  | { type: 'hellChange'; intensity: number }
  | { type: 'shield'; target: TargetRef; amount: number };

// 可注入的随机源（种子化，便于测试与回放）。
export type Rng = () => number;

// 战斗常量（依据 docs/battle-design.md）。
export const MAX_ENERGY = 4;
export const MAX_HAND_SIZE = 10;
export const BOARD_CAPACITY = 9;
export const FIRST_TURN_DRAW = 5;
export const PER_TURN_DRAW = 2;
