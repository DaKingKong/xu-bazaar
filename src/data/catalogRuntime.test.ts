import { describe, expect, it } from 'vitest';
import bundled from './catalog.json';
import { createCatalogRuntime, CATALOG_STORAGE_KEY } from './catalogRuntime.ts';
import { catalogSchema } from './schema.ts';
import type { CardDef, HeroDef } from '../engine/types.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => [...map.keys()][i] ?? null,
  };
}

describe('catalog schema', () => {
  it('accepts bundled catalog.json', () => {
    const parsed = catalogSchema.safeParse(bundled);
    expect(parsed.success).toBe(true);
  });

  it('rejects deprecated top-level damage on cards', () => {
    const bad = {
      ...bundled,
      cards: [{ ...bundled.cards[0], damage: 3 }],
    };
    expect(catalogSchema.safeParse(bad).success).toBe(false);
  });
});

describe('catalogRuntime', () => {
  it('loads bundled catalog into db maps', () => {
    const cardDb: Record<string, CardDef> = {};
    const heroDb: Record<string, HeroDef> = {};
    const rt = createCatalogRuntime({
      cardDb,
      heroDb,
      appVersion: '0.1.0',
      storage: null,
      bundled,
    });
    expect(cardDb['minion-ice']?.name).toBe('冰晶人');
    expect(heroDb['hell-warlock']?.name).toBe('地狱术士');
    expect(rt.isDirty()).toBe(false);
  });

  it('Save applies draft and persists; draft edits alone do not apply', () => {
    const storage = memoryStorage();
    const cardDb: Record<string, CardDef> = {};
    const heroDb: Record<string, HeroDef> = {};
    const rt = createCatalogRuntime({
      cardDb,
      heroDb,
      appVersion: '0.1.0',
      storage,
      bundled,
    });

    const draftCard = { ...bundled.cards.find((c) => c.defId === 'minion-ice')!, cost: 9 };
    expect(rt.updateDraftCard('minion-ice', draftCard).ok).toBe(true);
    expect(rt.isDirty()).toBe(true);
    expect(cardDb['minion-ice']?.cost).toBe(1);

    expect(rt.save().ok).toBe(true);
    expect(cardDb['minion-ice']?.cost).toBe(9);
    expect(rt.isDirty()).toBe(false);

    const stored = JSON.parse(storage.getItem(CATALOG_STORAGE_KEY)!);
    expect(stored.appVersion).toBe('0.1.0');
    expect(stored.catalog.cards.find((c: { defId: string }) => c.defId === 'minion-ice').cost).toBe(
      9,
    );
  });

  it('ignores localStorage when appVersion mismatches', () => {
    const storage = memoryStorage();
    storage.setItem(
      CATALOG_STORAGE_KEY,
      JSON.stringify({
        appVersion: '0.0.1',
        catalog: {
          ...bundled,
          cards: bundled.cards.map((c) =>
            c.defId === 'minion-ice' ? { ...c, cost: 99 } : c,
          ),
        },
      }),
    );

    const cardDb: Record<string, CardDef> = {};
    const heroDb: Record<string, HeroDef> = {};
    const rt = createCatalogRuntime({
      cardDb,
      heroDb,
      appVersion: '0.1.0',
      storage,
      bundled,
    });

    expect(cardDb['minion-ice']?.cost).toBe(1);
    expect(storage.getItem(CATALOG_STORAGE_KEY)).toBeNull();
    expect(rt.getLoadNote()).toMatch(/ignored/);
  });

  it('loads matching localStorage once at init', () => {
    const storage = memoryStorage();
    storage.setItem(
      CATALOG_STORAGE_KEY,
      JSON.stringify({
        appVersion: '0.2.0',
        catalog: {
          ...bundled,
          cards: bundled.cards.map((c) =>
            c.defId === 'minion-ice' ? { ...c, cost: 7 } : c,
          ),
        },
      }),
    );

    const cardDb: Record<string, CardDef> = {};
    const heroDb: Record<string, HeroDef> = {};
    createCatalogRuntime({
      cardDb,
      heroDb,
      appVersion: '0.2.0',
      storage,
      bundled,
    });
    expect(cardDb['minion-ice']?.cost).toBe(7);
  });

  it('Reset restores bundled and clears storage', () => {
    const storage = memoryStorage();
    const cardDb: Record<string, CardDef> = {};
    const heroDb: Record<string, HeroDef> = {};
    const rt = createCatalogRuntime({
      cardDb,
      heroDb,
      appVersion: '0.1.0',
      storage,
      bundled,
    });
    rt.updateDraftCard('minion-ice', { ...bundled.cards.find((c) => c.defId === 'minion-ice')!, cost: 5 });
    rt.save();
    rt.reset();
    expect(cardDb['minion-ice']?.cost).toBe(1);
    expect(storage.getItem(CATALOG_STORAGE_KEY)).toBeNull();
  });

  it('exportCommittedJson matches last Save, not dirty draft', () => {
    const cardDb: Record<string, CardDef> = {};
    const heroDb: Record<string, HeroDef> = {};
    const rt = createCatalogRuntime({
      cardDb,
      heroDb,
      appVersion: '0.1.0',
      storage: null,
      bundled,
    });
    rt.updateDraftCard('minion-ice', { ...bundled.cards.find((c) => c.defId === 'minion-ice')!, cost: 4 });
    const exported = JSON.parse(rt.exportCommittedJson());
    expect(exported.cards.find((c: { defId: string }) => c.defId === 'minion-ice').cost).toBe(1);
  });
});
