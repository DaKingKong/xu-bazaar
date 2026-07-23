// M5：store 桥接（Zustand）。
//
// 职责（见 docs/architecture.md §2.3、docs/implementation-plan.md §5）：
// - 持有权威 BattleState，接收 UI 动作调用 engine，得到「新状态 + BattleEvent[]」。
// - 维护一个「展示状态」view，按事件序列逐个播放以驱动动画；播放期间锁定交互，
//   播放完毕后与权威状态对齐。UI 只读取 view 与事件，不重新计算规则。

import { create } from 'zustand';
import {
  CARD_DB,
  DUMMY_HERO_ID,
  FATIGUE_STRIKE_DEF_ID,
  HELL_WARLOCK_ID,
  HERO_DB,
  buildEnemyHellDeck,
  buildPlayerHellDeck,
} from '../data/index.ts';
import {
  createBattle,
  endTurn as engineEndTurn,
  firstRitualIndex,
  isRitual,
  makeRng,
  normalizeBoardOrder,
  playCard as enginePlayCard,
  runAutoBattle,
  runEnemyTurn,
  sideState,
  useSkill as engineUseSkill,
} from '../engine/index.ts';
import type {
  BattleEvent,
  BattleState,
  PlayCardAction,
  Rng,
  TargetRef,
  UseSkillAction,
} from '../engine/types.ts';
import { LOG_CAP, formatLog } from './formatLog.ts';
import type { LogEntry } from './formatLog.ts';
import { applyViewCombatDamage } from './viewCombatDamage.ts';
import { applyViewSummon } from './viewSummon.ts';

export type { LogEntry } from './formatLog.ts';

// 每类事件的播放停顿（毫秒），用于让动画有节奏地推进。
const EVENT_DELAY: Partial<Record<BattleEvent['type'], number>> = {
  phaseChange: 250,
  energyReset: 120,
  draw: 160,
  drawSkipped: 120,
  fatigue: 400,
  playCard: 260,
  useSkill: 260,
  summon: 260,
  attack: 880,
  counter: 760,
  death: 260,
  rebirth: 320,
  heal: 300,
  gameOver: 200,
};

function clone<T>(v: T): T {
  return structuredClone(v);
}

function findTargetHpHolder(view: BattleState, ref: TargetRef) {
  const ps = sideState(view, ref.side);
  if (ref.kind === 'hero') return ps.hero;
  return ps.board.find((m) => m.id === ref.id);
}

