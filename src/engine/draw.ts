// M2：抽牌 / 能量 / 疲劳。
// 见 docs/battle-design.md §3、§4 与 docs/implementation-plan.md §2。

import { FATIGUE_STRIKE_DEF_ID } from '../data/index.ts';
import { damageHero, isEnded, sideState } from './helpers.ts';
import type { BattleEvent, BattleState, Side } from './types.ts';
import { FIRST_TURN_DRAW, MAX_HAND_SIZE, PER_TURN_DRAW } from './types.ts';

// 单次抽牌（就地修改状态）。规则：
// - 卡组非空且手牌未满：从顶部抽 1 张进手牌，推 draw 事件。
// - 卡组非空但手牌已满（10）：跳过该次抽牌，卡组不变，推 drawSkipped 事件。
// - 卡组已空：触发疲劳——角色固定受 2 伤 + 生成 1 张攻击力递增的直接攻击卡。
export function drawOne(state: BattleState, side: Side, events: BattleEvent[]): void {
  if (isEnded(state)) return;
  const ps = sideState(state, side);

  if (ps.deck.length === 0) {
    ps.fatigueCount += 1;
    const damage = 2;
    const generatedAttack = ps.fatigueCount;
    events.push({ type: 'fatigue', side, damage, generatedAttack });
    if (ps.hand.length < MAX_HAND_SIZE) {
      ps.hand.push({
        id: `fatigue-${side}-${ps.fatigueCount}`,
        defId: FATIGUE_STRIKE_DEF_ID,
        overrideDamage: generatedAttack,
      });
    }
    damageHero(state, side, damage, events);
    return;
  }

  if (ps.hand.length >= MAX_HAND_SIZE) {
    // 手牌已满：跳过该次抽牌（不从卡组移除，也不额外补抽）。
    events.push({ type: 'drawSkipped', side });
    return;
  }

  const card = ps.deck.shift()!;
  ps.hand.push(card);
  events.push({ type: 'draw', side, cardId: card.id });
}

// 回合开始处理：能量重置为该方 maxEnergy，重置技能使用标记，随后抽牌（首回合 5 张，之后 2 张）。
export function beginTurn(state: BattleState, side: Side, events: BattleEvent[]): void {
  if (isEnded(state)) return;
  const ps = sideState(state, side);
  ps.energy = ps.maxEnergy;
  ps.hero.skillUsedThisTurn = false;
  events.push({ type: 'energyReset', side, value: ps.maxEnergy });

  const drawCount = state.turn === 1 ? FIRST_TURN_DRAW : PER_TURN_DRAW;
  for (let i = 0; i < drawCount; i += 1) {
    if (isEnded(state)) break;
    drawOne(state, side, events);
  }
}
