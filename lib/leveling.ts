// ─────────────────────────────────────────────────────────────
// 레벨 · 경험치 · 역전 찬스 (2026-10-01 Jin 재설계)
//
// Jin: "누가 무조건 이기면 안 되고, 상성·출신지·몇년충에 따라 근소한 차이로 승부가 나야 한다.
//       다회차 아이가 유리하지만, 5회차가 1회차를 무조건 이기면 안 된다.
//       1회차 아이도 필살기가 한 번 더 터진다거나 크리티컬이 터지는 기회를 주고 싶다."
//
// 레벨 하나 = 경험치 100. (`insects.xp` 는 지금까지 모은 경험치 합계, `insects.level` 은 그대로 저장)
//
//   배틀 한 판   LV1 100% · LV2 70% · LV3 49% · LV4 34% · LV5 24% … (레벨마다 ×0.7)
//                → LV1 곤충은 첫 배틀만 해도 바로 LV2. 이기든 지든 똑같이 받는다.
//   다시 왔을 때 LV4 까지는 100%(= 한 번에 레벨업) · LV5 50% · LV6 부터 30%
//
//   역전 찬스    레벨이 낮을수록 "필살기 한 번 더!" 확률이 높다 (LV1 50%).
//                상대보다 레벨이 낮으면 크리티컬 확률이 올라간다.
//
// 숫자는 `tools/sim/levels.ts` 로 맞췄다. 고치면 반드시 다시 돌릴 것.
// ─────────────────────────────────────────────────────────────

/** 레벨 하나를 올리는 데 드는 경험치 */
export const LEVEL_XP = 100;

/** 배틀 경험치가 레벨마다 줄어드는 비율 (LV1 100% → LV2 70% → LV3 49% …) */
export const BATTLE_XP_DECAY = 0.7;
/** 아무리 높아도 배틀 한 판에 이만큼은 받는다 (5%) */
const BATTLE_XP_MIN = 0.05;

/** 배틀 한 판으로 얻는 경험치 (레벨 하나의 몇 %인지) */
export function battleXpRate(level: number): number {
  return Math.max(BATTLE_XP_MIN, Math.pow(BATTLE_XP_DECAY, Math.max(0, level - 1)));
}

/** 다시 와서 "내 곤충 키우기" 를 골랐을 때 얻는 경험치 (레벨 하나의 몇 %인지) */
export function revisitXpRate(level: number): number {
  if (level < 5) return 1; // LV5 까지는 올 때마다 한 번에 레벨업
  if (level === 5) return 0.5;
  return 0.3;
}

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / LEVEL_XP);
}

/** 지금 레벨에서 다음 레벨까지 얼마나 찼는지 (0~1) */
export function levelProgress(level: number, xp: number): number {
  const into = Math.max(xp, (level - 1) * LEVEL_XP) - (level - 1) * LEVEL_XP;
  return Math.max(0, Math.min(1, into / LEVEL_XP));
}

export interface XpGain {
  xp: number;
  level: number;
  /** 이번에 얻은 경험치 */
  gained: number;
  /** 몇 레벨 올랐는지 (0 이면 안 오름) */
  levelsUp: number;
}

/**
 * 경험치를 더합니다.
 * 옛 기록(레벨은 높은데 xp 가 적은 것)이 섞여 있어도 **레벨이 내려가지 않게** 레벨 바닥부터 셉니다.
 */
export function addXp(level: number, xp: number, rate: number): XpGain {
  const start = Math.max(1, Math.floor(level || 1));
  const base = Math.max(xp || 0, (start - 1) * LEVEL_XP);
  const gained = Math.round(LEVEL_XP * rate);
  const total = base + gained;
  const next = Math.max(start, levelFromXp(total));
  return { xp: total, level: next, gained, levelsUp: next - start };
}

// ── 배틀에서 레벨이 하는 일 ─────────────────────────────────

/**
 * 레벨이 능력치(HP·공격·수비·지능)에 주는 보너스.
 * LV5 까지는 레벨마다 +3%, 그 뒤로는 +1.5% 씩만. (끝없이 세지면 다회차가 무조건 이긴다)
 */
export const LEVEL_STAT_STEP = 0.03;
export const LEVEL_STAT_STEP_AFTER5 = 0.02;

export function levelStatBonus(level: number): number {
  const l = Math.max(1, level);
  return 1 + LEVEL_STAT_STEP * Math.min(l - 1, 4) + LEVEL_STAT_STEP_AFTER5 * Math.max(0, l - 5);
}

/** 기본 크리티컬 확률 — 레벨과 상관없이 같다 */
export const BASE_CRIT = 0.12;
/** 상대보다 레벨이 하나 낮을 때마다 더해지는 크리티컬 확률 (역전 찬스) */
export const UNDERDOG_CRIT_STEP = 0.02;
export const MAX_CRIT = 0.3;

export function critChance(level: number, foeLevel: number): number {
  const gap = Math.max(0, (foeLevel || 1) - (level || 1));
  return Math.min(MAX_CRIT, BASE_CRIT + UNDERDOG_CRIT_STEP * gap);
}

/**
 * "필살기 한 번 더!" 확률. 레벨이 낮을수록 높다 (Jin: LV1 은 50%).
 * LV1 50% · LV2 40% · LV3 30% · LV4 20% · LV5 부터 10%
 */
export function bonusSpecialChance(level: number): number {
  return Math.max(0.1, 0.6 - 0.1 * Math.max(1, level));
}
