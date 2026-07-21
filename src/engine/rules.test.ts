import { describe, expect, it } from 'vitest';
import { CARD_DB, FATIGUE_STRIKE_DEF_ID, buildSampleDeck } from '../data/index.ts';
import { beginTurn, drawOne } from './draw.ts';
import { damageMinion } from './helpers.ts';
import { runAutoBattle } from './autoBattle.ts';
import { chooseCombo } from './ai.ts';
import { createBattle, endTurn, runEnemyTurn } from './battle.ts';
import { playCard } from './play.ts';
import { makeRng } from './rng.ts';
import type { BattleEvent, BattleState, CardInstance, Minion, PlayerState, Side } from './types.ts';

// --- 测试工具 ---

function mkMinion(
  id: string,
  attack: number,
  hp: number,
  opts: { keywords?: Minion['keywords']; size?: 1 | 2; defId?: string } = {},
): Minion {
  return {
    id,
    defId: opts.defId ?? 'minion-striker',
    attack,
    hp,
    maxHp: hp,
    size: opts.size ?? 1,
    keywords: opts.keywords ?? [],
  };
}

interface PlayerOpts {
  heroAttack?: number;
  heroHp?: number;
  deck?: CardInstance[];
  hand?: CardInstance[];
  board?: Minion[];
  energy?: number;
  fatigue?: number;
}

function mkPlayer(side: Side, o: PlayerOpts = {}): PlayerState {
  const hp = o.heroHp ?? 30;
  return {
    side,
    hero: {
      side,
      attack: o.heroAttack ?? 0,
      hp,
      maxHp: hp,
      equipmentSlot: null,
      relics: [],
      skill: null,
    },
    deck: o.deck ?? [],
    hand: o.hand ?? [],
    board: o.board ?? [],
    energy: o.energy ?? 4,
    maxEnergy: 4,
    fatigueCount: o.fatigue ?? 0,
  };
}

interface StateOpts {
  turn?: number;
  activeSide?: Side;
  phase?: BattleState['phase'];
  player?: PlayerState;
  enemy?: PlayerState;
}

function mkState(o: StateOpts = {}): BattleState {
  return {
    turn: o.turn ?? 1,
    activeSide: o.activeSide ?? 'player',
    phase: o.phase ?? 'playerPlay',
    player: o.player ?? mkPlayer('player'),
    enemy: o.enemy ?? mkPlayer('enemy'),
    winner: null,
    fieldEffect: null,
    cardDb: CARD_DB,
  };
}

function deckOf(n: number): CardInstance[] {
  return Array.from({ length: n }, (_, i) => ({ id: `d${i}`, defId: 'minion-recruit' }));
}

// --- M2：抽牌 / 能量 / 疲劳 ---

