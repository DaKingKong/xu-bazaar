// M4：敌人 AI。
// 见 docs/battle-design.md §7。
//
// 策略：先随机生成一个能把能量「尽量用光」的出牌组合（能恰好用光优先，否则
// 尽量多消耗），再依次打出，出指向性卡时自选合法目标。

import { boardUsage, otherSide, sideState } from './helpers.ts';
import { legalTargets, playCard } from './play.ts';
import { pick } from './rng.ts';
import type {
  BattleResult,
  BattleState,
  CardInstance,
  PlayCardAction,
  Rng,
  Side,
  TargetRef,
} from './types.ts';
import { BOARD_CAPACITY } from './types.ts';

// 在手牌中搜索使能量消耗最大化的组合（子集）。
// 返回被选中的手牌实例（保持手牌原有顺序）。若无可打出的卡则返回空数组。
export function chooseCombo(
  hand: CardInstance[],
  cardDb: BattleState['cardDb'],
  energy: number,
  rng: Rng,
): CardInstance[] {
  const playable = hand.filter((c) => {
    const def = cardDb[c.defId];
    return def && def.cost <= energy;
  });
  const n = playable.length;
  if (n === 0) return [];

  // 枚举全部子集（手牌规模小，2^n 可接受），收集每个可负担子集的总消耗。
  let best = 0;
  const byCost: number[][] = []; // cost -> 若干子集（用下标位掩码表示）
  for (let mask = 1; mask < 1 << n; mask += 1) {
    let cost = 0;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) cost += cardDb[playable[i].defId].cost;
    }
    if (cost > energy) continue;
    (byCost[cost] ??= []).push(mask);
    if (cost > best) best = cost;
  }
  if (best === 0) return [];

  // 能恰好用光（== energy）优先，否则取消耗最大的一档。
  const targetCost = byCost[energy]?.length ? energy : best;
  const candidates = byCost[targetCost];
  const chosenMask = pick(rng, candidates);

  const combo: CardInstance[] = [];
  for (let i = 0; i < n; i += 1) {
    if (chosenMask & (1 << i)) combo.push(playable[i]);
  }
  return combo;
}

// 为一张指向性卡挑选一个合法目标（AI 视角，倾向于打击对手 / 治疗自己）。
function chooseTarget(
  state: BattleState,
  side: Side,
  cardInstance: CardInstance,
): TargetRef | undefined {
  const def = state.cardDb[cardInstance.defId];
  if (!def.targeting?.needsTarget) return undefined;
  const legal = legalTargets(state, side, def);
  if (legal.length === 0) return undefined;

  const opp = otherSide(side);

  if (def.heal != null) {
    // 治疗：优先治疗自己的角色。
    return legal.find((t) => t.kind === 'hero' && t.side === side) ?? legal[0];
  }

  // 伤害/直接攻击卡：优先打脸（对手角色），否则打嘲讽/任意敌方仆从。
  const oppBoard = sideState(state, opp).board;
  const heroTarget = legal.find((t) => t.kind === 'hero' && t.side === opp);
  if (heroTarget && (!def.targeting.respectTaunt || oppBoard.length === 0)) {
    return heroTarget;
  }
  const oppMinion = legal.find((t) => t.kind === 'minion' && t.side === opp);
  return oppMinion ?? legal[0];
}

// 为一张仆从卡选择插入位置：默认放到最右侧（不影响规则，UI 仅表现）。
function choosePosition(state: BattleState, side: Side): number {
  return sideState(state, side).board.length;
}

// 执行敌人出牌阶段的完整出牌（在已克隆的状态上）。
export function runAiPlays(state: BattleState, rng: Rng): BattleResult {
  let s = state;
  const events: BattleResult['events'] = [];
  const side = s.activeSide;

  // 逐张打出：组合基于初始手牌选定，但每次出牌后重新校验可行性
  // （能量已在组合内保证；仆从卡需检查场地容量）。
  const combo = chooseCombo(sideState(s, side).hand, s.cardDb, sideState(s, side).energy, rng);

  for (const card of combo) {
    const ps = sideState(s, side);
    if (!ps.hand.some((c) => c.id === card.id)) continue;
    const def = s.cardDb[card.defId];
    if (ps.energy < def.cost) continue;
    if (def.type === 'minion') {
      const md = def.minion!;
      if (boardUsage(ps.board) + md.size > BOARD_CAPACITY) continue;
    }
    const action: PlayCardAction = {
      cardId: card.id,
      target: chooseTarget(s, side, card),
      position: def.type === 'minion' ? choosePosition(s, side) : undefined,
    };
    const res = playCard(s, action, rng);
    s = res.state;
    events.push(...res.events);
    if (s.phase === 'ended') break;
  }

  return { state: s, events };
}