// 将单个事件「作用」到展示状态（纯表现层，不做规则判定）。
function applyEventToView(view: BattleState, ev: BattleEvent, authoritative: BattleState): void {
  switch (ev.type) {
    case 'phaseChange':
      view.phase = ev.phase;
      break;
    case 'energyReset':
      sideState(view, ev.side).energy = ev.value;
      break;
    case 'draw': {
      const ps = sideState(view, ev.side);
      const idx = ps.deck.findIndex((c) => c.id === ev.cardId);
      if (idx >= 0) {
        const [card] = ps.deck.splice(idx, 1);
        ps.hand.push(card);
      }
      break;
    }
    case 'drawSkipped':
      break;
    case 'fatigue': {
      const ps = sideState(view, ev.side);
      ps.hero.hp = Math.max(0, ps.hero.hp - ev.damage);
      ps.fatigueCount = ev.generatedAttack;
      ps.hand.push({
        id: `fatigue-${ev.side}-${ev.generatedAttack}`,
        defId: FATIGUE_STRIKE_DEF_ID,
        overrideDamage: ev.generatedAttack,
      });
      break;
    }
    case 'playCard': {
      const ps = sideState(view, ev.side);
      const idx = ps.hand.findIndex((c) => c.id === ev.cardId);
      if (idx >= 0) {
        const def = view.cardDb[ps.hand[idx].defId];
        ps.hand.splice(idx, 1);
        if (def) ps.energy = Math.max(0, ps.energy - def.cost);
      }
      break;
    }
    case 'useSkill': {
      const ps = sideState(view, ev.side);
      const skill = view.heroDb[ps.hero.defId]?.skill;
      if (skill) ps.energy = Math.max(0, ps.energy - skill.cost);
      ps.hero.skillUsedThisTurn = true;
      break;
    }
    case 'summon': {
      applyViewSummon(view, authoritative, ev);
      break;
    }
    case 'attack': {
      const target = findTargetHpHolder(view, ev.target);
      if (target) applyViewCombatDamage(target, ev.damage);
      break;
    }
    case 'counter': {
      const unit = findTargetHpHolder(view, ev.unit);
      if (unit) applyViewCombatDamage(unit, ev.damage);
      break;
    }
    case 'death': {
      const ps = sideState(view, ev.side);
      const idx = ps.board.findIndex((m) => m.id === ev.minionId);
      if (idx >= 0) ps.board.splice(idx, 1);
      break;
    }
    case 'rebirth': {
      const m = sideState(view, ev.side).board.find((x) => x.id === ev.minionId);
      if (m) {
        m.hp = m.maxHp;
        m.rebirth = Math.max(0, (m.rebirth ?? 1) - 1);
      }
      break;
    }
    case 'heal': {
      const target = findTargetHpHolder(view, ev.target);
      if (target) target.hp = Math.min(target.maxHp, target.hp + ev.amount);
      break;
    }
    case 'discard': {
      const ps = sideState(view, ev.side);
      const src = sideState(authoritative, ev.side).discard.find((c) => c.id === ev.cardId);
      if (src && !ps.discard.some((c) => c.id === ev.cardId)) {
        ps.discard.push(clone(src));
      }
      break;
    }
    case 'hellChange':
      view.hell = { intensity: ev.intensity };
      break;
    case 'ritualUpdate': {
      const ps = sideState(view, ev.side);
      const existing = ps.board.find((m) => m.id === ev.ritualId);
      if (existing?.ritual) {
        existing.ritual.sacrifice = ev.sacrifice;
        existing.hp = ev.hp;
      } else {
        const auth = sideState(authoritative, ev.side).board.find((m) => m.id === ev.ritualId);
        if (auth) {
          // 若 summon 事件尚未应用，补齐占位
          if (!ps.board.some((m) => m.id === auth.id)) {
            ps.board.push(clone(auth));
          }
        }
      }
      break;
    }
    case 'shield': {
      if (ev.target.kind === 'minion') {
        const target = ev.target;
        const m = sideState(view, target.side).board.find((x) => x.id === target.id);
        if (m) m.shield = (m.shield ?? 0) + ev.amount;
      }
      break;
    }
    case 'gameOver':
      view.winner = ev.winner;
      view.phase = 'ended';
      break;
  }
}

// 自动战斗中的瞬时动画标记：attacker 突进、target 受击。
export interface CombatAnim {
  attacker?: TargetRef;
  target?: TargetRef;
}

// 受伤飘字：在受击实体上方飘出「-N HP」。id 唯一，动画结束后由 UI 清除。
export interface FloaterState {
  id: number;
  ref: TargetRef;
  amount: number;
}

interface BattleStoreState {
  view: BattleState | null;
  playing: boolean;
  /** 动画事件播放倍速（越大越快）。 */
  playbackSpeed: 1 | 2 | 3;
  log: LogEntry[];
  // 当前正在播放的战斗动画（攻击/反伤）标记；无则为 null。
  anim: CombatAnim | null;
  // 受伤飘字列表（可同时存在多个）；动画结束后由 UI 通过 clearFloater 清除。
  floaters: FloaterState[];
  // 玩家正在选择目标/位置的待出牌，或待使用技能（UI 用）。
  // discardPick：冥界牵引先选手牌后选弃牌；再视情况选目标。
  pending:
    | { kind: 'card'; cardId: string }
    | { kind: 'skill' }
    | { kind: 'discardPick'; cardId: string }
    | { kind: 'discardTarget'; cardId: string; discardCardId: string }
    | null;

