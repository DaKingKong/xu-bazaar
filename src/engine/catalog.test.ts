import { describe, expect, it } from 'vitest';
import {
  CARD_DB,
  DUMMY_HERO_ID,
  HELL_WARLOCK_ID,
  HERO_DB,
  buildEnemyHellDeck,
  buildPlayerHellDeck,
} from '../data/index.ts';
import { runAutoBattle } from './autoBattle.ts';
import { createBattle, runEnemyTurn } from './battle.ts';
import { damageMinion, scaleAttributeGain } from './helpers.ts';
import { playCard } from './play.ts';
import { trySummon } from './resolve.ts';
import { makeRng } from './rng.ts';
import type { BattleState, CardInstance, Minion, PlayerState, Side } from './types.ts';

function mkMinion(
  id: string,
  attack: number,
  hp: number,
  opts: Partial<Minion> & { defId?: string } = {},
): Minion {
  return {
    id,
    defId: opts.defId ?? 'minion-ice',
    attack,
    hp,
    maxHp: opts.maxHp ?? hp,
    size: opts.size ?? 1,
    keywords: opts.keywords ?? [],
    tags: opts.tags ?? [],
    multiAttack: opts.multiAttack,
    rebirth: opts.rebirth,
    shield: opts.shield,
  };
}

function mkPlayer(side: Side, o: Partial<PlayerState> = {}): PlayerState {
  const defId = side === 'player' ? HELL_WARLOCK_ID : DUMMY_HERO_ID;
  const def = HERO_DB[defId]!;
  return {
    side,
    hero: {
      side,
      defId,
      name: def.name,
      attack: 0,
      hp: 30,
      maxHp: 30,
      skillUsedThisTurn: false,
    },
    deck: o.deck ?? [],
    hand: o.hand ?? [],
    board: o.board ?? [],
    discard: o.discard ?? [],
    energy: o.energy ?? 4,
    maxEnergy: 4,
    fatigueCount: 0,
    rituals: o.rituals ?? [],
    incomingDamageMultiplier: o.incomingDamageMultiplier,
  };
}

function mkState(o: {
  player?: PlayerState;
  enemy?: PlayerState;
  hell?: BattleState['hell'];
} = {}): BattleState {
  return {
    turn: 1,
    activeSide: 'player',
    phase: 'playerPlay',
    player: o.player ?? mkPlayer('player'),
    enemy: o.enemy ?? mkPlayer('enemy'),
    winner: null,
    hell: o.hell ?? { intensity: 0 },
    cardDb: CARD_DB,
    heroDb: HERO_DB,
    nextEntitySeq: 0,
  };
}

