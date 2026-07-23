// M4：敌人 AI — 尽量用光能量；新卡仅要求合法目标（可笨）。

import { boardUsage, otherSide, sideState } from './helpers.ts';
import { legalDiscardTargets, legalTargets, playCard } from './play.ts';
import { isRitualSpell } from './resolve.ts';
import { pick } from './rng.ts';
import type {
  BattleResult,
  BattleState,
  CardDef,
  CardInstance,
  PlayCardAction,
  Rng,
  Side,
  TargetRef,
} from './types.ts';
import { BOARD_CAPACITY, RITUAL_DEFS } from './types.ts';

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

  let best = 0;
  const byCost: number[][] = [];
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

  const targetCost = byCost[energy]?.length ? energy : best;
  const candidates = byCost[targetCost];
  const chosenMask = pick(rng, candidates);

  const combo: CardInstance[] = [];
  for (let i = 0; i < n; i += 1) {
    if (chosenMask & (1 << i)) combo.push(playable[i]);
  }
  return combo;
}

function chooseTarget(
  state: BattleState,
  side: Side,
  def: CardDef,
): TargetRef | undefined {
  if (!def.targeting?.needsTarget) return undefined;
  const legal = legalTargets(state, side, def);
  if (legal.length === 0) return undefined;

  const opp = otherSide(side);

  if (def.effects?.some((e) => e.type === 'heal' || e.type === 'shield' || e.type === 'grantMultiAttack' || e.type === 'grantSplash') || def.heal != null) {
    return (
      legal.find((t) => t.kind === 'minion' && t.side === side) ??
      legal.find((t) => t.kind === 'hero' && t.side === side) ??
      legal[0]
    );
  }

  if (def.effects?.some((e) => e.type === 'destroyTarget')) {
    return legal.find((t) => t.kind === 'minion' && t.side === side) ?? legal[0];
  }

  const oppBoard = sideState(state, opp).board;
  const heroTarget = legal.find((t) => t.kind === 'hero' && t.side === opp);
  if (heroTarget && (!def.targeting.respectTaunt || oppBoard.length === 0)) {
    return heroTarget;
  }
  const oppMinion = legal.find((t) => t.kind === 'minion' && t.side === opp);
  return oppMinion ?? legal[0];
}

function chooseDiscard(
  state: BattleState,
  side: Side,
  playingCardId: string,
  rng: Rng,
): string | undefined {
  const legal = legalDiscardTargets(state, side, playingCardId);
  if (legal.length === 0) return undefined;
  // 优先高费
  const sorted = [...legal].sort(
    (a, b) => (state.cardDb[b.defId]?.cost ?? 0) - (state.cardDb[a.defId]?.cost ?? 0),
  );
  return (sorted[0] ?? pick(rng, legal)).id;
}

function ritualSize(def: CardDef): number {
  const effect = def.effects?.find((e) => e.type === 'ritual');
  if (!effect || effect.type !== 'ritual') return 1;
  return RITUAL_DEFS[effect.ritualKey].size;
}

function canPlayNow(state: BattleState, side: Side, card: CardInstance): boolean {
  const def = state.cardDb[card.defId];
  if (!def) return false;
  const ps = sideState(state, side);
  if (ps.energy < def.cost) return false;
  if (def.type === 'minion') {
    if (boardUsage(ps.board) + (def.minion?.size ?? 1) > BOARD_CAPACITY) return false;
  }
  if (isRitualSpell(def)) {
    if (boardUsage(ps.board) + ritualSize(def) > BOARD_CAPACITY) return false;
  }
  if (def.targeting?.needsTarget) {
    if (legalTargets(state, side, def).length === 0) return false;
  }
  if (def.targeting?.needsDiscard) {
    if (legalDiscardTargets(state, side, card.id).length === 0) return false;
  }
  return true;
}

function buildAction(
  state: BattleState,
  side: Side,
  card: CardInstance,
  rng: Rng,
): PlayCardAction | null {
  const def = state.cardDb[card.defId];
  if (!canPlayNow(state, side, card)) return null;

  const needsPosition = def.type === 'minion' || isRitualSpell(def);
  const action: PlayCardAction = {
    cardId: card.id,
    position: needsPosition ? sideState(state, side).board.length : undefined,
  };

  if (def.targeting?.needsDiscard) {
    const discardCardId = chooseDiscard(state, side, card.id, rng);
    if (!discardCardId) return null;
    action.discardCardId = discardCardId;
    const chosenDef = state.cardDb[sideState(state, side).discard.find((c) => c.id === discardCardId)!.defId];
    if (chosenDef?.targeting?.needsTarget) {
      const t = chooseTarget(state, side, chosenDef);
      if (!t) return null;
      action.target = t;
    }
  } else if (def.targeting?.needsTarget) {
    const t = chooseTarget(state, side, def);
    if (!t) return null;
    action.target = t;
  }

  return action;
}

export function runAiPlays(state: BattleState, rng: Rng): BattleResult {
  let s = state;
  const events: BattleResult['events'] = [];
  const side = s.activeSide;

  const combo = chooseCombo(sideState(s, side).hand, s.cardDb, sideState(s, side).energy, rng);

  for (const card of combo) {
    const ps = sideState(s, side);
    if (!ps.hand.some((c) => c.id === card.id)) continue;
    const action = buildAction(s, side, card, rng);
    if (!action) continue;
    try {
      const res = playCard(s, action, rng);
      s = res.state;
      events.push(...res.events);
    } catch {
      // 跳过无法合法打出的卡
      continue;
    }
    if (s.phase === 'ended') break;
  }

  return { state: s, events };
}
