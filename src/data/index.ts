// Static game content: catalog.json + runtime override; deck recipes stay here.

import type { CardDef, CardInstance, HeroDef } from '../engine/types.ts';
import { createCatalogRuntime } from './catalogRuntime.ts';

/** 疲劳机制生成的直接攻击卡（血战）。 */
export const FATIGUE_STRIKE_DEF_ID = 'blood-war';

export const DUMMY_HERO_ID = 'dummy';
export const HELL_WARLOCK_ID = 'hell-warlock';

/** Live maps — mutated in place by catalog runtime on Save / Reset / init. */
export const CARD_DB: Record<string, CardDef> = {};
export const HERO_DB: Record<string, HeroDef> = {};

export const catalogRuntime = createCatalogRuntime({ cardDb: CARD_DB, heroDb: HERO_DB });

export function getCardDefs(): CardDef[] {
  return Object.values(CARD_DB);
}

export function getHeroDefs(): HeroDef[] {
  return Object.values(HERO_DB);
}

/** @deprecated Prefer getCardDefs() — array snapshot at call time. */
export const CARD_DEFS: CardDef[] = getCardDefs();
/** @deprecated Prefer getHeroDefs() — array snapshot at call time. */
export const HERO_DEFS: HeroDef[] = getHeroDefs();

export function getDummyHero(): HeroDef {
  return HERO_DB[DUMMY_HERO_ID]!;
}

export function getHellWarlock(): HeroDef {
  return HERO_DB[HELL_WARLOCK_ID]!;
}

/** @deprecated Prefer getDummyHero() */
export const DUMMY_HERO: HeroDef = getDummyHero();
/** @deprecated Prefer getHellWarlock() */
export const HELL_WARLOCK: HeroDef = getHellWarlock();

export function getSampleCards(): CardDef[] {
  return getCardDefs().filter((c) => c.defId !== FATIGUE_STRIKE_DEF_ID);
}

/** @deprecated Prefer getSampleCards() */
export const SAMPLE_CARDS: CardDef[] = getSampleCards();

/** Snapshot for createBattle so an in-flight match keeps defs from battle start. */
export function snapshotCardDb(): Record<string, CardDef> {
  return { ...CARD_DB };
}

export function snapshotHeroDb(): Record<string, HeroDef> {
  return { ...HERO_DB };
}

/** 玩家地狱术士主题组（含地狱兽仪式）。 */
export function buildPlayerHellDeck(prefix: string): CardInstance[] {
  const recipe: string[] = [
    'minion-ice',
    'minion-ice',
    'minion-ice',
    'minion-flame',
    'minion-flame',
    'minion-flame',
    'minion-scroll-cat',
    'minion-scroll-cat',
    'minion-demon',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'spell-fireball',
    'spell-fireball',
    'spell-aegis',
    'spell-death-flow',
    'spell-haste-infusion',
    'spell-claw-infusion',
    'spell-demon-summon',
    'spell-demon-portal',
    'spell-hell-beast-ritual',
    'spell-curse-blast',
    'spell-nether-pull',
  ];
  return recipe.map((defId, i) => ({ id: `${prefix}-${i}-${defId}`, defId }));
}

/** 敌人主题组：仅恶魔与石像守卫（无仪式/法术）。 */
export function buildEnemyHellDeck(prefix: string): CardInstance[] {
  const recipe: string[] = [
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
    'minion-demon',
    'minion-demon',
    'minion-golem-guard',
    'minion-golem-guard',
  ];
  return recipe.map((defId, i) => ({ id: `${prefix}-${i}-${defId}`, defId }));
}

/** @deprecated 使用 buildPlayerHellDeck / buildEnemyHellDeck */
export function buildSampleDeck(prefix: string): CardInstance[] {
  return prefix.startsWith('e') ? buildEnemyHellDeck(prefix) : buildPlayerHellDeck(prefix);
}