  newGame: (seed?: number) => void;
  setPending: (pending: BattleStoreState['pending']) => void;
  playCard: (action: PlayCardAction) => void;
  useSkill: (action: UseSkillAction) => void;
  reorderMinion: (fromIndex: number, toIndex: number) => void;
  /** 设置玩家 board 全序；须保持「仆从在左、仪式在右」。 */
  setPlayerBoardOrder: (orderedIds: string[]) => void;
  endTurn: () => void;
  /** 调试：将玩家费用上限永久改为给定值，并立即回满。 */
  setPlayerMaxEnergy: (max: number) => void;
  setPlaybackSpeed: (speed: 1 | 2 | 3) => void;
  clearFloater: (id: number) => void;
}

let rng: Rng = makeRng(Date.now() >>> 0);
let authoritative: BattleState | null = null;
let queue: BattleEvent[] = [];
let logSeq = 0;
let floaterSeq = 0;

export const useBattleStore = create<BattleStoreState>((set, get) => {
  function pump(): void {
    if (queue.length === 0) {
      // 播放完毕：与权威状态对齐，清除动画标记，解锁交互。
      if (authoritative) set({ view: clone(authoritative), playing: false, anim: null });
      else set({ playing: false, anim: null });
      return;
    }
    const ev = queue.shift()!;
    const nextEv = queue[0];
    const viewBefore = get().view!;
    const fields = formatLog(ev, nextEv, viewBefore, authoritative!);
    const view = clone(viewBefore);
    applyEventToView(view, ev, authoritative!);
    const anim: CombatAnim | null =
      ev.type === 'attack'
        ? { attacker: ev.attacker, target: ev.target }
        : ev.type === 'counter'
          ? { target: ev.unit }
          : null;
    // 事件携带伤害则生成飘字：自动战斗攻击、反伤、疲劳（均为直接扣血的事件）。
    const damageFloater: FloaterState | null =
      ev.type === 'attack' && ev.damage > 0
        ? { id: (floaterSeq += 1), ref: ev.target, amount: ev.damage }
        : ev.type === 'counter' && ev.damage > 0
          ? { id: (floaterSeq += 1), ref: ev.unit, amount: ev.damage }
          : ev.type === 'fatigue' && ev.damage > 0
            ? { id: (floaterSeq += 1), ref: { kind: 'hero', side: ev.side }, amount: ev.damage }
            : null;
    set((s) => ({
      view,
      anim,
      floaters: damageFloater ? [...s.floaters, damageFloater] : s.floaters,
      log: fields
        ? [...s.log.slice(-(LOG_CAP - 1)), { id: (logSeq += 1), ...fields }]
        : s.log,
    }));
    const delay = (EVENT_DELAY[ev.type] ?? 200) / get().playbackSpeed;
    setTimeout(pump, delay);
  }

  function enqueue(events: BattleEvent[], nextAuthoritative: BattleState): void {
    authoritative = nextAuthoritative;
    queue = [...events];
    set({ playing: true });
    pump();
  }

  return {
    view: null,
    playing: false,
    playbackSpeed: 1,
    log: [],
    anim: null,
    floaters: [],
    pending: null,

    newGame: (seed?: number) => {
      rng = makeRng(seed ?? Date.now() >>> 0);
      const initial = createBattle(
        {
          player: { hero: { defId: HELL_WARLOCK_ID }, deck: buildPlayerHellDeck('p') },
          enemy: { hero: { defId: DUMMY_HERO_ID }, deck: buildEnemyHellDeck('e') },
          cardDb: CARD_DB,
          heroDb: HERO_DB,
        },
        rng,
      );
      authoritative = initial;
      queue = [];
      logSeq = 0;
      floaterSeq = 0;
      // 展示初始空场，随后播放第一回合（敌人打牌 + 玩家开始）。
      set({
        view: clone(initial),
        playing: false,
        log: [],
        anim: null,
        floaters: [],
        pending: null,
      });
      const res = runEnemyTurn(initial, rng);
      enqueue(res.events, res.state);
    },

    setPending: (pending) => set({ pending }),

    playCard: (action: PlayCardAction) => {
      const { playing } = get();
      if (playing || !authoritative || authoritative.phase !== 'playerPlay') return;
      try {
        const res = enginePlayCard(authoritative, action, rng);
        set({ pending: null });
        enqueue(res.events, res.state);
      } catch {
        set({ pending: null });
      }
    },

    useSkill: (action: UseSkillAction) => {
      const { playing } = get();
      if (playing || !authoritative || authoritative.phase !== 'playerPlay') return;
      try {
        const res = engineUseSkill(authoritative, action, rng);
        set({ pending: null });
        enqueue(res.events, res.state);
      } catch {
        set({ pending: null });
      }
    },

    // 玩家阶段拖拽重排：仅同区移动（仆从区 / 仪式区），不可把仪式拖进仆从之间。
    reorderMinion: (fromIndex: number, toIndex: number) => {
      const { playing } = get();
      if (playing || !authoritative || authoritative.phase !== 'playerPlay') return;
      const board = authoritative.player.board;
      if (
        fromIndex < 0 ||
        fromIndex >= board.length ||
        toIndex < 0 ||
        toIndex >= board.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      const firstR = firstRitualIndex(board);
      const fromRitual = fromIndex >= firstR;
      const toRitual = toIndex >= firstR;
      if (fromRitual !== toRitual) return;

      const next = clone(authoritative);
      const arr = next.player.board;
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved!);
      next.player.board = normalizeBoardOrder(arr);
      authoritative = next;
      set({ view: clone(next) });
    },

    setPlayerBoardOrder: (orderedIds: string[]) => {
      const { playing } = get();
      if (playing || !authoritative || authoritative.phase !== 'playerPlay') return;
      const board = authoritative.player.board;
      if (orderedIds.length !== board.length) return;
      if (new Set(orderedIds).size !== orderedIds.length) return;
      const byId = new Map(board.map((m) => [m.id, m]));
      if (!orderedIds.every((id) => byId.has(id))) return;

      const nextOrder = orderedIds.map((id) => byId.get(id)!);
      let seenRitual = false;
      for (const m of nextOrder) {
        if (isRitual(m)) seenRitual = true;
        else if (seenRitual) return;
      }

      const next = clone(authoritative);
      next.player.board = nextOrder.map((m) => clone(m));
      authoritative = next;
      set({ view: clone(next) });
    },

    endTurn: () => {
      const { playing } = get();
      if (playing || !authoritative || authoritative.phase !== 'playerPlay') return;
      const events: BattleEvent[] = [];
      let s = authoritative;

      const afterEnd = engineEndTurn(s, rng);
      events.push(...afterEnd.events);
      s = afterEnd.state;

      const afterAuto = runAutoBattle(s, rng);
      events.push(...afterAuto.events);
      s = afterAuto.state;

      if (s.phase !== 'ended') {
        const afterEnemy = runEnemyTurn(s, rng);
        events.push(...afterEnemy.events);
        s = afterEnemy.state;
      }

      set({ pending: null });
      enqueue(events, s);
    },

    setPlayerMaxEnergy: (max: number) => {
      if (!authoritative || max < 1) return;
      const next = clone(authoritative);
      next.player.maxEnergy = max;
      next.player.energy = max;
      authoritative = next;
      const view = get().view ? clone(get().view!) : null;
      if (view) {
        view.player.maxEnergy = max;
        view.player.energy = max;
      }
      set({ view: view ?? clone(next) });
    },

    setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

    clearFloater: (id: number) => set((s) => ({ floaters: s.floaters.filter((f) => f.id !== id) })),
  };
});
