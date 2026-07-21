import { SAMPLE_CARDS } from './index.ts';

// defId -> 展示名称，供占位 UI 显示仆从名。
export const MINION_NAME_BY_DEF_ID: Record<string, string> = Object.fromEntries(
  SAMPLE_CARDS.filter((c) => c.type === 'minion').map((c) => [c.defId, c.name]),
);
