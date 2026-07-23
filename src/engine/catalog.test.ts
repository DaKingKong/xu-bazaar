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
import { legalTargets, playCard } from './play.ts';
import { trySummon } from './resolve.ts';
import { makeRng } from './rng.ts';
import type { BattleEvent, BattleState, CardInstance, Minion, PlayerState, Side } from './types.ts';

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
    // 次生仆从紧挨主仆从右侧
    expect(state.player.board.map((m) => m.defId)).toEqual([
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

  it('入场召唤的次生仆从插在主仆从右侧（中间插入时）', () => {
    const s = mkState({
      player: mkPlayer('player', {
        hand: [{ id: 'd', defId: 'minion-demon' }],
        energy: 4,
        board: [mkMinion('left', 1, 3), mkMinion('right', 1, 3)],
      }),
    });
    const { state } = playCard(s, { cardId: 'd', position: 1 });
    expect(state.player.board.map((m) => m.defId)).toEqual([
      'minion-ice',
      'minion-demon',
      'token-imp-demon',
      'minion-ice',
    ]);
    expect(state.player.board[0]!.id).toBe('left');
    expect(state.player.board[3]!.id).toBe('right');
  });

  it('仪式上场：恶魔传送门占 1 格 HP5；地狱兽仪式占 2 格 HP1', () => {
    let s = mkState({
      player: mkPlayer('player', {
        hand: [
          { id: 'portal', defId: 'spell-demon-portal' },
          { id: 'beast', defId: 'spell-hell-beast-ritual' },
        ],
        energy: 8,
      }),
    });
    s = playCard(s, { cardId: 'portal', position: 0 }).state;
    const portal = s.player.board[0]!;
    expect(portal.ritual?.ritualKey).toBe('demonPortal');
    expect(portal.hp).toBe(5);
    expect(portal.size).toBe(1);
    expect(portal.ritual?.sacrifice).toBe(0);
    expect(s.player.discard.some((c) => c.defId === 'spell-demon-portal')).toBe(false);

    s = playCard(s, { cardId: 'beast', position: 1 }).state;
    const beast = s.player.board[1]!;
    expect(beast.ritual?.ritualKey).toBe('hellBeast');
    expect(beast.hp).toBe(1);
    expect(beast.size).toBe(2);
    expect(beast.tags).toContain('large');
  });

  it('仪式永远在右侧：有仆从时上场贴右；召唤物插在仪式左侧', () => {
    let s = mkState({
      player: mkPlayer('player', {
        hand: [
          { id: 'portal', defId: 'spell-demon-portal' },
          { id: 'ice', defId: 'minion-ice' },
        ],
        energy: 8,
        board: [mkMinion('left', 1, 3)],
      }),
    });
    // 即便传入中间 position，仪式仍贴最右
    s = playCard(s, { cardId: 'portal', position: 0 }).state;
    expect(s.player.board).toHaveLength(2);
    expect(s.player.board[0]!.id).toBe('left');
    expect(s.player.board[1]!.ritual?.ritualKey).toBe('demonPortal');

    s = playCard(s, { cardId: 'ice', position: 0 }).state;
    expect(s.player.board[0]!.defId).toBe('minion-ice');
    expect(s.player.board[1]!.id).toBe('left');
    expect(s.player.board.at(-1)!.ritual?.ritualKey).toBe('demonPortal');

    // 献祭满额召唤的小恶魔也在仪式左侧
    const portalId = s.player.board.at(-1)!.id;
    for (let i = 0; i < 5; i += 1) {
      const fodder = mkMinion(`die${i}`, 0, 1);
      const ritAt = s.player.board.findIndex((m) => m.id === portalId);
      s.player.board.splice(ritAt, 0, fodder);
      damageMinion(s, 'player', fodder.id, 1, []);
    }
    const ids = s.player.board.map((m) => m.defId);
    const portalIdx = ids.lastIndexOf('spell-demon-portal');
    const impIdx = ids.indexOf('token-imp-portal');
    expect(impIdx).toBeGreaterThanOrEqual(0);
    expect(impIdx).toBeLessThan(portalIdx);
  });

  it('仪式献祭：5 次友方死亡召唤小恶魔、扣 HP，重置献祭；HP 归零进弃牌', () => {
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
    s = playCard(s, { cardId: 'p', position: 5 }).state;
    const ritualId = s.player.board.find((m) => m.ritual)?.id;
    expect(ritualId).toBeTruthy();

    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      damageMinion(s, 'player', id, 1, []);
    }
    const ritual = s.player.board.find((m) => m.id === ritualId);
    expect(ritual?.ritual?.sacrifice).toBe(0);
    expect(ritual?.hp).toBe(4);
    expect(s.player.board.some((m) => m.defId === 'token-imp-portal')).toBe(true);

    // 再执行 4 次使 HP 归零
    for (let wave = 0; wave < 4; wave += 1) {
      for (let i = 0; i < 5; i += 1) {
        const fodder = mkMinion(`f${wave}_${i}`, 0, 1);
        const ritAt = s.player.board.findIndex((m) => m.ritual);
        if (ritAt < 0) s.player.board.push(fodder);
        else s.player.board.splice(ritAt, 0, fodder);
        damageMinion(s, 'player', fodder.id, 1, []);
      }
    }
    expect(s.player.board.some((m) => m.id === ritualId)).toBe(false);
    expect(s.player.discard.some((c) => c.defId === 'spell-demon-portal')).toBe(true);
  });

  it('传送门计敌我仆从死亡；地狱兽仪式仅友方（含领主回复）', () => {
    let s = mkState({
      player: mkPlayer('player', {
        hand: [
          { id: 'portal', defId: 'spell-demon-portal' },
          { id: 'beast', defId: 'spell-hell-beast-ritual' },
        ],
        energy: 8,
        board: [mkMinion('ally', 0, 1)],
      }),
      enemy: mkPlayer('enemy', {
        board: [mkMinion('foe', 0, 1)],
      }),
    });
    s.player.hero.hp = 20;
    s = playCard(s, { cardId: 'portal', position: 1 }).state;
    s = playCard(s, { cardId: 'beast', position: 2 }).state;
    const portal = s.player.board.find((m) => m.ritual?.ritualKey === 'demonPortal')!;
    const beast = s.player.board.find((m) => m.ritual?.ritualKey === 'hellBeast')!;

    damageMinion(s, 'enemy', 'foe', 1, []);
    expect(portal.ritual!.sacrifice).toBe(1);
    expect(beast.ritual!.sacrifice).toBe(0);
    expect(s.player.hero.hp).toBe(20);

    damageMinion(s, 'player', 'ally', 1, []);
    expect(portal.ritual!.sacrifice).toBe(2);
    expect(beast.ritual!.sacrifice).toBe(1);
    expect(s.player.hero.hp).toBe(22);
  });

  it('仪式不受伤害且不可被点选', () => {
    let s = mkState({
      player: mkPlayer('player', {
        hand: [{ id: 'p', defId: 'spell-demon-portal' }],
      }),
    });
    s = playCard(s, { cardId: 'p' }).state;
    const ritual = s.player.board[0]!;
    expect(ritual.ritual).toBeTruthy();
    damageMinion(s, 'player', ritual.id, 99, []);
    expect(s.player.board[0]!.hp).toBe(5);
    expect(s.player.board[0]!.id).toBe(ritual.id);

    const targets = legalTargets(s, 'enemy', {
      targeting: { needsTarget: true, allowHero: false, respectTaunt: false, side: 'enemy' },
    });
    expect(targets.some((t) => t.kind === 'minion' && t.id === ritual.id)).toBe(false);
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

  it('冥界牵引灵光之盾：免费打一次后留手，再从手牌付费打出', () => {
    const s = mkState({
      player: mkPlayer('player', {
        hand: [{ id: 'np', defId: 'spell-nether-pull' }],
        discard: [{ id: 'old-ag', defId: 'spell-aegis' }],
        energy: 6,
        deck: [
          { id: 'd1', defId: 'minion-ice' },
          { id: 'd2', defId: 'minion-ice' },
        ],
        board: [mkMinion('p1', 1, 3)],
      }),
      enemy: mkPlayer('enemy'),
    });
    let st = playCard(s, {
      cardId: 'np',
      discardCardId: 'old-ag',
      target: { kind: 'minion', side: 'player', id: 'p1' },
    }).state;
    expect(st.player.energy).toBe(3);
    expect(st.player.board[0]!.shield).toBe(4);
    expect(st.player.hand.some((c) => c.id === 'old-ag')).toBe(true);
    expect(st.player.discard.some((c) => c.id === 'old-ag')).toBe(false);
    expect(st.player.discard.some((c) => c.id === 'np')).toBe(true);

    st = playCard(st, {
      cardId: 'old-ag',
      target: { kind: 'minion', side: 'player', id: 'p1' },
    }).state;
    expect(st.player.energy).toBe(1);
    expect(st.player.board[0]!.shield).toBe(8);
    expect(st.player.hand.some((c) => c.id === 'old-ag')).toBe(false);
    expect(st.player.discard.some((c) => c.id === 'old-ag')).toBe(true);
  });

  it('诅咒爆破：先 debuff 再 AOE，本回合敌方仆从双倍受伤', () => {
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
    // 先 debuff 再 AOE：仆从 2×2=4，英雄不受倍率仍为 2
    expect(st.enemy.board[0]!.hp).toBe(16);
    expect(st.enemy.hero.hp).toBe(28);
    st = playCard(st, {
      cardId: 'fb',
      target: { kind: 'minion', side: 'enemy', id: 'e1' },
    }).state;
    // 火球 8×2=16，击杀（原 20−4−16）
    expect(st.enemy.board.some((m) => m.id === 'e1')).toBe(false);
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

  it('重生致死仍算死亡：献祭推进、领主回复；不进弃牌、不离场', () => {
    let s = mkState({
      player: mkPlayer('player', {
        hand: [
          { id: 'portal', defId: 'spell-demon-portal' },
          { id: 'beast', defId: 'spell-hell-beast-ritual' },
        ],
        energy: 8,
        board: [mkMinion('sticky', 1, 1, { rebirth: 1, defId: 'token-demon-summon' })],
      }),
    });
    s.player.hero.hp = 20;
    s.player.board[0]!.maxHp = 3;
    s = playCard(s, { cardId: 'portal', position: 1 }).state;
    s = playCard(s, { cardId: 'beast', position: 2 }).state;
    const portal = s.player.board.find((m) => m.ritual?.ritualKey === 'demonPortal')!;
    const beast = s.player.board.find((m) => m.ritual?.ritualKey === 'hellBeast')!;

    const events: BattleEvent[] = [];
    const killed = damageMinion(s, 'player', 'sticky', 99, events);
    expect(killed).toBe(false);
    expect(events.some((e) => e.type === 'rebirth' && e.minionId === 'sticky')).toBe(true);
    expect(events.some((e) => e.type === 'death' && e.minionId === 'sticky')).toBe(false);

    const sticky = s.player.board.find((m) => m.id === 'sticky');
    expect(sticky).toBeDefined();
    expect(sticky!.hp).toBe(3);
    expect(sticky!.rebirth).toBe(0);
    expect(s.player.discard.some((c) => c.defId === 'token-demon-summon')).toBe(false);

    expect(portal.ritual!.sacrifice).toBe(1);
    expect(beast.ritual!.sacrifice).toBe(1);
    expect(s.player.hero.hp).toBe(22);

    // 第二次致死：无重生，真正离场并再计一次献祭
    const events2: BattleEvent[] = [];
    expect(damageMinion(s, 'player', 'sticky', 99, events2)).toBe(true);
    expect(events2.some((e) => e.type === 'death' && e.minionId === 'sticky')).toBe(true);
    expect(s.player.board.some((m) => m.id === 'sticky')).toBe(false);
    expect(s.player.discard.some((c) => c.defId === 'token-demon-summon')).toBe(true);
    expect(portal.ritual!.sacrifice).toBe(2);
    expect(beast.ritual!.sacrifice).toBe(2);
    expect(s.player.hero.hp).toBe(24);
  });
});
