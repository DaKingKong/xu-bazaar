import { describe, expect, it } from 'vitest';
import {
  CARD_DB,
  DUMMY_HERO_ID,
  FATIGUE_STRIKE_DEF_ID,
  HELL_WARLOCK_ID,
  HERO_DB,
  buildSampleDeck,
} from '../data/index.ts';
import { beginTurn, drawOne } from './draw.ts';
import { damageMinion } from './helpers.ts';
import { runAutoBattle } from './autoBattle.ts';
import { chooseCombo } from './ai.ts';
import { createBattle, endTurn, runEnemyTurn } from './battle.ts';
import { playCard } from './play.ts';
import { useSkill } from './skill.ts';
import { makeRng } from './rng.ts';
import type { BattleEvent, BattleState, CardInstance, Minion, PlayerState, Side } from './types.ts';

// --- 测试工具 ---

function mkMinion(
  id: string,
  attack: number,
  hp: number,
  opts: { keywords?: Minion['keywords']; size?: 1 | 2; defId?: string; tags?: Minion['tags'] } = {},
): Minion {
  return {
    id,
    defId: opts.defId ?? 'minion-flame',
    attack,
    hp,
    maxHp: hp,
    size: opts.size ?? 1,
    keywords: opts.keywords ?? [],
    tags: opts.tags ?? [],
  };
}

interface PlayerOpts {
  heroId?: string;
  heroAttack?: number;
  heroHp?: number;
  deck?: CardInstance[];
  hand?: CardInstance[];
  board?: Minion[];
  discard?: CardInstance[];
  energy?: number;
  fatigue?: number;
  skillUsed?: boolean;
}

function mkPlayer(side: Side, o: PlayerOpts = {}): PlayerState {
  const defId = o.heroId ?? DUMMY_HERO_ID;
  const def = HERO_DB[defId]!;
  const hp = o.heroHp ?? def.hp;
  return {
    side,
    hero: {
      side,
      defId,
      name: def.name,
      attack: o.heroAttack ?? 0,
      hp,
      maxHp: hp,
      equipmentSlot: null,
      relics: [],
      skillUsedThisTurn: o.skillUsed ?? false,
    },
    deck: o.deck ?? [],
    hand: o.hand ?? [],
    board: o.board ?? [],
    discard: o.discard ?? [],
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
    hell: { intensity: 0 },
    cardDb: CARD_DB,
    heroDb: HERO_DB,
    nextEntitySeq: 0,
  };
}

