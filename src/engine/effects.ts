// 词条效果结算：条件类（如击杀）触发后执行效果类（如抽取）。

import { drawOne } from './draw.ts';
import type { BattleEvent, BattleState, EffectKeyword, Side, TriggeredEffect, TriggerKeyword } from './types.ts';

function applyEffect(state: BattleState, side: Side, effect: EffectKeyword, events: BattleEvent[]): void {
  switch (effect.type) {
    case 'draw':
      for (let i = 0; i < effect.amount; i += 1) {
        drawOne(state, side, events);
      }
      break;
  }
}

/** 结算某次触发条件对应的全部词条效果。 */
export function resolveTriggered(
  state: BattleState,
  side: Side,
  triggered: TriggeredEffect[] | undefined,
  trigger: TriggerKeyword,
  events: BattleEvent[],
): void {
  if (!triggered) return;
  for (const clause of triggered) {
    if (clause.trigger !== trigger) continue;
    for (const effect of clause.effects) {
      applyEffect(state, side, effect, events);
    }
  }
}
