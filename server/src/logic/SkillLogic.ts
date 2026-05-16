import type { Player, SkillData } from 'common';

export const XP_PER_LEVEL = 100;
export const XP_EXPONENT = 1.2;

export function getXPRequired(level: number): number {
  return Math.floor(XP_PER_LEVEL * Math.pow(level, XP_EXPONENT));
}

export function addXP(player: Player, skill: string, amount: number): { leveledUp: boolean, newLevel: number } {
  if (!player.skills[skill]) {
    player.skills[skill] = { level: 1, xp: 0 };
  }

  const skillData = player.skills[skill];
  skillData.xp += amount;

  let leveledUp = false;
  while (skillData.xp >= getXPRequired(skillData.level)) {
    skillData.xp -= getXPRequired(skillData.level);
    skillData.level++;
    leveledUp = true;
  }

  return { leveledUp, newLevel: skillData.level };
}

export function getStaminaCost(player: Player, skill: string, baseCost: number): number {
  const level = player.skills[skill]?.level || 1;
  // Reduce cost by 2% per level, capped at 50% reduction
  let reduction = Math.min(0.5, (level - 1) * 0.02);

  // Apply stamina efficiency buff if active
  const efficiencyBuff = player.buffs?.find(b => b.type === 'stamina_efficiency');
  if (efficiencyBuff) {
    reduction += 0.25; // Additional 25% reduction
  }

  return Math.max(1, Math.floor(baseCost * (1 - Math.min(0.75, reduction))));
}
