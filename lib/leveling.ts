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
//                → LV1 곤충은 첫 배틀만 해도 바로 LV2.
//                LV2 까지는 이기든 지든 똑같이, **LV3 부터는 지면 절반**.
//   다시 왔을 때 LV5 까지는 올 때마다 한 번에 레벨업 · LV5→6 50% · LV6→7 45% · LV7→8 40% …
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

/** 이 레벨부터는 지면 경험치를 덜 받는다 (Jin: "레벨 3 전까진 이기든 지든 똑같이") */
export const LOSS_XP_FROM_LEVEL = 3;
/** 졌을 때 받는 비율 */
export const LOSS_XP_RATE = 0.5;

/** 배틀 한 판으로 얻는 경험치 (레벨 하나의 몇 %인지) */
export function battleXpRate(level: number, won = true): number {
  const base = Math.max(BATTLE_XP_MIN, Math.pow(BATTLE_XP_DECAY, Math.max(0, level - 1)));
  return level >= LOSS_XP_FROM_LEVEL && !won ? base * LOSS_XP_RATE : base;
}

/**
 * 다시 와서 "내 곤충 키우기" 를 골랐을 때 얻는 경험치 (레벨 하나의 몇 %인지)
 * LV5 까지는 올 때마다 한 번에 레벨업. LV5→6 50% · LV6→7 45% · LV7→8 40% … 5%씩 줄고 최소 10%.
 * (Jin 10/1: "다회차 아이들이 너무 세면 재미가 없어질 것 같아서")
 */
export function revisitXpRate(level: number): number {
  if (level < 5) return 1;
  return Math.max(0.1, 0.5 - 0.05 * (level - 5));
}

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / LEVEL_XP);
}

/** 지금 레벨에서 다음 레벨까지 얼마나 찼는지 (0~1) */
export function levelProgress(level: number, xp: number): number {
  const into = Math.max(xp, (level - 1) * LEVEL_XP) - (level - 1) * LEVEL_XP;
  return Math.max(0, Math.min(1, into / LEVEL_XP));
}

// ── 화면에 보여주는 경험치 숫자 (2026-10-01 Jin: "%가 아니라 XP 수치로, 레벨이 오를수록 더 많이 필요하게") ──
// 속은 위의 % 규칙 그대로다. 화면에서만 레벨마다 필요한 XP 를 키워서 숫자로 보여준다.
//   LV1→2: 100 XP · LV2→3: 200 XP · LV3→4: 300 XP …
export function xpToNext(level: number): number {
  return 100 * Math.max(1, Math.floor(level || 1));
}

/** 지금 레벨에서 모은 XP / 다음 레벨까지 필요한 XP */
export function xpDisplay(level: number, xp: number): { have: number; need: number; left: number } {
  const need = xpToNext(level);
  const have = Math.round(levelProgress(level, xp) * need);
  return { have, need, left: need - have };
}

export interface XpGain {
  xp: number;
  level: number;
  /** 이번에 얻은 경험치 (속 단위, 레벨 하나 = 100) */
  gained: number;
  /** 화면에 보여줄 XP 숫자 (레벨이 높을수록 커진다, xpToNext 기준) */
  shown: number;
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
  return { xp: total, level: next, gained, shown: Math.round(rate * xpToNext(start)), levelsUp: next - start };
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

// ── 수비하는 곤충도 경험치 (2026-10-01 Jin: "랭킹 곤충은 수비하는 입장이니 공격하는 쪽의 20% 정도") ──
//
// ⚠️ 한도가 없으면 무너진다 (Claude 계산): 랭킹 1~3위는 2일 동안 한 마리당 약 300번 도전을 받는다.
//   한도 없이 20% 를 주면 LV5 곤충이 주인이 한 판도 안 해도 행사 끝에 LV10 이 된다 → 아무도 못 이김.
//   그래서 **수비로 받는 경험치는 하루에 레벨 1개(100)까지만**. 그러면 2일에 +2 레벨 정도.
//   레벨업 포인트는 안 준다 (포인트는 아이가 직접 와서 레벨업할 때만).
export const DEFENSE_XP_SHARE = 0.2;
export const DEFENSE_XP_DAILY_CAP = LEVEL_XP;

/** 오늘 날짜 (한국 시간) — 수비 경험치 하루 한도를 세는 기준 */
export function koreaDay(now = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

/**
 * 수비한 곤충이 받을 경험치. `defense` 는 `insects.stats.defense` 에 저장해 둔 오늘 받은 양.
 * 한도를 넘으면 0.
 */
export function defenseXpGain(
  level: number,
  xp: number,
  won: boolean,
  defense: { day?: string; xp?: number } | undefined,
  today = koreaDay()
): { gain: XpGain; record: { day: string; xp: number } } | null {
  const already = defense?.day === today ? Math.max(0, Number(defense.xp) || 0) : 0;
  const want = Math.round(LEVEL_XP * DEFENSE_XP_SHARE * battleXpRate(level, won));
  const allowed = Math.min(want, DEFENSE_XP_DAILY_CAP - already);
  if (allowed <= 0) return null;
  const gain = addXp(level, xp, allowed / LEVEL_XP);
  return { gain, record: { day: today, xp: already + allowed } };
}
