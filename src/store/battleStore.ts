import { create } from 'zustand';
import { SAMPLE_CARDS } from '../data/index.ts';
import type { Minion } from '../engine/types.ts';

// M1 骨架 store（占位）。
//
// 目标文档设计（见 docs/architecture.md §2.3）为：Zustand 持有 BattleState，
// 接收 UI 动作调用 engine，得到新状态 + BattleEvent[] 后逐步驱动 UI。
// 该完整桥接将在 engine 规则实现后（M5）接入。
//
// 当前占位实现仅用于骨架期演示所选技术栈（React + Zustand + Framer Motion）已正确连通：
// 允许向一个演示仆从区插入/清空仆从，触发 Framer Motion 的进出场/重排动画。

const MINION_DEFS = SAMPLE_CARDS.filter((c) => c.type === 'minion');

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `demo-minion-${idCounter}`;
}

interface DemoBoardState {
  board: Minion[];
  summonDemoMinion: () => void;
  clearBoard: () => void;
}

export const useBattleStore = create<DemoBoardState>((set) => ({
  board: [],
  summonDemoMinion: () =>
    set((state) => {
      if (state.board.length >= 7) return state;
      const def = MINION_DEFS[state.board.length % MINION_DEFS.length];
      const m = def.minion!;
      const minion: Minion = {
        id: nextId(),
        defId: def.defId,
        attack: m.attack,
        hp: m.hp,
        maxHp: m.hp,
        size: m.size,
        keywords: m.keywords,
      };
      return { board: [...state.board, minion] };
    }),
  clearBoard: () => set({ board: [] }),
}));
