import { describe, expect, it } from 'vitest';
import { applyViewCombatDamage } from './viewCombatDamage.ts';

describe('applyViewCombatDamage', () => {
  it('护盾优先于生命：未破盾不掉血', () => {
    const m = { hp: 5, shield: 4 };
    applyViewCombatDamage(m, 3);
    expect(m.shield).toBe(1);
    expect(m.hp).toBe(5);
  });

  it('护盾溢出后才扣生命', () => {
    const m = { hp: 5, shield: 2 };
    applyViewCombatDamage(m, 5);
    expect(m.shield).toBe(0);
    expect(m.hp).toBe(2);
  });

  it('无护盾时直接扣生命', () => {
    const m = { hp: 5 };
    applyViewCombatDamage(m, 3);
    expect(m.hp).toBe(2);
  });
});
