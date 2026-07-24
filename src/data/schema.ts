// Zod schemas for catalog.json (1:1 with CardDef / HeroDef, no deprecated damage/heal on cards).

import { z } from 'zod';

const targetingRuleSchema = z.object({
  needsTarget: z.boolean(),
  allowHero: z.boolean(),
  respectTaunt: z.boolean(),
  side: z.enum(['enemy', 'ally', 'any']),
  needsDiscard: z.boolean().optional(),
});

const cardEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('damage'), amount: z.number() }),
  z.object({ type: z.literal('heal'), amount: z.number() }),
  z.object({ type: z.literal('draw'), amount: z.number() }),
  z.object({ type: z.literal('shield'), amount: z.number() }),
  z.object({ type: z.literal('destroyTarget') }),
  z.object({ type: z.literal('drawByTargetCost') }),
  z.object({ type: z.literal('grantMultiAttack'), amount: z.number() }),
  z.object({ type: z.literal('grantSplash') }),
  z.object({
    type: z.literal('summon'),
    defId: z.string(),
    count: z.number().optional(),
    rebirth: z.number().optional(),
  }),
  z.object({ type: z.literal('ritual'), ritualKey: z.enum(['demonPortal', 'hellBeast']) }),
  z.object({ type: z.literal('aoeDamageEnemies'), amount: z.number() }),
  z.object({ type: z.literal('fragileEnemyMinions') }),
  z.object({ type: z.literal('replayDiscard') }),
]);

const minionDefSchema = z.object({
  name: z.string(),
  attack: z.number(),
  hp: z.number(),
  size: z.union([z.literal(1), z.literal(2)]),
  keywords: z.array(z.enum(['taunt', 'splash'])),
  tags: z.array(z.enum(['hell', 'large'])).optional(),
});

export const cardDefSchema = z
  .object({
    defId: z.string().min(1),
    name: z.string(),
    type: z.enum(['minion', 'attack', 'spell']),
    cost: z.number(),
    description: z.string(),
    minion: minionDefSchema.optional(),
    targeting: targetingRuleSchema.optional(),
    castCount: z.number().optional(),
    effects: z.array(cardEffectSchema).optional(),
    onEnter: z.array(cardEffectSchema).optional(),
    keywords: z.array(z.literal('vanguard')).optional(),
  })
  .strict();

const triggeredEffectSchema = z.object({
  trigger: z.literal('onKill'),
  effects: z.array(z.object({ type: z.literal('draw'), amount: z.number() })),
});

const skillDefSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  cost: z.number(),
  description: z.string(),
  damage: z.number().optional(),
  heal: z.number().optional(),
  targeting: targetingRuleSchema.optional(),
  triggered: z.array(triggeredEffectSchema).optional(),
});

export const heroDefSchema = z
  .object({
    defId: z.string().min(1),
    name: z.string(),
    attack: z.number(),
    hp: z.number(),
    skill: skillDefSchema.nullable().optional(),
  })
  .strict();

export const catalogSchema = z
  .object({
    cards: z.array(cardDefSchema),
    heroes: z.array(heroDefSchema),
  })
  .strict()
  .superRefine((data, ctx) => {
    const cardIds = new Set<string>();
    for (const card of data.cards) {
      if (cardIds.has(card.defId)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate card defId: ${card.defId}`,
          path: ['cards'],
        });
      }
      cardIds.add(card.defId);
    }
    const heroIds = new Set<string>();
    for (const hero of data.heroes) {
      if (heroIds.has(hero.defId)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate hero defId: ${hero.defId}`,
          path: ['heroes'],
        });
      }
      heroIds.add(hero.defId);
    }
  });

export type CatalogData = z.infer<typeof catalogSchema>;

export const storedCatalogSchema = z
  .object({
    appVersion: z.string().min(1),
    catalog: catalogSchema,
  })
  .strict();

export type StoredCatalog = z.infer<typeof storedCatalogSchema>;
