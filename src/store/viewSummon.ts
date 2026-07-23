import type { BattleState, CardDef, Minion, Side } from '../engine/types.ts';
import { normalizeBoardOrder } from '../engine/index.ts';

/** 展示层召唤：优先用权威快照；若单位已在终局被移除，则按 defId 重建以便播放可见。 */
export function applyViewSummon(
  view: BattleState,
  authoritative: BattleState,
  ev: { side: Side; minionId: string; index: number; defId?: string },
): void {
  const ps = view[ev.side];
  if (ps.board.some((m) => m.id === ev.minionId)) return;

  const authUnit = authoritative[ev.side].board.find((m) => m.id === ev.minionId);
  const index = Math.max(0, Math.min(ev.index, ps.board.length));

  if (authUnit) {
    ps.board.splice(index, 0, structuredClone(authUnit));
  } else if (ev.defId) {
    const built = minionFromDef(view.cardDb[ev.defId], ev.minionId);
    if (built) ps.board.splice(index, 0, built);
  } else {
    return;
  }
  ps.board = normalizeBoardOrder(ps.board);
}

function minionFromDef(def: CardDef | undefined, instanceId: string): Minion | null {
  if (!def?.minion) return null;
  const md = def.minion;
  return {
    id: instanceId,
    defId: def.defId,
    attack: md.attack,
    hp: md.hp,
    maxHp: md.hp,
    size: md.size,
    keywords: [...md.keywords],
    tags: [...(md.tags ?? [])],
  };
}
