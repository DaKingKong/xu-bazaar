import { describe, expect, it } from 'vitest';
import { BOARD_CAPACITY, MAX_ENERGY, MAX_HAND_SIZE } from './types.ts';
import type { BattleState, CardDef } from './types.ts';

// M1 骨架测试：仅验证核心常量与类型可用。
// 具体规则测试将在后续里程碑补充（见 docs/implementation-plan.md §2）。
describe('engine core constants', () => {
  it('matches the battle design spec', () => {
    expect(MAX_ENERGY).toBe(4);
    expect(MAX_HAND_SIZE).toBe(10);
    expect(BOARD_CAPACITY).toBe(9);
  });

  it('allows constructing a well-typed card definition', () => {
    const tauntMinion: CardDef = {
      defId: 'demo-taunt',
      name: '守卫',
      type: 'minion',
      cost: 2,
      description: '一个带嘲讽的示例仆从。',
      minion: { name: '守卫', attack: 1, hp: 4, size: 1, keywords: ['taunt'] },
    };

    expect(tauntMinion.minion?.keywords).toContain('taunt');
  });

  it('allows constructing a well-typed battle state shape', () => {
    const state: Pick<BattleState, 'turn' | 'phase' | 'activeSide'> = {
      turn: 1,
      phase: 'playerPlay',
      activeSide: 'player',
    };

    expect(state.turn).toBe(1);
  });
});
