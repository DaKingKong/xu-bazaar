import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, Reorder, motion } from 'framer-motion';
import type { Transition } from 'framer-motion';
import { useBattleStore } from '../store/battleStore.ts';
import type { CombatAnim, FloaterState, LogEntry } from '../store/battleStore.ts';
import { heroSkillDef, legalTargets } from '../engine/index.ts';
import type {
  BattleState,
  CardDef,
  CardInstance,
  Minion,
  Side,
  SkillDef,
  TargetRef,
} from '../engine/types.ts';
import { MAX_ENERGY } from '../engine/types.ts';
import './App.css';


// --- 战斗日志（左侧中栏，可展开/收起；见 docs/battle-log.md）---
function BattleLogPanel({ log }: { log: LogEntry[] }) {
  const [expanded, setExpanded] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const latestId = log.length > 0 ? log[log.length - 1]!.id : null;

  useEffect(() => {
    if (!expanded) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, expanded]);

  return (
    <aside
      className={`battle-log${expanded ? '' : ' battle-log--collapsed'}`}
      aria-label="战斗日志"
    >
      <button
        type="button"
        className="battle-log__toggle"
        aria-expanded={expanded}
        aria-controls="battle-log-list"
        aria-label={expanded ? '收起战斗日志' : '展开战斗日志'}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? '‹' : '›'}
        {!expanded && <span className="battle-log__toggle-label">日志</span>}
      </button>
      <div
        id="battle-log-list"
        ref={listRef}
        className="battle-log__list"
        hidden={!expanded}
        aria-live="polite"
        aria-relevant="additions"
      >
        {log.length === 0 && <div className="battle-log__empty">尚无记录</div>}
        {log.map((e) => (
          <div
            key={e.id}
            className={[
              'battle-log__entry',
              `battle-log__entry--${e.kind}`,
              e.side ? `battle-log__entry--${e.side}` : '',
              e.id === latestId ? 'battle-log__entry--latest' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {e.text}
          </div>
        ))}
      </div>
    </aside>
  );
}

function targetsEqual(a: TargetRef, b: TargetRef): boolean {
  if (a.kind !== b.kind || a.side !== b.side) return false;
  if (a.kind === 'minion' && b.kind === 'minion') return a.id === b.id;
  return true;
}

// 命中动画：攻击方与受击方共用同一套「后退蓄力 → 朝对方突进 → 回位」位移。
// 双方各按自己所在 side 决定方向（玩家在下朝上，敌人在上朝下），天然对冲相撞。
const LUNGE_DISTANCE = 34;
const RETREAT_DISTANCE = 12;

// 朝对方的方向：玩家在下 → 负 y（向上冲）；敌人在上 → 正 y（向下冲）。
const towardOpponent = (side: Side): number => (side === 'player' ? -1 : 1);

// 关键帧：[静止, 后退蓄力, 突进到位, 回位]；后退与突进方向相反，突进朝对方。
const lungeKeyframes = (side: Side): number[] => {
  const dir = towardOpponent(side);
  return [0, -dir * RETREAT_DISTANCE, dir * LUNGE_DISTANCE, 0];
};

const COMBAT_TRANSITION: Transition = {
  duration: 0.8,
  // 突进峰值约在 60% 处，与 store 事件触发即扣血的时机大致对齐（视觉上突进即命中）。
  ease: ['easeOut', 'easeIn', 'easeIn'],
  times: [0, 0.25, 0.6, 1],
};

// 角色不参与自动战斗攻击（不进入攻击队列），受击时只做「放大再缩小回位」反应，绝不前冲。
const HERO_HIT_SCALE = [1, 1.2, 1];

const HIT_TRANSITION: Transition = {
  duration: 0.64,
  ease: ['easeOut', 'easeIn'],
  times: [0, 0.45, 1],
};

// 飘字：受到伤害时在实体上方飘出「-N HP」。锚定在实体（.frame）内部，随其移动。
function DamageFloaters({ match }: { match: (f: FloaterState) => boolean }) {
  const floaters = useBattleStore((s) => s.floaters);
  const clearFloater = useBattleStore((s) => s.clearFloater);
  const mine = floaters.filter(match);
  if (mine.length === 0) return null;
  return (
    <span className="damage-floaters" aria-hidden>
      {mine.map((f) => (
        <motion.span
          key={f.id}
          className="damage-floater"
          initial={{ opacity: 0, y: 4, scale: 0.7 }}
          animate={{ opacity: [0, 1, 1, 0], y: -42, scale: 1 }}
          transition={{ duration: 1.6, times: [0, 0.15, 0.7, 1], ease: 'easeOut' }}
          onAnimationComplete={() => clearFloater(f.id)}
        >
          -{f.amount}HP
        </motion.span>
      ))}
    </span>
  );
}

// --- 角色区（含遗物占位；技能可交互；牌库在战场角落，见 scene）---
function HeroArea({
  view,
  side,
  selectable,
  anim,
  skillInteractive,
  skillPending,
  onSelect,
  onSkillClick,
}: {
  view: BattleState;
  side: Side;
  selectable: boolean;
  anim: CombatAnim | null;
  skillInteractive: boolean;
  skillPending: boolean;
  onSelect: (ref: TargetRef) => void;
  onSkillClick: () => void;
}) {
  const ps = side === 'player' ? view.player : view.enemy;
  const skill = heroSkillDef(view, side);
  const relics = ps.hero.relics ?? [];
  // 角色永远不是自动战斗的攻击方（只有仆从会攻击）；仅在受击时做后退受创反应。
  const isHit = anim?.target?.kind === 'hero' && anim.target.side === side;
  const skillDisabled =
    !skillInteractive ||
    !skill ||
    ps.energy < skill.cost ||
    !!ps.hero.skillUsedThisTurn;
  return (
    <div className={`hero-area hero-area--${side}`}>
      {/* 遗物列表（第一版占位）：无遗物则不显示 */}
      {relics.length > 0 && (
        <div className="relics" aria-label="遗物列表">
          {relics.map((r, i) => (
            <span key={i} className="relic" title={r} />
          ))}
        </div>
      )}

      <motion.button
        type="button"
        className={`hero frame${selectable ? ' frame--selectable' : ''}`}
        disabled={!selectable}
        onClick={() => onSelect({ kind: 'hero', side })}
        animate={{ scale: isHit ? HERO_HIT_SCALE : 1 }}
        transition={isHit ? HIT_TRANSITION : { duration: 0.2 }}
      >
        <span className="hero__label">{ps.hero.name}</span>
        <span className="hero__avatar" aria-hidden />
        <span className="badge badge--atk stat stat--atk">{ps.hero.attack}</span>
        <span className="badge badge--hp stat stat--hp">{ps.hero.hp}</span>
        {/* 装备槽（第一版占位）：位于框左边线居中 */}
        <span className="badge badge--equip placeholder" title="装备槽（占位）" aria-hidden />
        <DamageFloaters
          match={(f) => f.ref.kind === 'hero' && f.ref.side === side}
        />
      </motion.button>

      {skill && (
        <button
          type="button"
          className={`skill${skillPending ? ' skill--pending' : ''}${skillDisabled ? ' skill--disabled' : ''}`}
          disabled={skillDisabled && !skillPending}
          title={`${skill.name}（${skill.cost} 费）\n${skill.description}`}
          aria-label={`${skill.name}：${skill.description}`}
          onClick={onSkillClick}
        >
          <span className="skill__cost">{skill.cost}</span>
          <span className="skill__name">{skill.name}</span>
        </button>
      )}
    </div>
  );
}

// 仆从内容（立绘/属性/关键字），供普通与可拖拽两种容器复用。
function MinionInner({ view, minion }: { view: BattleState; minion: Minion }) {
  const def = view.cardDb[minion.defId];
  return (
    <>
      <span className="minion__name">{def?.name ?? minion.defId}</span>
      <span className="badge badge--atk stat stat--atk">{minion.attack}</span>
      <span className="badge badge--hp stat stat--hp">{minion.hp}</span>
      {(minion.shield ?? 0) > 0 && (
        <span className="badge badge--shield" title="护盾">
          盾{minion.shield}
        </span>
      )}
      {(minion.armor ?? 0) > 0 && (
        <span className="badge badge--armor" title="装甲">
          甲{minion.armor}
        </span>
      )}
      {minion.keywords.includes('taunt') && <span className="badge badge--taunt">嘲讽</span>}
    </>
  );
}

const RITUAL_LABEL: Record<string, string> = {
  demonPortal: '传送门',
  hellBeast: '地狱兽',
};

function FieldStrip({ view }: { view: BattleState }) {
  const rituals = [
    ...view.player.rituals.map((r) => ({ ...r, owner: '我' as const })),
    ...view.enemy.rituals.map((r) => ({ ...r, owner: '敌' as const })),
  ];
  return (
    <div className="field-strip" aria-label="场地与仪式">
      <div
        className={`field-chip field-chip--hell${view.hell.intensity > 0 ? ' field-chip--active' : ''}`}
        title="全局地狱场地"
      >
        {view.hell.intensity > 0 ? `地狱×${view.hell.intensity}` : '场地'}
      </div>
      {rituals.map((r) => (
        <div
          key={r.id}
          className={`field-chip field-chip--ritual field-chip--${r.owner === '我' ? 'player' : 'enemy'}`}
          title={`${r.owner}方仪式`}
        >
          <span className="field-chip__owner">{r.owner}</span>
          <span className="field-chip__name">{RITUAL_LABEL[r.ritualKey] ?? r.ritualKey}</span>
          <span className="field-chip__sac">{r.sacrifice}</span>
        </div>
      ))}
    </div>
  );
}

function minionClass(minion: Minion, extra: Record<string, boolean>): string {
  return [
    'minion',
    'frame',
    minion.size === 2 ? 'minion--large' : '',
    minion.keywords.includes('taunt') ? 'minion--taunt' : '',
    ...Object.entries(extra)
      .filter(([, on]) => on)
      .map(([cls]) => cls),
  ]
    .filter(Boolean)
    .join(' ');
}

// --- 单个仆从（非拖拽态：用于敌方仆从、选目标/自动战斗展示）---
function MinionView({
  view,
  minion,
  side,
  selectable,
  anim,
  onSelect,
}: {
  view: BattleState;
  minion: Minion;
  side: Side;
  selectable: boolean;
  anim: CombatAnim | null;
  onSelect: (ref: TargetRef) => void;
}) {
  const isAttacker =
    anim?.attacker?.kind === 'minion' &&
    anim.attacker.side === side &&
    anim.attacker.id === minion.id;
  const isTarget =
    anim?.target?.kind === 'minion' && anim.target.side === side && anim.target.id === minion.id;
  const inCombat = isAttacker || isTarget;
  return (
    <motion.button
      type="button"
      layout
      disabled={!selectable}
      onClick={() => onSelect({ kind: 'minion', side, id: minion.id })}
      className={minionClass(minion, { 'frame--selectable': selectable })}
      initial={{ opacity: 0, scale: 0.6, y: side === 'enemy' ? -20 : 20 }}
      animate={{
        opacity: 1,
        scale: 1,
        // 攻击方与受击方共用同款位移，各按自己 side 朝对方突进，天然对冲。
        y: inCombat ? lungeKeyframes(side) : 0,
      }}
      exit={{ opacity: 0, scale: 0.4, y: side === 'enemy' ? -20 : 20 }}
      transition={inCombat ? COMBAT_TRANSITION : { type: 'spring', stiffness: 500, damping: 30 }}
    >
      <MinionInner view={view} minion={minion} />
      <DamageFloaters
        match={(f) => f.ref.kind === 'minion' && f.ref.side === side && f.ref.id === minion.id}
      />
    </motion.button>
  );
}

// --- 可拖拽的玩家仆从（玩家阶段重排）---
function DraggableMinion({ view, minion }: { view: BattleState; minion: Minion }) {
  return (
    <Reorder.Item
      value={minion}
      layout
      className={minionClass(minion, { 'minion--draggable': true })}
      initial={{ opacity: 0, scale: 0.6, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.4, y: 20 }}
      whileDrag={{ scale: 1.08, zIndex: 5 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      <MinionInner view={view} minion={minion} />
    </Reorder.Item>
  );
}

// --- 手牌卡 ---
function HandCard({
  view,
  card,
  disabled,
  active,
  onClick,
}: {
  view: BattleState;
  card: CardInstance;
  disabled: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const def = view.cardDb[card.defId];
  const affordable = view.player.energy >= (def?.cost ?? 0);
  const damage = card.overrideDamage ?? def?.damage;
  return (
    <motion.button
      type="button"
      layout
      disabled={disabled || !affordable}
      onClick={onClick}
      className={[
        'card',
        `card--${def?.type ?? 'unknown'}`,
        active ? 'card--active' : '',
        !affordable ? 'card--unaffordable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40, scale: 0.7 }}
      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
      whileHover={!disabled && affordable ? { y: -10 } : undefined}
    >
      <span className="card__cost">{def?.cost ?? 0}</span>
      <span className="card__name">{def?.name ?? card.defId}</span>
      {def?.type === 'minion' && def.minion && (
        <span className="card__stats">
          <span className="stat stat--atk">{def.minion.attack}</span>
          <span className="stat stat--hp">{def.minion.hp}</span>
        </span>
      )}
      {def?.type !== 'minion' && (
        <span className="card__effect">
          {def?.heal != null ? `治疗 ${def.heal}` : damage != null ? `伤害 ${damage}` : ''}
        </span>
      )}
      <span className="card__desc">{def?.description}</span>
    </motion.button>
  );
}

function EnergyPips({ energy }: { energy: number }) {
  return (
    <span className="energy">
      {Array.from({ length: MAX_ENERGY }, (_, i) => (
        <span key={i} className={`energy__pip${i < energy ? ' energy__pip--on' : ''}`} />
      ))}
      <span className="energy__text">
        {energy}/{MAX_ENERGY}
      </span>
    </span>
  );
}

// --- 玩家仆从区（可拖拽重排）---
// 为了拖拽时流畅，Reorder.Group 使用本地受控顺序，拖拽结束后才将新顺序同步到 store。
function PlayerReorderBoard({
  view,
  onCommit,
}: {
  view: BattleState;
  onCommit: (orderedIds: string[]) => void;
}) {
  const board = view.player.board;
  const [order, setOrder] = useState<Minion[]>(board);

  // 当权威 board 变化（只要 id 集合/顺序变了）时，重新同步本地顺序。
  const boardKey = board.map((m) => m.id).join(',');
  useEffect(() => {
    setOrder(board);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey]);

  return (
    <Reorder.Group
      as="div"
      axis="x"
      values={order}
      onReorder={setOrder}
      className="board__reorder"
      onPointerUp={() => onCommit(order.map((m) => m.id))}
    >
      <AnimatePresence>
        {order.map((m) => (
          <DraggableMinion key={m.id} view={view} minion={m} />
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );
}

function App() {
  const view = useBattleStore((s) => s.view);
  const playing = useBattleStore((s) => s.playing);
  const pending = useBattleStore((s) => s.pending);
  const anim = useBattleStore((s) => s.anim);
  const log = useBattleStore((s) => s.log);
  const newGame = useBattleStore((s) => s.newGame);
  const setPending = useBattleStore((s) => s.setPending);
  const playCard = useBattleStore((s) => s.playCard);
  const castSkill = useBattleStore((s) => s.useSkill);
  const reorderMinion = useBattleStore((s) => s.reorderMinion);
  const endTurn = useBattleStore((s) => s.endTurn);

  useEffect(() => {
    if (!view) newGame();
  }, [view, newGame]);

  if (!view) return null;

  const isPlayerTurn = view.phase === 'playerPlay' && !playing && !view.winner;
  const pendingCardId =
    pending?.kind === 'card' || pending?.kind === 'discardPick' || pending?.kind === 'discardTarget'
      ? pending.cardId
      : null;
  const pendingCard = pendingCardId
    ? view.player.hand.find((c) => c.id === pendingCardId)
    : null;
  const pendingDef: CardDef | null = pendingCard ? view.cardDb[pendingCard.defId] : null;
  const pendingSkill: SkillDef | null =
    pending?.kind === 'skill' ? heroSkillDef(view, 'player') : null;

  const discardReplayDef: CardDef | null =
    pending?.kind === 'discardTarget'
      ? view.cardDb[view.player.discard.find((c) => c.id === pending.discardCardId)?.defId ?? ''] ??
        null
      : null;

  const targetingDef =
    discardReplayDef?.targeting?.needsTarget
      ? discardReplayDef
      : pending?.kind === 'card' || pending?.kind === 'skill'
        ? (pendingDef ?? pendingSkill)
        : null;

  const isPlacing = isPlayerTurn && pending?.kind === 'card' && pendingDef?.type === 'minion';
  const isDiscardPick = isPlayerTurn && pending?.kind === 'discardPick';
  const isTargeting = isPlayerTurn && !!targetingDef?.targeting?.needsTarget;
  const canReorder =
    isPlayerTurn && !isTargeting && !isPlacing && !isDiscardPick && view.player.board.length > 1;
  const legal: TargetRef[] =
    isTargeting && targetingDef ? legalTargets(view, 'player', targetingDef) : [];

  const isLegalTarget = (ref: TargetRef) => legal.some((t) => targetsEqual(t, ref));

  const onSelectTarget = (ref: TargetRef) => {
    if (!isTargeting || !isLegalTarget(ref)) return;
    if (pending?.kind === 'skill') {
      castSkill({ target: ref });
      return;
    }
    if (pending?.kind === 'discardTarget') {
      playCard({
        cardId: pending.cardId,
        discardCardId: pending.discardCardId,
        target: ref,
      });
      return;
    }
    if (pendingCard) playCard({ cardId: pendingCard.id, target: ref });
  };

  const onClickDiscardCard = (discardCardId: string) => {
    if (!isDiscardPick || !pending || pending.kind !== 'discardPick') return;
    const chosen = view.player.discard.find((c) => c.id === discardCardId);
    if (!chosen) return;
    const chosenDef = view.cardDb[chosen.defId];
    if (chosenDef?.targeting?.needsTarget) {
      setPending({ kind: 'discardTarget', cardId: pending.cardId, discardCardId });
      return;
    }
    playCard({ cardId: pending.cardId, discardCardId });
  };

  const onClickHandCard = (card: CardInstance) => {
    if (!isPlayerTurn) return;
    const def = view.cardDb[card.defId];
    if (!def || view.player.energy < def.cost) return;
    if (pendingCardId === card.id) {
      setPending(null);
      return;
    }
    if (def.targeting?.needsDiscard) {
      if (view.player.discard.length === 0) return;
      setPending({ kind: 'discardPick', cardId: card.id });
      return;
    }
    if (def.type === 'minion') {
      if (view.player.board.length === 0) {
        playCard({ cardId: card.id, position: 0 });
      } else {
        setPending({ kind: 'card', cardId: card.id });
      }
    } else if (def.targeting?.needsTarget) {
      setPending({ kind: 'card', cardId: card.id });
    } else {
      playCard({ cardId: card.id });
    }
  };

  const onSkillClick = () => {
    if (!isPlayerTurn) return;
    const skill = heroSkillDef(view, 'player');
    if (!skill) return;
    if (pending?.kind === 'skill') {
      setPending(null);
      return;
    }
    if (view.player.energy < skill.cost || view.player.hero.skillUsedThisTurn) return;
    if (skill.targeting?.needsTarget) {
      setPending({ kind: 'skill' });
    } else {
      castSkill({});
    }
  };

  const onPlaceAt = (index: number) => {
    if (!isPlacing || !pendingCard) return;
    playCard({ cardId: pendingCard.id, position: index });
  };

  // 拖拽结束：将新顺序与权威 board 对比，找出第一个变动位置并提交 reorderMinion。
  const onReorderCommit = (orderedIds: string[]) => {
    const currentIds = view.player.board.map((m) => m.id);
    if (orderedIds.length !== currentIds.length) return;
    if (orderedIds.every((id, i) => id === currentIds[i])) return; // 无变化
    // 找到第一个不同位置：被移动的卡为 orderedIds 在该位置的元素。
    let from = -1;
    let to = -1;
    for (let i = 0; i < currentIds.length; i += 1) {
      if (currentIds[i] !== orderedIds[i]) {
        to = i;
        from = currentIds.indexOf(orderedIds[i]);
        break;
      }
    }
    if (from >= 0 && to >= 0 && from !== to) {
      reorderMinion(from, to);
    }
  };

  const phaseText =
    view.phase === 'enemyPlay'
      ? '敌人打牌'
      : view.phase === 'playerPlay'
        ? '玩家打牌'
        : view.phase === 'autoBattle'
          ? '自动战斗'
          : '战斗结束';

  // 选目标/放置阶段：渲染可点击仆从 + 插入槽。
  const renderPlayerBoardSelectable = () => {
    const board = view.player.board;
    const slots: React.ReactNode[] = [];
    if (isPlacing) {
      slots.push(
        <button
          key="slot-0"
          type="button"
          className="slot"
          onClick={() => onPlaceAt(0)}
          aria-label="放到最左"
        />,
      );
    }
    board.forEach((m, i) => {
      slots.push(
        <MinionView
          key={m.id}
          view={view}
          minion={m}
          side="player"
          selectable={isTargeting && isLegalTarget({ kind: 'minion', side: 'player', id: m.id })}
          anim={anim}
          onSelect={onSelectTarget}
        />,
      );
      if (isPlacing) {
        slots.push(
          <button
            key={`slot-${i + 1}`}
            type="button"
            className="slot"
            onClick={() => onPlaceAt(i + 1)}
            aria-label={`插入到第 ${i + 2} 位`}
          />,
        );
      }
    });
    return slots;
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>xu-bazaar</h1>
        <p>轻量化 PVE 卡牌对战 · 回合 {view.turn}</p>
      </header>

      <div className="app__body">
        <BattleLogPanel log={log} />

        <main className="scene">
        {/* 牌库：敌人在左上角，玩家在右下角 */}
        <div className="deck deck--enemy" title="敌人牌库剩余">
          <span className="deck__count">{view.enemy.deck.length}</span>
          <span className="deck__label">牌库</span>
        </div>
        <div className="deck deck--player" title="玩家牌库剩余">
          <span className="deck__count">{view.player.deck.length}</span>
          <span className="deck__label">牌库</span>
        </div>

        <HeroArea
          view={view}
          side="enemy"
          selectable={isTargeting && isLegalTarget({ kind: 'hero', side: 'enemy' })}
          anim={anim}
          skillInteractive={false}
          skillPending={false}
          onSelect={onSelectTarget}
          onSkillClick={() => {}}
        />

        <section className="board board--enemy" aria-label="敌人仆从区">
          <AnimatePresence>
            {view.enemy.board.map((m) => (
              <MinionView
                key={m.id}
                view={view}
                minion={m}
                side="enemy"
                selectable={
                  isTargeting && isLegalTarget({ kind: 'minion', side: 'enemy', id: m.id })
                }
                anim={anim}
                onSelect={onSelectTarget}
              />
            ))}
          </AnimatePresence>
          {view.enemy.board.length === 0 && <span className="board__empty">（无仆从）</span>}
        </section>

        <div className="midline">
          <FieldStrip view={view} />
          <div className="midline__energy midline__energy--enemy">
            <span className="midline__side">敌</span>
            <EnergyPips energy={view.enemy.energy} />
          </div>
          <div className="midline__center">
            <span className={`turn-arrow turn-arrow--${view.activeSide}`} aria-hidden />
            <button
              type="button"
              className="end-turn"
              disabled={!isPlayerTurn}
              onClick={() => endTurn()}
            >
              {playing ? '结算中…' : isPlayerTurn ? '结束回合' : phaseText}
            </button>
          </div>
          <div className="midline__energy midline__energy--player">
            <span className="midline__side">我</span>
            <EnergyPips energy={view.player.energy} />
          </div>
        </div>

        <section className="board board--player" aria-label="玩家仆从区">
          {canReorder ? (
            <PlayerReorderBoard view={view} onCommit={onReorderCommit} />
          ) : (
            <AnimatePresence>{renderPlayerBoardSelectable()}</AnimatePresence>
          )}
          {view.player.board.length === 0 && !isPlacing && (
            <span className="board__empty">（无仆从）</span>
          )}
        </section>

        <HeroArea
          view={view}
          side="player"
          selectable={isTargeting && isLegalTarget({ kind: 'hero', side: 'player' })}
          anim={anim}
          skillInteractive={isPlayerTurn}
          skillPending={pending?.kind === 'skill'}
          onSelect={onSelectTarget}
          onSkillClick={onSkillClick}
        />

        <section className="hand" aria-label="玩家手牌">
          <AnimatePresence>
            {view.player.hand.map((c) => (
              <HandCard
                key={c.id}
                view={view}
                card={c}
                disabled={!isPlayerTurn}
                active={pendingCardId === c.id}
                onClick={() => onClickHandCard(c)}
              />
            ))}
          </AnimatePresence>
          {view.player.hand.length === 0 && <span className="board__empty">（无手牌）</span>}
        </section>

        {isDiscardPick && (
          <section className="hand hand--discard" aria-label="弃牌堆选用">
            {view.player.discard.map((c) => (
              <HandCard
                key={c.id}
                view={view}
                card={c}
                disabled={false}
                active={false}
                onClick={() => onClickDiscardCard(c.id)}
              />
            ))}
          </section>
        )}
        </main>
      </div>

      {(isPlacing || isTargeting || isDiscardPick) && (
        <div className="hint">
          {isDiscardPick
            ? '从弃牌堆选择一张卡使用'
            : isPlacing
              ? '选择召唤位置（点击插入点）'
              : '选择目标'}
          <button type="button" className="hint__cancel" onClick={() => setPending(null)}>
            取消
          </button>
        </div>
      )}

      {canReorder && (
        <div className="hint hint--reorder">拖拽可重排你的仆从位置</div>
      )}

      <AnimatePresence>
        {view.winner && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="overlay__panel"
              initial={{ scale: 0.7, y: 20 }}
              animate={{ scale: 1, y: 0 }}
            >
              <h2>{view.winner === 'player' ? '胜利！' : '失败…'}</h2>
              <button type="button" onClick={() => newGame()}>
                再来一局
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
