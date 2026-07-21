import { AnimatePresence, motion } from 'framer-motion';
import { useBattleStore } from '../store/battleStore.ts';
import { MINION_NAME_BY_DEF_ID } from '../data/minionMeta.ts';
import { BOARD_CAPACITY } from '../engine/index.ts';
import './App.css';

// M1 骨架 UI（占位）。
// 展示战场布局骨架 + 演示 Framer Motion 的插入/重排/进出场动画，
// 用以验证 React + Zustand + Framer Motion + TypeScript 技术栈已连通。
// 完整战斗界面与交互将在 M6 实现（见 docs/implementation-plan.md）。
function App() {
  const board = useBattleStore((s) => s.board);
  const summonDemoMinion = useBattleStore((s) => s.summonDemoMinion);
  const clearBoard = useBattleStore((s) => s.clearBoard);

  return (
    <div className="app">
      <header className="app__header">
        <h1>xu-bazaar</h1>
        <p>轻量化 PVE 卡牌对战 · 开发骨架 (M1)</p>
      </header>

      <main className="scene">
        <section className="hero-row hero-row--enemy" aria-label="敌人角色区">
          <div className="hero">
            <span className="hero__label">敌人</span>
            <span className="hero__stats">
              <span className="stat stat--atk">2</span>
              <span className="stat stat--hp">30</span>
            </span>
          </div>
        </section>

        <section className="board" aria-label="演示仆从区">
          <AnimatePresence>
            {board.map((minion) => (
              <motion.div
                key={minion.id}
                layout
                className={`minion${minion.keywords.includes('taunt') ? ' minion--taunt' : ''}`}
                initial={{ opacity: 0, scale: 0.6, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.4, y: -20 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                <span className="minion__name">
                  {MINION_NAME_BY_DEF_ID[minion.defId] ?? minion.defId}
                </span>
                <span className="minion__stats">
                  <span className="stat stat--atk">{minion.attack}</span>
                  <span className="stat stat--hp">{minion.hp}</span>
                </span>
                {minion.keywords.includes('taunt') && <span className="minion__tag">嘲讽</span>}
              </motion.div>
            ))}
          </AnimatePresence>
          {board.length === 0 && <p className="board__empty">仆从区为空 —— 点击下方按钮召唤</p>}
        </section>

        <div className="controls">
          <button
            type="button"
            onClick={summonDemoMinion}
            disabled={board.length >= BOARD_CAPACITY}
          >
            召唤仆从 ({board.length}/{BOARD_CAPACITY})
          </button>
          <button type="button" onClick={clearBoard} disabled={board.length === 0}>
            清空
          </button>
        </div>

        <section className="hero-row hero-row--player" aria-label="玩家角色区">
          <div className="hero hero--player">
            <span className="hero__label">玩家</span>
            <span className="hero__stats">
              <span className="stat stat--atk">2</span>
              <span className="stat stat--hp">30</span>
            </span>
          </div>
        </section>
      </main>

      <footer className="app__footer">
        <span>骨架演示：召唤按钮触发 Framer Motion 进出场/重排动画。</span>
        <span>战斗规则（引擎/AI/动画结算）为后续里程碑，详见 docs/。</span>
      </footer>
    </div>
  );
}

export default App;