describe('M2 抽牌/能量/疲劳', () => {
  it('首回合抽 5 张，能量重置为 4', () => {
    const s = mkState({ turn: 1, player: mkPlayer('player', { deck: deckOf(10), energy: 0 }) });
    const events: BattleEvent[] = [];
    beginTurn(s, 'player', events);
    expect(s.player.hand).toHaveLength(5);
    expect(s.player.deck).toHaveLength(5);
    expect(s.player.energy).toBe(4);
    expect(events.some((e) => e.type === 'energyReset' && e.value === 4)).toBe(true);
  });

  it('非首回合抽 2 张', () => {
    const s = mkState({ turn: 2, player: mkPlayer('player', { deck: deckOf(10) }) });
    beginTurn(s, 'player', []);
    expect(s.player.hand).toHaveLength(2);
  });

  it('手牌满(10)跳过抽牌，以单次抽牌统计（9→抽1满10→第2张跳过）', () => {
    const hand = Array.from({ length: 9 }, (_, i) => ({ id: `h${i}`, defId: 'minion-recruit' }));
    const s = mkState({ turn: 2, player: mkPlayer('player', { deck: deckOf(5), hand }) });
    const events: BattleEvent[] = [];
    beginTurn(s, 'player', events);
    expect(s.player.hand).toHaveLength(10);
    expect(s.player.deck).toHaveLength(4); // 只成功抽出 1 张
    expect(events.filter((e) => e.type === 'draw')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'drawSkipped')).toHaveLength(1);
  });

  it('疲劳递增：伤害 2/4/6，生成攻击卡攻击力 1/2/3', () => {
    const s = mkState({ player: mkPlayer('player', { deck: [], heroHp: 30 }) });
    const events: BattleEvent[] = [];
    drawOne(s, 'player', events);
    drawOne(s, 'player', events);
    drawOne(s, 'player', events);
    expect(s.player.hero.hp).toBe(30 - (2 + 4 + 6));
    expect(s.player.fatigueCount).toBe(3);
    const generated = s.player.hand.filter((c) => c.defId === FATIGUE_STRIKE_DEF_ID);
    expect(generated.map((c) => c.overrideDamage)).toEqual([1, 2, 3]);
  });

  it('疲劳敌我独立', () => {
    const s = mkState({
      player: mkPlayer('player', { deck: [] }),
      enemy: mkPlayer('enemy', { deck: [] }),
    });
    drawOne(s, 'player', []);
    expect(s.player.fatigueCount).toBe(1);
    expect(s.enemy.fatigueCount).toBe(0);
  });

  it('能量每回合重置为 4（不增长）', () => {
    const s = mkState({ turn: 2, player: mkPlayer('player', { deck: deckOf(10), energy: 1 }) });
    beginTurn(s, 'player', []);
    expect(s.player.energy).toBe(4);
  });
});

// --- M3：出牌 ---

describe('M3 出牌', () => {
  it('召唤仆从插入到指定位置', () => {
    const board = [mkMinion('a', 1, 1), mkMinion('b', 1, 1)];
    const hand: CardInstance[] = [{ id: 'c1', defId: 'minion-striker' }];
    const s = mkState({ player: mkPlayer('player', { board, hand, energy: 4 }) });
    const { state } = playCard(s, { cardId: 'c1', position: 1 });
    expect(state.player.board.map((m) => m.id)).toEqual(['a', 'm_c1', 'b']);
    expect(state.player.energy).toBe(4 - 3);
  });

  it('直接攻击卡：有敌方仆从时只能选敌方仆从（打脸限制）', () => {
    const hand: CardInstance[] = [{ id: 'atk', defId: 'attack-strike' }];
    const s = mkState({
      player: mkPlayer('player', { hand, energy: 4 }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 1, 5)] }),
    });
    // 打脸非法
    expect(() => playCard(s, { cardId: 'atk', target: { kind: 'hero', side: 'enemy' } })).toThrow();
    // 打仆从合法
    const { state } = playCard(s, {
      cardId: 'atk',
      target: { kind: 'minion', side: 'enemy', id: 'e1' },
    });
    expect(state.enemy.board[0].hp).toBe(5 - 2);
  });

  it('法术卡不受打脸限制，可自由指定角色', () => {
    const hand: CardInstance[] = [{ id: 'fb', defId: 'spell-firebolt' }];
    const s = mkState({
      player: mkPlayer('player', { hand, energy: 4 }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 1, 5)], heroHp: 30 }),
    });
    const { state } = playCard(s, { cardId: 'fb', target: { kind: 'hero', side: 'enemy' } });
    expect(state.enemy.hero.hp).toBe(30 - 3);
  });

  it('治疗法术恢复生命且不超过上限', () => {
    const hand: CardInstance[] = [{ id: 'mend', defId: 'spell-mend' }];
    const s = mkState({ player: mkPlayer('player', { hand, energy: 4, heroHp: 30 }) });
    s.player.hero.hp = 29;
    const { state } = playCard(s, { cardId: 'mend', target: { kind: 'hero', side: 'player' } });
    expect(state.player.hero.hp).toBe(30);
  });

  it('大型仆从占两格：7 格占满不可召唤', () => {
    const board = [
      mkMinion('g1', 5, 6, { size: 2, defId: 'minion-golem' }),
      mkMinion('g2', 5, 6, { size: 2, defId: 'minion-golem' }),
      mkMinion('g3', 5, 6, { size: 2, defId: 'minion-golem' }),
    ]; // usage 6，仅剩 1 格
    const hand: CardInstance[] = [{ id: 'g4', defId: 'minion-golem' }];
    const s = mkState({ player: mkPlayer('player', { board, hand, energy: 4 }) });
    expect(() => playCard(s, { cardId: 'g4', position: 3 })).toThrow();
  });
});

