/** 展示层战斗伤害：护盾优先于生命（与引擎 applyShieldThenHp 对齐）。 */
export function applyViewCombatDamage(
  holder: { hp: number; shield?: number },
  amount: number,
): void {
  let dmg = amount;
  if ((holder.shield ?? 0) > 0) {
    const absorb = Math.min(holder.shield!, dmg);
    holder.shield = (holder.shield ?? 0) - absorb;
    if (holder.shield <= 0) holder.shield = 0;
    dmg -= absorb;
  }
  if (dmg > 0) holder.hp -= dmg;
}
