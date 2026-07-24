// Active catalog: bundled JSON + optional localStorage override (version-gated).
// Draft edits apply only on Save; localStorage is read once at init.

import packageJson from '../../package.json' with { type: 'json' };
import bundledCatalogJson from './catalog.json' with { type: 'json' };
import type { CardDef, HeroDef } from '../engine/types.ts';
import {
  catalogSchema,
  storedCatalogSchema,
  type CatalogData,
  type StoredCatalog,
} from './schema.ts';

export const CATALOG_STORAGE_KEY = 'xu-bazaar:catalog';

export type CatalogApplyResult =
  | { ok: true }
  | { ok: false; error: string };

function cloneCatalog(catalog: CatalogData): CatalogData {
  return structuredClone(catalog);
}

function catalogsEqual(a: CatalogData, b: CatalogData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseCatalog(raw: unknown): { ok: true; catalog: CatalogData } | { ok: false; error: string } {
  const parsed = catalogSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, catalog: parsed.data };
}

/** Mutate target maps in place so existing import bindings stay valid. */
export function replaceDbMaps(
  cardDb: Record<string, CardDef>,
  heroDb: Record<string, HeroDef>,
  catalog: CatalogData,
): void {
  for (const key of Object.keys(cardDb)) delete cardDb[key];
  for (const key of Object.keys(heroDb)) delete heroDb[key];
  for (const card of catalog.cards) cardDb[card.defId] = card as CardDef;
  for (const hero of catalog.heroes) heroDb[hero.defId] = hero as HeroDef;
}

export function createCatalogRuntime(options: {
  cardDb: Record<string, CardDef>;
  heroDb: Record<string, HeroDef>;
  appVersion?: string;
  storage?: Storage | null;
  bundled?: unknown;
}) {
  const appVersion = options.appVersion ?? packageJson.version;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const bundledParsed = parseCatalog(options.bundled ?? bundledCatalogJson);
  if (!bundledParsed.ok) {
    throw new Error(`bundled catalog invalid: ${bundledParsed.error}`);
  }
  const bundled = bundledParsed.catalog;

  let committed = cloneCatalog(bundled);
  let draft = cloneCatalog(bundled);
  let loadNote: string | null = null;

  const stored = readStored(storage);
  if (stored) {
    if (stored.appVersion !== appVersion) {
      loadNote = `localStorage catalog ignored (saved ${stored.appVersion}, app ${appVersion})`;
      storage?.removeItem(CATALOG_STORAGE_KEY);
    } else {
      const checked = parseCatalog(stored.catalog);
      if (!checked.ok) {
        loadNote = `localStorage catalog invalid: ${checked.error}`;
        storage?.removeItem(CATALOG_STORAGE_KEY);
      } else {
        committed = cloneCatalog(checked.catalog);
        draft = cloneCatalog(checked.catalog);
      }
    }
  }

  replaceDbMaps(options.cardDb, options.heroDb, committed);

  return {
    getAppVersion: () => appVersion,
    getBundled: () => cloneCatalog(bundled),
    getCommitted: () => cloneCatalog(committed),
    getDraft: () => cloneCatalog(draft),
    getLoadNote: () => loadNote,
    isDirty: () => !catalogsEqual(draft, committed),

    setDraft(next: CatalogData): CatalogApplyResult {
      const checked = parseCatalog(next);
      if (!checked.ok) return checked;
      draft = cloneCatalog(checked.catalog);
      return { ok: true };
    },

    updateDraftCard(defId: string, raw: unknown): CatalogApplyResult {
      const cardParsed = catalogSchema.shape.cards.element.safeParse(raw);
      if (!cardParsed.success) return { ok: false, error: cardParsed.error.message };
      if (cardParsed.data.defId !== defId) {
        return { ok: false, error: `defId mismatch: expected ${defId}` };
      }
      const next = cloneCatalog(draft);
      const idx = next.cards.findIndex((c) => c.defId === defId);
      if (idx < 0) return { ok: false, error: `unknown card: ${defId}` };
      next.cards[idx] = cardParsed.data;
      draft = next;
      return { ok: true };
    },

    updateDraftHero(defId: string, raw: unknown): CatalogApplyResult {
      const heroParsed = catalogSchema.shape.heroes.element.safeParse(raw);
      if (!heroParsed.success) return { ok: false, error: heroParsed.error.message };
      if (heroParsed.data.defId !== defId) {
        return { ok: false, error: `defId mismatch: expected ${defId}` };
      }
      const next = cloneCatalog(draft);
      const idx = next.heroes.findIndex((h) => h.defId === defId);
      if (idx < 0) return { ok: false, error: `unknown hero: ${defId}` };
      next.heroes[idx] = heroParsed.data;
      draft = next;
      return { ok: true };
    },

    discardDraft(): void {
      draft = cloneCatalog(committed);
    },

    save(): CatalogApplyResult {
      const checked = parseCatalog(draft);
      if (!checked.ok) return checked;
      committed = cloneCatalog(checked.catalog);
      draft = cloneCatalog(checked.catalog);
      replaceDbMaps(options.cardDb, options.heroDb, committed);
      if (storage) {
        const payload: StoredCatalog = { appVersion, catalog: committed };
        storage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(payload));
      }
      return { ok: true };
    },

    reset(): void {
      storage?.removeItem(CATALOG_STORAGE_KEY);
      committed = cloneCatalog(bundled);
      draft = cloneCatalog(bundled);
      replaceDbMaps(options.cardDb, options.heroDb, committed);
    },

    /** Export last committed (Save / initial load) catalog JSON text. */
    exportCommittedJson(): string {
      return `${JSON.stringify(committed, null, 2)}\n`;
    },
  };
}

export type CatalogRuntime = ReturnType<typeof createCatalogRuntime>;

function defaultStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readStored(storage: Storage | null): StoredCatalog | null {
  if (!storage) return null;
  const raw = storage.getItem(CATALOG_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = storedCatalogSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
