import { describe, expect, it } from 'vitest';
import { CARD_DB } from '../data/index.ts';
import type { BattleEvent, BattleState, Minion, PlayerState } from '../engine/types.ts';
import { formatLog } from './formatLog.ts';

function makePlayer(side: 'player' | 'enemy', overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    side,
    hero: { side, attack: 2, hp: 30, maxHp: 30 },
    deck: [],
    hand: [],
    board: [],
    energy: 4,
    maxEnergy: 4,
    fatigueCount: 0,
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
    cardDb: CARD_DB,
    ...overrides,
  };
}

const guard: Minion = {
  id: 'm_guard',
  defId: 'minion-guard',
  attack: 1,
  hp: 4,
  maxHp: 4,
  size: 1,
  keywords: ['taunt'],
};

const striker: Minion = {
  id: 'm_striker',
  defId: 'minion-striker',
  attack: 3,
  hp: 3,
  maxHp: 3,
  size: 1,
  keywords: [],
};

describe('formatLog', () => {
  it('formats phase changes', () => {
    const s = makeState();
    expect(formatLog({ type: 'phaseChange', phase: 'enemyPlay' }, undefined, s)?.text).toBe(
      '—— 敌人出牌 ——',
    );
    expect(formatLog({ type: 'phaseChange', phase: 'playerPlay' }, undefined, s)?.text).toBe(
      '—— 你的回合 ——',
    );
    expect(formatLog({ type: 'phaseChange', phase: 'autoBattle' }, undefined, s)?.text).toBe(
      '—— 自动战斗 ——',
    );
  });

  it('silences energyReset, counter, draw, and drawSkipped', () => {
    const s = makeState({
      player: makePlayer('player', { deck: [{ id: 'c2', defId: 'minion-recruit' }] }),
    });
    expect(formatLog({ type: 'energyReset', side: 'player', value: 4 }, undefined, s)).toBeNull();
    expect(
      formatLog({ type: 'counter', unit: { kind: 'hero', side: 'player' }, damage: 2 }, undefined, s),
    ).toBeNull();
    expect(formatLog({ type: 'draw', side: 'player', cardId: 'c2' }, undefined, s)).toBeNull();
    expect(formatLog({ type: 'drawSkipped', side: 'enemy' }, undefined, s)).toBeNull();
  });

  it('formats fatigue / play / summon / heal / death / gameOver', () => {
    const view = makeState({
      player: makePlayer('player', {
        hand: [{ id: 'c1', defId: 'spell-firebolt' }],
        board: [guard],
      }),
      enemy: makePlayer('enemy', { board: [striker] }),
    });
    const auth = makeState({
      player: makePlayer('player', {
        board: [{ ...guard, id: 'm_new', defId: 'minion-guard' }],
      }),
    });

    expect(
      formatLog({ type: 'fatigue', side: 'player', damage: 2, generatedAttack: 1 }, undefined, view)
        ?.text,
    ).toBe('你疲劳：受到 2 点伤害，获得「疲劳突袭」（1 攻）');
    expect(
      formatLog(
        {
          type: 'playCard',
          side: 'player',
          cardId: 'c1',
          target: { kind: 'minion', side: 'enemy', id: 'm_striker' },
        },
        undefined,
        view,
      )?.text,
    ).toBe('你打出「火焰箭」，目标：敌人的「突击兵」');
    expect(
      formatLog({ type: 'summon', side: 'player', minionId: 'm_new', index: 0 }, undefined, view, auth)
        ?.text,
    ).toBe('你召唤了「铁壁守卫」');
    expect(
      formatLog(
        { type: 'heal', target: { kind: 'hero', side: 'player' }, amount: 3 },
        undefined,
        view,
      )?.text,
    ).toBe('你恢复 3 点生命');
    expect(
      formatLog({ type: 'death', side: 'enemy', minionId: 'm_striker' }, undefined, view)?.text,
    ).toBe('敌人的「突击兵」阵亡');
    expect(formatLog({ type: 'gameOver', winner: 'player' }, undefined, view)?.text).toBe(
      '你获胜！',
    );
  });

  it('merges attack + matching counter into one combat line', () => {
    const view = makeState({
      player: makePlayer('player', { board: [guard] }),
      enemy: makePlayer('enemy', { board: [striker] }),
    });
    const attack: BattleEvent = {
      type: 'attack',
      attacker: { kind: 'minion', side: 'player', id: 'm_guard' },
      target: { kind: 'minion', side: 'enemy', id: 'm_striker' },
      damage: 1,
    };
    const counter: BattleEvent = {
      type: 'counter',
      unit: { kind: 'minion', side: 'player', id: 'm_guard' },
      damage: 3,
    };
    expect(formatLog(attack, counter, view)?.text).toBe(
      '你的「铁壁守卫」 X 敌人的「突击兵」， 敌人的「突击兵」 -1HP，你的「铁壁守卫」 -3HP',
    );
  });

  it('formats attack without counter when none follows', () => {
    const view = makeState({
      player: makePlayer('player', { board: [guard] }),
    });
    const attack: BattleEvent = {
      type: 'attack',
      attacker: { kind: 'minion', side: 'player', id: 'm_guard' },
      target: { kind: 'hero', side: 'enemy' },
      damage: 1,
    };
    expect(formatLog(attack, undefined, view)?.text).toBe(
      '你的「铁壁守卫」 X 敌人， 敌人 -1HP',
    );
  });

  it('does not merge counter belonging to a different unit', () => {
    const view = makeState({
      player: makePlayer('player', { board: [guard] }),
      enemy: makePlayer('enemy', { board: [striker] }),
    });
    const attack: BattleEvent = {
      type: 'attack',
      attacker: { kind: 'minion', side: 'player', id: 'm_guard' },
      target: { kind: 'hero', side: 'enemy' },
      damage: 1,
    };
    const unrelated: BattleEvent = {
      type: 'counter',
      unit: { kind: 'minion', side: 'enemy', id: 'm_striker' },
      damage: 2,
    };
    expect(formatLog(attack, unrelated, view)?.text).toBe(
      '你的「铁壁守卫」 X 敌人， 敌人 -1HP',
    );
  });
});
