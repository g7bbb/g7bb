// 🎁 보너스 스테이지 (2026-10-03 행사 중 Jin: "중간보스 중에 보너스 스테이지도 40% 확률로.
//    레벨 1업, HP 30 획득, 수비력 20 획득 이렇게 3개")
//
// - 랭킹 도전을 시작할 때 중간보스 이벤트(45%, lib/bots.ts)가 걸리면, 그중 40% 는 보스 대신 보너스 스테이지.
//   → 게임 하나에 보스 27% · 보너스 18% · 아무것도 없음 55%.
// - 1판 또는 2판이 끝난 뒤 보스처럼 갑자기 뜬다. 보물상자 3개 중 하나를 고르면 상품 하나가 **무작위로** 나온다
//   (아이가 상품을 직접 고르게 하면 다들 같은 것만 고른다). 싸움 없음 · 랭킹 도전 판 수에 안 셈.
// - 받은 건 **영원히** 남는다:
//   레벨 1업 → insects.level/xp · HP·수비력 → insects.stats.bonus {hp, def} (원래 있던 jsonb → 마이그레이션 없음).
//   배틀·카드는 statsForInsect() 가 얹어서 계산한다.
// - ⚠️ 시뮬레이션(scratchpad bonussim.ts, 같은 레벨끼리): 받은 쪽 승률 HP+30 → 58~60% · 수비력+20 → 65~67% ·
//   레벨 1업 → LV2 65% / LV4 이상 52%. 수비력 기본값이 50 이라 +20 은 +40% 다 (레벨 1업보다 셈).
//   Jin 숫자 그대로 넣었다. 줄이려면 아래 amount 만 고치면 된다.

export const BONUS_SHARE = 0.4;

export type BonusKey = 'level' | 'hp' | 'def';

export const BONUS_REWARDS: { key: BonusKey; emoji: string; title: string; desc: string; amount: number; color: string }[] = [
  { key: 'level', emoji: '🆙', title: '레벨 1 업!', desc: '내 곤충 레벨이 바로 하나 올랐어!', amount: 1, color: '#fbbf24' },
  { key: 'hp', emoji: '💚', title: 'HP +30', desc: '내 곤충 HP가 영원히 30 늘었어!', amount: 30, color: '#4ade80' },
  { key: 'def', emoji: '🛡️', title: '수비력 +20', desc: '내 곤충 수비력이 영원히 20 늘었어!', amount: 20, color: '#60a5fa' },
];

export function rollBonus(): BonusKey {
  return BONUS_REWARDS[Math.floor(Math.random() * BONUS_REWARDS.length)].key;
}

export function bonusInfo(key: BonusKey) {
  return BONUS_REWARDS.find((r) => r.key === key) ?? BONUS_REWARDS[0];
}

export interface StatBonus {
  hp: number;
  def: number;
}

/** insects.stats.bonus 읽기 (없거나 이상하면 0) */
export function readBonus(stats: unknown): StatBonus {
  const raw = (stats as any)?.bonus;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return { hp: num(raw?.hp), def: num(raw?.def) };
}

/** 받은 HP·수비력을 능력치에 그대로 더한다 */
export function applyBonus<T extends { hp: number; def: number }>(stats: T, bonus: StatBonus): T {
  if (!bonus.hp && !bonus.def) return stats;
  return { ...stats, hp: Math.round(stats.hp + bonus.hp), def: stats.def + bonus.def };
}