describe('catalog-deck-v1', () => {
  it('大型属性增益 +50%', () => {
    const large = mkMinion('L', 2, 10, { tags: ['large'], size: 2 });
    expect(scaleAttributeGain(large, 2)).toBe(3);
    expect(scaleAttributeGain(mkMinion('n', 1, 1), 2)).toBe(2);
  });

  it('死亡流转：消灭友方并按费用抽牌，尸体进弃牌', () => {
    const hand: CardInstance[] = [{ id: 'df', defId: 'spell-death-flow' }];
    const s = mkState({
      player: mkPlayer('player', {
        hand,
        board: [mkMinion('ally', 1, 3, { defId: 'minion-golem-guard' })],
        deck: [
          { id: 'd0', defId: 'minion-ice' },
          { id: 'd1', defId: 'minion-ice' },
          { id: 'd2', defId: 'minion-ice' },
        ],
      }),
    });
    const { state } = playCard(s, {
      cardId: 'df',
      target: { kind: 'minion', side: 'player', id: 'ally' },
    });
    expect(state.player.board).toHaveLength(0);
    expect(state.player.hand).toHaveLength(3);
    expect(state.player.discard.some((c) => c.defId === 'minion-golem-guard')).toBe(true);
  });

  it('恶魔入场召唤小恶魔；恶魔召唤带重生', () => {
    const s = mkState({
      player: mkPlayer('player', {
        hand: [{ id: 'd', defId: 'minion-demon' }],
        energy: 4,
      }),
    });
    const { state } = playCard(s, { cardId: 'd', position: 0 });
    expect(state.player.board).toHaveLength(2);
    expect(state.player.board.map((m) => m.defId).sort()).toEqual([
      'minion-demon',
      'token-imp-demon',
    ]);

    const s2 = mkState({
      player: mkPlayer('player', {
        hand: [{ id: 'ds', defId: 'spell-demon-summon' }],
      }),
    });
    const r2 = playCard(s2, { cardId: 'ds' });
    expect(r2.state.player.board[0]!.rebirth).toBe(1);
  });

  it('仪式献祭：5 次友方死亡召唤小恶魔并重置', () => {
    let s = mkState({
      player: mkPlayer('player', {
        hand: [{ id: 'p', defId: 'spell-demon-portal' }],
        board: [
          mkMinion('a', 0, 1),
          mkMinion('b', 0, 1),
          mkMinion('c', 0, 1),
          mkMinion('d', 0, 1),
          mkMinion('e', 0, 1),
        ],
      }),
    });
    s = playCard(s, { cardId: 'p' }).state;
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      damageMinion(s, 'player', id, 1, []);
    }
    expect(s.player.rituals[0]!.sacrifice).toBe(0);
    expect(s.player.board.some((m) => m.defId === 'token-imp-portal')).toBe(true);
  });

  it('凯斯提入场激活全局地狱；回合末非地狱仆从受伤', () => {
    const s = mkState({
      player: mkPlayer('player', { board: [] }),
      enemy: mkPlayer('enemy', {
        board: [mkMinion('norm', 0, 5), mkMinion('hell', 0, 5, { tags: ['hell'] })],
      }),
    });
    trySummon(s, 'player', 'token-kest', []);
    expect(s.hell.intensity).toBe(1);
    const kest = s.player.board.find((m) => m.defId === 'token-kest');
    if (kest) kest.attack = 0;
    const { state } = runAutoBattle(s, makeRng(1));
    expect(state.enemy.board.find((m) => m.id === 'hell')?.hp).toBe(5);
    expect(state.enemy.board.find((m) => m.id === 'norm')?.hp).toBe(3);
  });

  it('冥界牵引再用火球', () => {
    const s = mkState({
      player: mkPlayer('player', {
        hand: [{ id: 'np', defId: 'spell-nether-pull' }],
        discard: [{ id: 'old-fb', defId: 'spell-fireball' }],
        energy: 4,
      }),
      enemy: mkPlayer('enemy'),
    });
    s.enemy.hero.hp = 30;
    const { state } = playCard(s, {
      cardId: 'np',
      discardCardId: 'old-fb',
      target: { kind: 'hero', side: 'enemy' },
    });
    expect(state.enemy.hero.hp).toBe(22);
    expect(state.player.energy).toBe(1);
    expect(state.player.discard.some((c) => c.id === 'old-fb')).toBe(true);
    expect(state.player.discard.some((c) => c.id === 'np')).toBe(true);
  });

  it('诅咒爆破：AOE 后本回合敌方仆从双倍受伤', () => {
    const s = mkState({
      player: mkPlayer('player', {
        hand: [
          { id: 'cb', defId: 'spell-curse-blast' },
          { id: 'fb', defId: 'spell-fireball' },
        ],
        energy: 6,
      }),
      enemy: mkPlayer('enemy', {
        board: [mkMinion('e1', 0, 20)],
      }),
    });
    let st = playCard(s, { cardId: 'cb' }).state;
    expect(st.enemy.board[0]!.hp).toBe(18);
    expect(st.enemy.hero.hp).toBe(28);
    st = playCard(st, {
      cardId: 'fb',
      target: { kind: 'minion', side: 'enemy', id: 'e1' },
    }).state;
    expect(st.enemy.board[0]!.hp).toBe(2);
  });

  it('主题组与 AI 能跑完敌人回合', () => {
    const rng = makeRng(7);
    let s = createBattle(
      {
        player: { hero: { defId: HELL_WARLOCK_ID }, deck: buildPlayerHellDeck('p') },
        enemy: { hero: { defId: DUMMY_HERO_ID }, deck: buildEnemyHellDeck('e') },
        cardDb: CARD_DB,
        heroDb: HERO_DB,
      },
      rng,
    );
    expect(() => {
      s = runEnemyTurn(s, rng).state;
    }).not.toThrow();
    expect(s.phase === 'playerPlay' || s.phase === 'ended').toBe(true);
  });

  it('多重攻击：额外攻击一次', () => {
    const s = mkState({
      player: mkPlayer('player', {
        board: [mkMinion('p1', 2, 5, { multiAttack: 1 })],
      }),
      enemy: mkPlayer('enemy'),
    });
    const { state } = runAutoBattle(s, makeRng(1));
    expect(state.enemy.hero.hp).toBe(26);
  });

  it('重生：立即回满血；攻击方重生后不再打剩余连击', () => {
    const s = mkState({
      player: mkPlayer('player', {
        board: [mkMinion('p1', 3, 1, { multiAttack: 1, rebirth: 1 })],
      }),
      enemy: mkPlayer('enemy', {
        board: [mkMinion('e1', 5, 10)],
      }),
    });
    s.player.board[0]!.maxHp = 10;
    s.player.board[0]!.hp = 1;
    const { state, events } = runAutoBattle(s, makeRng(1));
    const attacks = events.filter(
      (e) => e.type === 'attack' && e.attacker.kind === 'minion' && e.attacker.id === 'p1',
    );
    expect(events.some((e) => e.type === 'rebirth' && e.minionId === 'p1')).toBe(true);
    // 重生取消连击：玩家只出手 1 次（若连击会有 2 次）
    expect(attacks).toHaveLength(1);
    const p1 = state.player.board.find((m) => m.id === 'p1');
    expect(p1).toBeDefined();
    expect(p1!.rebirth).toBe(0);
    expect(p1!.hasAttackedThisTurn).toBe(true);
    // 玩家一击 3 + 敌方回合反打时吃到的反伤 3 → 4
    expect(state.enemy.board[0]!.hp).toBe(4);
  });
});
