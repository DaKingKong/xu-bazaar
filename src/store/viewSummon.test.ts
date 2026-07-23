import { describe, expect, it } from 'vitest';
import { CARD_DB, DUMMY_HERO_ID, HELL_WARLOCK_ID, HERO_DB } from '../data/index.ts';
import type { BattleState, Minion } from '../engine/types.ts';
import { applyViewSummon } from './viewSummon.ts';

function mkMinion(id: string, defId: string, extras: Partial<Minion> = {}): Minion {
  const md = CARD_DB[defId]?.minion;
  if (!md) {
    return {
      id,
      defId,
      attack: 0,
      hp: 5,
      maxHp: 5,
      size: 1,
      keywords: [],
      tags: [],
      ...extras,
    };
  }
  return {
    id,
    defId,
    attack: md.attack,
    hp: md.hp,
    maxHp: md.hp,
    size: md.size,
    keywords: [...md.keywords],
    tags: [...(md.tags ?? [])],
    ...extras,
  };
}

function emptyBattle(board: Minion[]): BattleState {
  const side = (s: 'player' | 'enemy', b: Minion[]) => ({
    side: s,
    hero: {
      side: s,
      defId: s === 'player' ? HELL_WARLOCK_ID : DUMMY_HERO_ID,
      name: HERO_DB[s === 'player' ? HELL_WARLOCK_ID : DUMMY_HERO_ID]!.name,
      attack: 0,
      hp: 30,
      maxHp: 30,
      skillUsedThisTurn: false,
    },
    deck: [],
    hand: [],
    board: b,
    discard: [],
    energy: 4,
    maxEnergy: 4,
    fatigueCount: 0,
  });
  return {
    turn: 1,
    activeSide: 'player',
    phase: 'playerPlay',
    player: side('player', board),
    enemy: side('enemy', []),
    winner: null,
    hell: { intensity: 0 },
    cardDb: CARD_DB,
    heroDb: HERO_DB,
    nextEntitySeq: 0,
  };
}

describe('applyViewSummon', () => {
  it('终局权威已无该单位时，仍能按 defId 在播放中显示召唤物', () => {
    const portal = mkMinion('ritual_p', 'spell-demon-portal', {
      ritual: { ritualKey: 'demonPortal', sacrifice: 0 },
      hp: 4,
      maxHp: 5,
      attack: 0,
    });
    const view = emptyBattle([portal]);
    // 权威终局：小恶魔已被后续伤害打死，只剩传送门
    const auth = emptyBattle([structuredClone(portal)]);

    applyViewSummon(view, auth, {
      side: 'player',
      minionId: 'm_imp',
      index: 0,
      defId: 'token-imp-portal',
    });

    expect(view.player.board.map((m) => m.defId)).toEqual([
      'token-imp-portal',
      'spell-demon-portal',
    ]);
    expect(view.player.board[0]!.id).toBe('m_imp');
  });

  it('权威仍有该单位时，用权威快照插入并保持仪式在右', () => {
    const portal = mkMinion('ritual_p', 'spell-demon-portal', {
      ritual: { ritualKey: 'demonPortal', sacrifice: 0 },
      hp: 4,
      maxHp: 5,
      attack: 0,
    });
    const imp = mkMinion('m_imp', 'token-imp-portal', { hp: 1 });
    const view = emptyBattle([portal]);
    const auth = emptyBattle([imp, portal]);

    applyViewSummon(view, auth, {
      side: 'player',
      minionId: 'm_imp',
      index: 0,
      defId: 'token-imp-portal',
    });

    expect(view.player.board.map((m) => m.id)).toEqual(['m_imp', 'ritual_p']);
  });
});
