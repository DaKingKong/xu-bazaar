// M5：store 桥接（Zustand）。
//
// 职责（见 docs/architecture.md §2.3、docs/implementation-plan.md §5）：
// - 持有权威 BattleState，接收 UI 动作调用 engine，得到「新状态 + BattleEvent[]」。
// - 维护一个「展示状态」view，按事件序列逐个播放以驱动动画；播放期间锁定交互，
//   播放完毕后与权威状态对齐。UI 只读取 view 与事件，不重新计算规则。

import { create } from 'zustand';
import { CARD_DB, FATIGUE_STRIKE_DEF_ID, buildSampleDeck } from '../data/index.ts';
import {
  createBattle,
  endTurn as engineEndTurn,
  makeRng,
  playCard as enginePlayCard,
  runAutoBattle,
  runEnemyTurn,
  sideState,
} from '../engine/index.ts';
import type { BattleEvent, BattleState, PlayCardAction, Rng, TargetRef } from '../engine/types.ts';

// 每类事件的播放停顿（毫秒），用于让动画有节奏地推进。
const EVENT_DELAY: Partial<Record<BattleEvent['type'], number>> = {
  phaseChange: 250,
  energyReset: 120,
  draw: 160,
  drawSkipped: 120,
  fatigue: 400,
  playCard: 260,
  summon: 260,
  attack: 440,
  counter: 380,
  death: 260,
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
    case 'summon': {
      const src = sideState(authoritative, ev.side).board.find((m) => m.id === ev.minionId);
      if (src) {
        sideState(view, ev.side).board.splice(ev.index, 0, clone(src));
      }
      break;
    }
    case 'attack': {
      const target = findTargetHpHolder(view, ev.target);
      if (target) target.hp -= ev.damage;
      break;
    }
    case 'counter': {
      const unit = findTargetHpHolder(view, ev.unit);
      if (unit) unit.hp -= ev.damage;
      break;
    }
    case 'death': {
      const ps = sideState(view, ev.side);
      const idx = ps.board.findIndex((m) => m.id === ev.minionId);
      if (idx >= 0) ps.board.splice(idx, 1);
      break;
    }
    case 'heal': {
      const target = findTargetHpHolder(view, ev.target);
      if (target) target.hp = Math.min(target.maxHp, target.hp + ev.amount);
      break;
    }
    case 'gameOver':
      view.winner = ev.winner;
      view.phase = 'ended';
      break;
  }
}

interface LogEntry {
  id: number;
  text: string;
}

// 自动战斗中的瞬时动画标记：attacker 突进、target 受击后退。
export interface CombatAnim {
  attacker?: TargetRef;
  target?: TargetRef;
}

function describe(ev: BattleEvent): string | null {
  const who = (s: 'player' | 'enemy') => (s === 'player' ? '玩家' : '敌人');
  switch (ev.type) {
    case 'phaseChange':
      return `阶段：${{ enemyPlay: '敌人打牌', playerPlay: '玩家打牌', autoBattle: '自动战斗', ended: '战斗结束' }[ev.phase]}`;
    case 'fatigue':
      return `${who(ev.side)}疲劳：受到 ${ev.damage} 点伤害，获得 ${ev.generatedAttack} 攻直接攻击卡`;
    case 'attack':
      return `${ev.attacker.side === 'player' ? '玩家' : '敌人'}仆从攻击，造成 ${ev.damage} 点伤害`;
    case 'counter':
      return `反伤 ${ev.damage} 点`;
    case 'death':
      return `${who(ev.side)}一个仆从阵亡`;
    case 'gameOver':
      return `${who(ev.winner)}获胜！`;
    default:
      return null;
  }
}

interface BattleStoreState {
  view: BattleState | null;
  playing: boolean;
  log: LogEntry[];
  // 当前正在播放的战斗动画（攻击/反伤）标记；无则为 null。
  anim: CombatAnim | null;
  // 玩家正在选择目标/位置的待出牌（UI 用）。
  pending: { cardId: string } | null;

  newGame: (seed?: number) => void;
  setPending: (cardId: string | null) => void;
  playCard: (action: PlayCardAction) => void;
  reorderMinion: (fromIndex: number, toIndex: number) => void;
  endTurn: () => void;
}

let rng: Rng = makeRng(Date.now() >>> 0);
let authoritative: BattleState | null = null;
let queue: BattleEvent[] = [];
let logSeq = 0;

export const useBattleStore = create<BattleStoreState>((set, get) => {
  function pump(): void {
    if (queue.length === 0) {
      // 播放完毕：与权威状态对齐，清除动画标记，解锁交互。
      if (authoritative) set({ view: clone(authoritative), playing: false, anim: null });
      else set({ playing: false, anim: null });
      return;
    }
    const ev = queue.shift()!;
    const view = clone(get().view!);
    applyEventToView(view, ev, authoritative!);
    const text = describe(ev);
    const anim: CombatAnim | null =
      ev.type === 'attack'
        ? { attacker: ev.attacker, target: ev.target }
        : ev.type === 'counter'
          ? { target: ev.unit }
          : null;
    set((s) => ({
      view,
      anim,
      log: text ? [...s.log.slice(-40), { id: (logSeq += 1), text }] : s.log,
    }));
    const delay = EVENT_DELAY[ev.type] ?? 200;
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
    log: [],
    anim: null,
    pending: null,

    newGame: (seed?: number) => {
      rng = makeRng(seed ?? Date.now() >>> 0);
      const initial = createBattle(
        {
          player: { hero: { attack: 2, hp: 30 }, deck: buildSampleDeck('p') },
          enemy: { hero: { attack: 2, hp: 30 }, deck: buildSampleDeck('e') },
          cardDb: CARD_DB,
        },
        rng,
      );
      authoritative = initial;
      queue = [];
      logSeq = 0;
      // 展示初始空场，随后播放第一回合（敌人打牌 + 玩家开始）。
      set({ view: clone(initial), playing: false, log: [], anim: null, pending: null });
      const res = runEnemyTurn(initial, rng);
      enqueue(res.events, res.state);
    },

    setPending: (cardId: string | null) => set({ pending: cardId ? { cardId } : null }),

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

    // 玩家阶段拖拽重排己方仆从：仅改变 board 顺序，不结算、不耗能。
    // 纯排序不产生战斗事件，直接同步更新权威状态与展示状态，
    // 自动战斗（由左至右）随即读取拖拽后的新顺序。
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
      const next = clone(authoritative);
      const arr = next.player.board;
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
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
  };
});