// --- M3：自动战斗 ---

describe('M3 自动战斗', () => {
  it('攻击力 0 的仆从跳过攻击', () => {
    const s = mkState({
      player: mkPlayer('player', { board: [mkMinion('p1', 0, 3)] }),
      enemy: mkPlayer('enemy', { heroHp: 30 }),
    });
    const { state, events } = runAutoBattle(s, makeRng(1));
    expect(state.enemy.hero.hp).toBe(30);
    expect(events.some((e) => e.type === 'attack')).toBe(false);
  });

  it('双向打脸结算：仆从打脸并受角色攻击力反伤', () => {
    const s = mkState({
      player: mkPlayer('player', { board: [mkMinion('p1', 3, 4)] }),
      enemy: mkPlayer('enemy', { heroAttack: 2, heroHp: 30, board: [] }),
    });
    const { state, events } = runAutoBattle(s, makeRng(1));
    expect(state.enemy.hero.hp).toBe(30 - 3);
    expect(state.player.board[0].hp).toBe(4 - 2);
    expect(events.some((e) => e.type === 'counter' && e.damage === 2)).toBe(true);
  });

  it('嘲讽优先：只攻击嘲讽仆从（多个嘲讽随机，普通仆从不受伤）', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const s = mkState({
        player: mkPlayer('player', { board: [mkMinion('p1', 1, 10)] }),
        enemy: mkPlayer('enemy', {
          board: [
            mkMinion('t1', 0, 5, { keywords: ['taunt'] }),
            mkMinion('t2', 0, 5, { keywords: ['taunt'] }),
            mkMinion('n1', 0, 5),
          ],
        }),
      });
      const { state } = runAutoBattle(s, makeRng(seed));
      const normal = state.enemy.board.find((m) => m.id === 'n1');
      expect(normal?.hp).toBe(5); // 普通仆从从不被选中
      const damagedTaunt = state.enemy.board.filter((m) => m.hp < 5).length;
      expect(damagedTaunt).toBe(1);
    }
  });

  it('死亡即时移除 + 格子左移', () => {
    const s = mkState({
      player: mkPlayer('player', {
        board: [mkMinion('a', 1, 1), mkMinion('b', 1, 1), mkMinion('c', 1, 1)],
      }),
    });
    const events: BattleEvent[] = [];
    damageMinion(s, 'player', 'b', 1, events);
    expect(s.player.board.map((m) => m.id)).toEqual(['a', 'c']);
    expect(events.some((e) => e.type === 'death' && e.minionId === 'b')).toBe(true);
  });

  it('随机选目标使用实时存活列表（击杀后重新指向）', () => {
    const s = mkState({
      player: mkPlayer('player', {
        board: [mkMinion('p1', 2, 5), mkMinion('p2', 2, 5)],
      }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 0, 1)], heroAttack: 0, heroHp: 30 }),
    });
    const { state } = runAutoBattle(s, makeRng(3));
    // p1 击杀唯一敌方仆从，p2 面对空场转而打脸
    expect(state.enemy.board).toHaveLength(0);
    expect(state.enemy.hero.hp).toBe(30 - 2);
  });

  it('胜负即时判定：玩家先手结算致胜，敌方仆从不再攻击', () => {
    const s = mkState({
      player: mkPlayer('player', { board: [mkMinion('p1', 5, 5)], heroHp: 30 }),
      enemy: mkPlayer('enemy', { board: [], heroAttack: 99, heroHp: 3 }),
    });
    const { state, events } = runAutoBattle(s, makeRng(1));
    expect(state.winner).toBe('player');
    expect(state.phase).toBe('ended');
    expect(state.player.hero.hp).toBe(30); // 敌方角色攻击力未生效（未反伤，因即时结束）
    expect(events.some((e) => e.type === 'gameOver' && e.winner === 'player')).toBe(true);
  });
});

