import { describe, expect, it } from 'vitest';
import { CARD_DB, DUMMY_HERO_ID, HELL_WARLOCK_ID, HERO_DB } from '../data/index.ts';
import type { BattleState, Minion, PlayerState } from '../engine/types.ts';
import { formatLog } from './formatLog.ts';

function makePlayer(side: 'player' | 'enemy', overrides: Partial<PlayerState> = {}): PlayerState {
  const defId = side === 'player' ? HELL_WARLOCK_ID : DUMMY_HERO_ID;
  const def = HERO_DB[defId]!;
  return {
    side,
    hero: {
      side,
      defId,
      name: def.name,
      attack: 2,
      hp: 30,
      maxHp: 30,
    },
    deck: [],
    hand: [],
    board: [],
    discard: [],
    energy: 4,
    maxEnergy: 4,
    fatigueCount: 0,
    rituals: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<BattleState> = {}): BattleState {
  return {
    turn: 1,
    activeSide: 'player',
    phase: 'playerPlay',
    player: makePlayer('player'),
    enemy: makePlayer('enemy'),
    hell: { intensity: 0 },
    cardDb: CARD_DB,
    heroDb: HERO_DB,
    ...overrides,
  };
}

const guard: Minion = {
  id: 'm_guard',
  defId: 'minion-golem-guard',
  attack: 2,
  hp: 10,
  maxHp: 10,
  size: 2,
  keywords: ['taunt'],
  tags: ['large'],
};

const flame: Minion = {
  id: 'm_flame',
  defId: 'minion-flame',
  attack: 3,
  hp: 1,
  maxHp: 1,
  size: 1,
  keywords: [],
  tags: [],
};

describe('formatLog', () => {
  it('formats phase changes', () => {
    const s = makeState();
    expect(formatLog({ type: 'phaseChange', phase: 'enemyPlay' }, undefined, s)?.text).toBe(
      '—— 敌人出牌 ——',
    );
  });

  it('formats fatigue as 血战', () => {
    const view = makeState();
    expect(
      formatLog({ type: 'fatigue', side: 'player', damage: 2, generatedAttack: 1 }, undefined, view)
        ?.text,
    ).toBe('你疲劳：受到 2 点伤害，获得「血战」（1 攻）');
  });

  it('formats play / summon with catalog names', () => {
    const view = makeState({
      player: makePlayer('player', {
        hand: [{ id: 'c1', defId: 'spell-fireball' }],
        board: [guard],
      }),
      enemy: makePlayer('enemy', { board: [flame] }),
    });
    const auth = makeState({
      player: makePlayer('player', {
        board: [{ ...guard, id: 'm_new' }],
      }),
    });

    expect(
      formatLog(
        {
          type: 'playCard',
          side: 'player',
          cardId: 'c1',
          target: { kind: 'minion', side: 'enemy', id: 'm_flame' },
        },
        undefined,
        view,
      )?.text,
    ).toBe('你打出「火球术」，目标：敌人的「火焰人」');
    expect(
      formatLog({ type: 'summon', side: 'player', minionId: 'm_new', index: 0 }, undefined, view, auth)
        ?.text,
    ).toBe('你召唤了「石像守卫」');
  });
});