function deckOf(n: number): CardInstance[] {
  return Array.from({ length: n }, (_, i) => ({ id: `d${i}`, defId: 'minion-ice' }));
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
    const hand = Array.from({ length: 9 }, (_, i) => ({ id: `h${i}`, defId: 'minion-ice' }));
    const s = mkState({ turn: 2, player: mkPlayer('player', { deck: deckOf(5), hand }) });
    const events: BattleEvent[] = [];
    beginTurn(s, 'player', events);
    expect(s.player.hand).toHaveLength(10);
    expect(s.player.deck).toHaveLength(4); // 只成功抽出 1 张
    expect(events.filter((e) => e.type === 'draw')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'drawSkipped')).toHaveLength(1);
  });

  it('疲劳：伤害固定 2，生成攻击卡攻击力仍递增 1/2/3', () => {
    const s = mkState({ player: mkPlayer('player', { deck: [], heroHp: 30 }) });
    const events: BattleEvent[] = [];
    drawOne(s, 'player', events);
    drawOne(s, 'player', events);
    drawOne(s, 'player', events);
    expect(s.player.hero.hp).toBe(30 - 2 * 3);
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
    const hand: CardInstance[] = [{ id: 'c1', defId: 'minion-scroll-cat' }];
    const s = mkState({
      player: mkPlayer('player', { board, hand, energy: 4, deck: deckOf(3) }),
    });
    const { state } = playCard(s, { cardId: 'c1', position: 1 });
    expect(state.player.board.map((m) => m.id)).toEqual(['a', 'm_c1', 'b']);
    expect(state.player.energy).toBe(4 - 2);
  });

  it('直接攻击卡：有敌方仆从时只能选敌方仆从（打脸限制）', () => {
    const hand: CardInstance[] = [
      { id: 'atk', defId: FATIGUE_STRIKE_DEF_ID, overrideDamage: 2 },
    ];
    const s = mkState({
      player: mkPlayer('player', { hand, energy: 4 }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 1, 5)] }),
    });
    expect(() => playCard(s, { cardId: 'atk', target: { kind: 'hero', side: 'enemy' } })).toThrow();
    const { state } = playCard(s, {
      cardId: 'atk',
      target: { kind: 'minion', side: 'enemy', id: 'e1' },
    });
    expect(state.enemy.board[0].hp).toBe(5 - 2);
    expect(state.player.discard.some((c) => c.id === 'atk')).toBe(true);
  });

  it('法术卡不受打脸限制，可自由指定角色', () => {
    const hand: CardInstance[] = [{ id: 'fb', defId: 'spell-fireball' }];
    const s = mkState({
      player: mkPlayer('player', { hand, energy: 4 }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 1, 5)], heroHp: 30 }),
    });
    const { state } = playCard(s, { cardId: 'fb', target: { kind: 'hero', side: 'enemy' } });
    expect(state.enemy.hero.hp).toBe(30 - 8);
    expect(state.player.discard.some((c) => c.id === 'fb')).toBe(true);
  });

  it('灵光之盾：第一次打出扣费结算一次后留手', () => {
    const hand: CardInstance[] = [{ id: 'ag', defId: 'spell-aegis' }];
    const s = mkState({
      player: mkPlayer('player', {
        hand,
        energy: 4,
        deck: deckOf(5),
        board: [mkMinion('p1', 1, 3)],
      }),
    });
    const { state } = playCard(s, {
      cardId: 'ag',
      target: { kind: 'minion', side: 'player', id: 'p1' },
    });
    expect(state.player.energy).toBe(2);
    expect(state.player.board[0]!.shield).toBe(4);
    expect(state.player.hand.some((c) => c.id === 'ag')).toBe(true);
    expect(state.player.discard.some((c) => c.id === 'ag')).toBe(false);
    // 抽 1 张后手牌：灵光之盾 + 抽出的牌
    expect(state.player.hand).toHaveLength(2);
  });

  it('灵光之盾：两次打出各扣费，第二次用尽进弃牌', () => {
    const hand: CardInstance[] = [{ id: 'ag', defId: 'spell-aegis' }];
    const s = mkState({
      player: mkPlayer('player', {
        hand,
        energy: 4,
        deck: deckOf(5),
        board: [mkMinion('p1', 1, 3)],
      }),
    });
    let st = playCard(s, {
      cardId: 'ag',
      target: { kind: 'minion', side: 'player', id: 'p1' },
    }).state;
    expect(st.player.energy).toBe(2);
    expect(st.player.board[0]!.shield).toBe(4);
    expect(st.player.hand.some((c) => c.id === 'ag')).toBe(true);

    st = playCard(st, {
      cardId: 'ag',
      target: { kind: 'minion', side: 'player', id: 'p1' },
    }).state;
    expect(st.player.energy).toBe(0);
    expect(st.player.board[0]!.shield).toBe(8);
    expect(st.player.hand.some((c) => c.id === 'ag')).toBe(false);
    expect(st.player.discard.some((c) => c.id === 'ag')).toBe(true);
  });

  it('大型仆从占两格：7 格占满不可召唤', () => {
    const board = [
      mkMinion('g1', 2, 10, { size: 2, defId: 'minion-golem-guard', tags: ['large'] }),
      mkMinion('g2', 2, 10, { size: 2, defId: 'minion-golem-guard', tags: ['large'] }),
      mkMinion('g3', 2, 10, { size: 2, defId: 'minion-golem-guard', tags: ['large'] }),
    ];
    const hand: CardInstance[] = [{ id: 'g4', defId: 'minion-golem-guard' }];
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
      { id: 'c1', defId: 'minion-ice' }, // 1
      { id: 'c2', defId: 'minion-golem-guard' }, // 3
      { id: 'c3', defId: 'minion-flame' }, // 1
    ];
    for (let seed = 0; seed < 10; seed += 1) {
      const combo = chooseCombo(hand, CARD_DB, 4, makeRng(seed));
      const total = combo.reduce((sum, c) => sum + CARD_DB[c.defId].cost, 0);
      expect(total).toBe(4);
    }
  });

  it('无法恰好用光时尽量多消耗', () => {
    const hand: CardInstance[] = [
      { id: 'c1', defId: 'spell-fireball' }, // 3
      { id: 'c2', defId: 'spell-fireball' }, // 3
    ];
    const combo = chooseCombo(hand, CARD_DB, 4, makeRng(1));
    const total = combo.reduce((sum, c) => sum + CARD_DB[c.defId].cost, 0);
    expect(total).toBe(3);
  });

  it('无可打出的卡返回空组合', () => {
    const hand: CardInstance[] = [{ id: 'c1', defId: 'spell-demon-portal' }]; // 3
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
        player: { hero: { defId: HELL_WARLOCK_ID }, deck: buildSampleDeck('p') },
        enemy: { hero: { defId: DUMMY_HERO_ID }, deck: buildSampleDeck('e') },
        cardDb: CARD_DB,
        heroDb: HERO_DB,
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
        const playable = s.player.hand.find((c) => {
          const def = s.cardDb[c.defId];
          if (!def || def.cost > s.player.energy) return false;
          if (def.targeting?.needsDiscard && s.player.discard.length === 0) return false;
          if (def.effects?.some((e) => e.type === 'destroyTarget') && s.player.board.length === 0)
            return false;
          return true;
        });
        if (playable) {
          const def = s.cardDb[playable.defId];
          try {
            if (def.type === 'minion') {
              s = playCard(s, { cardId: playable.id, position: s.player.board.length }).state;
            } else if (def.targeting?.needsDiscard) {
              const disc = s.player.discard[0]!;
              const chosenDef = s.cardDb[disc.defId];
              let target = undefined;
              if (chosenDef?.targeting?.needsTarget) {
                if (chosenDef.targeting.side === 'ally') {
                  target =
                    s.player.board.length > 0
                      ? { kind: 'minion' as const, side: 'player' as const, id: s.player.board[0]!.id }
                      : { kind: 'hero' as const, side: 'player' as const };
                } else {
                  target =
                    s.enemy.board.length > 0
                      ? { kind: 'minion' as const, side: 'enemy' as const, id: s.enemy.board[0]!.id }
                      : { kind: 'hero' as const, side: 'enemy' as const };
                }
              }
              s = playCard(s, {
                cardId: playable.id,
                discardCardId: disc.id,
                target,
              }).state;
            } else if (def.targeting?.needsTarget && def.targeting.side === 'ally') {
              const target =
                s.player.board.length > 0
                  ? { kind: 'minion' as const, side: 'player' as const, id: s.player.board[0]!.id }
                  : { kind: 'hero' as const, side: 'player' as const };
              if (!def.targeting.allowHero && target.kind === 'hero') throw new Error('skip');
              s = playCard(s, { cardId: playable.id, target }).state;
            } else if (def.targeting?.needsTarget) {
              const enemyBoard = s.enemy.board;
              const target =
                enemyBoard.length > 0
                  ? { kind: 'minion' as const, side: 'enemy' as const, id: enemyBoard[0]!.id }
                  : { kind: 'hero' as const, side: 'enemy' as const };
              s = playCard(s, { cardId: playable.id, target }).state;
            } else {
              s = playCard(s, { cardId: playable.id }).state;
            }
            progressed = true;
          } catch {
            // 移出手牌失败项：跳过本张，避免死循环
            s = structuredClone(s);
            const idx = s.player.hand.findIndex((c) => c.id === playable.id);
            if (idx >= 0) s.player.hand.splice(idx, 1);
            progressed = s.player.hand.some((c) => s.cardDb[c.defId].cost <= s.player.energy);
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

// --- 英雄技能与词条 ---

describe('英雄技能 / 词条', () => {
  it('地狱术士技能：2 费造成 2 伤害，未击杀不抽牌', () => {
    const s = mkState({
      player: mkPlayer('player', {
        heroId: HELL_WARLOCK_ID,
        energy: 4,
        deck: deckOf(3),
      }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 1, 5)] }),
    });
    const res = useSkill(s, { target: { kind: 'minion', side: 'enemy', id: 'e1' } });
    expect(res.state.player.energy).toBe(2);
    expect(res.state.player.hero.skillUsedThisTurn).toBe(true);
    expect(res.state.enemy.board[0]!.hp).toBe(3);
    expect(res.state.player.hand).toHaveLength(0);
    expect(res.events.some((e) => e.type === 'useSkill')).toBe(true);
    expect(res.events.some((e) => e.type === 'draw')).toBe(false);
  });

  it('击杀词条：伤害击杀目标时抽取 1', () => {
    const s = mkState({
      player: mkPlayer('player', {
        heroId: HELL_WARLOCK_ID,
        energy: 4,
        deck: deckOf(3),
      }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 1, 2)] }),
    });
    const res = useSkill(s, { target: { kind: 'minion', side: 'enemy', id: 'e1' } });
    expect(res.state.enemy.board).toHaveLength(0);
    expect(res.state.player.hand).toHaveLength(1);
    expect(res.events.some((e) => e.type === 'death')).toBe(true);
    expect(res.events.some((e) => e.type === 'draw')).toBe(true);
  });

  it('每回合只能使用一次技能', () => {
    const s = mkState({
      player: mkPlayer('player', {
        heroId: HELL_WARLOCK_ID,
        energy: 4,
        skillUsed: true,
      }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 1, 5)] }),
    });
    expect(() =>
      useSkill(s, { target: { kind: 'minion', side: 'enemy', id: 'e1' } }),
    ).toThrow(/already used/);
  });

  it('训练假人无技能', () => {
    const s = mkState({
      player: mkPlayer('player', { heroId: DUMMY_HERO_ID, energy: 4 }),
      enemy: mkPlayer('enemy', { board: [mkMinion('e1', 1, 5)] }),
    });
    expect(() =>
      useSkill(s, { target: { kind: 'minion', side: 'enemy', id: 'e1' } }),
    ).toThrow(/no skill/);
  });

  it('createBattle：玩家地狱术士、敌人训练假人', () => {
    const s = createBattle({
      player: { hero: { defId: HELL_WARLOCK_ID }, deck: [] },
      enemy: { hero: { defId: DUMMY_HERO_ID }, deck: [] },
      cardDb: CARD_DB,
      heroDb: HERO_DB,
    });
    expect(s.player.hero.name).toBe('地狱术士');
    expect(s.enemy.hero.name).toBe('训练假人');
    expect(HERO_DB[s.player.hero.defId]!.skill?.cost).toBe(2);
    expect(HERO_DB[s.enemy.hero.defId]!.skill).toBeNull();
  });

  it('createBattle：传入 rng 时洗牌', () => {
    const ordered = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      defId: 'minion-ice',
    }));
    const s1 = createBattle(
      {
        player: { hero: { defId: HELL_WARLOCK_ID }, deck: ordered },
        enemy: { hero: { defId: DUMMY_HERO_ID }, deck: ordered },
        cardDb: CARD_DB,
        heroDb: HERO_DB,
      },
      makeRng(1),
    );
    const s2 = createBattle(
      {
        player: { hero: { defId: HELL_WARLOCK_ID }, deck: ordered },
        enemy: { hero: { defId: DUMMY_HERO_ID }, deck: ordered },
        cardDb: CARD_DB,
        heroDb: HERO_DB,
      },
      makeRng(2),
    );
    const ids1 = s1.player.deck.map((c) => c.id).join(',');
    const ids2 = s2.player.deck.map((c) => c.id).join(',');
    const orderedIds = ordered.map((c) => c.id).join(',');
    expect(ids1).not.toBe(orderedIds);
    expect(ids1).not.toBe(ids2);
  });

  it('createBattle：先锋卡在洗牌后置于牌库顶端', () => {
    const deck = [
      { id: 'ice', defId: 'minion-ice' },
      { id: 'ritual', defId: 'spell-hell-beast-ritual' },
      { id: 'flame', defId: 'minion-flame' },
      { id: 'demon', defId: 'minion-demon' },
    ];
    expect(CARD_DB['spell-hell-beast-ritual']!.keywords).toContain('vanguard');

    const noShuffle = createBattle({
      player: { hero: { defId: HELL_WARLOCK_ID }, deck },
      enemy: { hero: { defId: DUMMY_HERO_ID }, deck: [] },
      cardDb: CARD_DB,
      heroDb: HERO_DB,
    });
    expect(noShuffle.player.deck[0]!.id).toBe('ritual');

    for (const seed of [1, 2, 7, 42, 99]) {
      const s = createBattle(
        {
          player: { hero: { defId: HELL_WARLOCK_ID }, deck },
          enemy: { hero: { defId: DUMMY_HERO_ID }, deck: [] },
          cardDb: CARD_DB,
          heroDb: HERO_DB,
        },
        makeRng(seed),
      );
      expect(s.player.deck[0]!.id).toBe('ritual');
      expect(s.player.deck).toHaveLength(4);
    }
  });
});