// --- M4：敌人 AI ---

describe('M4 敌人 AI 组合搜索', () => {
  it('能恰好用光 4 能量则优先用光', () => {
    const hand: CardInstance[] = [
      { id: 'c1', defId: 'minion-recruit' }, // cost 1
      { id: 'c2', defId: 'minion-striker' }, // cost 3
      { id: 'c3', defId: 'attack-strike' }, // cost 1
    ];
    for (let seed = 0; seed < 10; seed += 1) {
      const combo = chooseCombo(hand, CARD_DB, 4, makeRng(seed));
      const total = combo.reduce((sum, c) => sum + CARD_DB[c.defId].cost, 0);
      expect(total).toBe(4);
    }
  });

  it('无法恰好用光时尽量多消耗', () => {
    const hand: CardInstance[] = [
      { id: 'c1', defId: 'minion-striker' }, // cost 3
      { id: 'c2', defId: 'minion-striker' }, // cost 3
    ];
    const combo = chooseCombo(hand, CARD_DB, 4, makeRng(1));
    const total = combo.reduce((sum, c) => sum + CARD_DB[c.defId].cost, 0);
    expect(total).toBe(3);
  });

  it('无可打出的卡返回空组合', () => {
    const hand: CardInstance[] = [{ id: 'c1', defId: 'minion-golem' }]; // cost 4
    const combo = chooseCombo(hand, CARD_DB, 1, makeRng(1));
    expect(combo).toHaveLength(0);
  });
});

// --- M5 集成：完整走通一局 ---

describe('整局流程（含敌人回合）', () => {
  it('可无动画走通完整一局直到分出胜负', () => {
    const rng = makeRng(42);
    let s = createBattle(
      {
        player: { hero: { attack: 2, hp: 30 }, deck: buildSampleDeck('p') },
        enemy: { hero: { attack: 2, hp: 30 }, deck: buildSampleDeck('e') },
        cardDb: CARD_DB,
      },
      rng,
    );

    let guard = 0;
    while (s.phase !== 'ended' && guard < 500) {
      guard += 1;
      s = runEnemyTurn(s, rng).state;
      if (s.phase === 'ended') break;
      // 玩家：依次尝试打出所有能负担的卡（贪心），然后结束回合。
      let progressed = true;
      while (progressed && s.phase === 'playerPlay') {
        progressed = false;
        const playable = s.player.hand.find((c) => s.cardDb[c.defId].cost <= s.player.energy);
        if (playable) {
          const def = s.cardDb[playable.defId];
          try {
            if (def.type === 'minion') {
              s = playCard(s, { cardId: playable.id, position: s.player.board.length }).state;
            } else if (def.heal != null) {
              s = playCard(s, {
                cardId: playable.id,
                target: { kind: 'hero', side: 'player' },
              }).state;
            } else {
              const enemyBoard = s.enemy.board;
              const target =
                enemyBoard.length > 0
                  ? { kind: 'minion' as const, side: 'enemy' as const, id: enemyBoard[0].id }
                  : { kind: 'hero' as const, side: 'enemy' as const };
              s = playCard(s, { cardId: playable.id, target }).state;
            }
            progressed = true;
          } catch {
            progressed = false;
          }
        }
      }
      if (s.phase !== 'playerPlay') continue;
      s = endTurn(s, rng).state;
      s = runAutoBattle(s, rng).state;
    }

    expect(s.phase).toBe('ended');
    expect(s.winner === 'player' || s.winner === 'enemy').toBe(true);
  });
});
