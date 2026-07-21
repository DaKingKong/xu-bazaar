// 可注入的种子化随机源。
// 引擎所有随机行为都通过 Rng 完成，测试中注入固定种子以断言确定性结果。

import type { Rng } from './types.ts';

// mulberry32：小巧、确定性、分布足够好的 PRNG。
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 返回 [0, n) 的整数。
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

// 从非空数组中随机取一个元素。
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[randInt(rng, arr.length)];
}
