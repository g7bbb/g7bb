// 아이에게 보여주고 출력해 줄 **곤충 카드**의 등급 규칙입니다.
//
// Jin 요청 (2026-09-29):
//   "현장에서 참가한 아이들은 본인 카드를 출력해주고, 다시 참가비를 내고
//    2회차 출력을 한 아이들은 차이가 있어야 하는데
//    2회차 = 은색 / 3회차 = 금색 / 3회차 초과 = 홀로그램 무늬"
//
// **회차는 따로 저장하지 않습니다.** 그 아이(= 종이 번호 하나)가 만든 곤충 개수가 곧 회차입니다.
// 카드에 박힌 QR 을 찍으면 원래 번호로 돌아오므로, 몇 번을 다시 와도 같은 아이로 이어집니다.
// → 컬럼을 새로 만들 필요가 없어 마이그레이션 위험이 0 입니다.

export type CardTier = 'basic' | 'silver' | 'gold' | 'holo' | 'diamond';

export interface CardTierStyle {
  key: CardTier;
  /** 카드 아래에 작게 보여줄 이름 */
  label: string;
  /** 테두리 그라데이션 (CSS background 값) */
  frame: string;
  /** 등급 뱃지 글자색 */
  ink: string;
  /** 무지개 홀로그램 무늬를 덧씌울지 */
  holographic: boolean;
  /** 카드 아래쪽(필살기·능력치) 바탕. 없으면 기본 어두운 바탕 */
  panel?: string;
}

export const CARD_TIERS: Record<CardTier, CardTierStyle> = {
  basic: {
    key: 'basic',
    label: '첫 번째 곤충',
    // 1회차는 일부러 수수하게 둡니다. 2회차 은색이 "달라졌다"고 느껴져야 하기 때문입니다.
    frame: 'linear-gradient(145deg, #3f4a63, #222b3f 45%, #4a5570)',
    ink: '#cbd5e1',
    holographic: false,
  },
  silver: {
    key: 'silver',
    label: '🥈 실버 카드',
    frame: 'linear-gradient(145deg, #f8fafc, #94a3b8 35%, #e2e8f0 55%, #64748b 80%, #f1f5f9)',
    ink: '#1e293b',
    holographic: false,
  },
  gold: {
    key: 'gold',
    label: '🥇 골드 카드',
    frame: 'linear-gradient(145deg, #fff7c2, #d4a017 30%, #fde68a 52%, #b45309 78%, #fef3c7)',
    ink: '#3b2606',
    holographic: false,
    // 금장식 바탕 (5만원 참가권은 첫 카드부터 — 2026-10-01 Jin)
    panel:
      'repeating-linear-gradient(45deg, rgba(253,230,138,0.07) 0 6px, transparent 6px 14px), linear-gradient(180deg, #2a1d06, #120c02)',
  },
  holo: {
    key: 'holo',
    label: '✨ 홀로그램 카드',
    frame:
      'linear-gradient(145deg, #ff8bd1, #8be9ff 22%, #b6ff8b 42%, #fff68b 62%, #ff8b8b 82%, #d18bff)',
    ink: '#2b1240',
    holographic: true,
  },
  // 💎 10만원 참가권 — 첫 카드부터 홀로그램 다이아 (2026-10-01 Jin)
  diamond: {
    key: 'diamond',
    label: '💎 다이아 홀로그램 카드',
    frame:
      'linear-gradient(135deg, #ffffff, #a5f3fc 18%, #c4b5fd 36%, #f0abfc 54%, #bae6fd 72%, #e0f2fe 86%, #ffffff)',
    ink: '#1e1b4b',
    holographic: true,
    panel:
      'repeating-linear-gradient(60deg, rgba(165,243,252,0.08) 0 8px, rgba(240,171,252,0.06) 8px 16px, transparent 16px 24px), linear-gradient(180deg, #13163a, #070a1f)',
  },
};

/**
 * "몇 번째 곤충" 숫자에 **참가 금액**을 섞습니다 (2026-10-01).
 *
 * 화면마다 카드 등급을 `visit` 숫자 하나로 넘기고 있어서, 금액 때문에 바뀌는 등급도
 * 같은 숫자에 실어 보냅니다. 그러면 카드·배틀·랭킹·갤러리를 하나도 안 고치고 다 따라옵니다.
 *   - 5만원(골드)  → 첫 곤충부터 최소 금색(3). 4번째부터는 원래대로 홀로그램.
 *   - 10만원(다이아) → 항상 다이아(DIAMOND_VISIT).
 */
export const DIAMOND_VISIT = 100;

export function effectiveVisit(visit: number, cardStyle: 'normal' | 'gold' | 'diamond'): number {
  if (cardStyle === 'diamond') return DIAMOND_VISIT;
  if (cardStyle === 'gold') return Math.max(visit, 3);
  return visit;
}

/**
 * 이 아이의 **몇 번째 곤충인지**로 카드 등급을 정합니다.
 *
 * @param visit 1이면 첫 곤충, 2면 두 번째… (그 아이가 만든 곤충 개수)
 *
 * Jin 이 정한 규칙 그대로입니다: 2회차 은색, 3회차 금색, **3회차를 넘으면** 홀로그램.
 * 즉 4회차부터가 홀로그램입니다.
 */
export function tierForVisit(visit: number, level?: number | null): CardTierStyle {
  const byVisit = visitTier(visit);
  // 🆙 레벨 테두리 (10/4 Jin): LV3 은색 · LV5 금색 · LV7 다이아 — 회차·참가권 등급과 비교해 **더 높은 쪽**
  const byLevel = levelTier(level);
  return TIER_RANK[byLevel.key] > TIER_RANK[byVisit.key] ? byLevel : byVisit;
}

function visitTier(visit: number): CardTierStyle {
  if (!Number.isFinite(visit) || visit <= 1) return CARD_TIERS.basic;
  if (visit === 2) return CARD_TIERS.silver;
  if (visit === 3) return CARD_TIERS.gold;
  if (visit >= DIAMOND_VISIT) return CARD_TIERS.diamond;
  return CARD_TIERS.holo;
}

const TIER_RANK: Record<CardTier, number> = { basic: 0, silver: 1, gold: 2, holo: 3, diamond: 4 };

/** 레벨로 정해지는 테두리 — LV3 이상 은색, LV5 이상 금색, LV7 이상 다이아 (10/4 Jin) */
export const LEVEL_FRAME = { silver: 3, gold: 5, diamond: 7 };
export function levelTier(level: number | null | undefined): CardTierStyle {
  const lv = Number(level) || 1;
  if (lv >= LEVEL_FRAME.diamond) return CARD_TIERS.diamond;
  if (lv >= LEVEL_FRAME.gold) return CARD_TIERS.gold;
  if (lv >= LEVEL_FRAME.silver) return CARD_TIERS.silver;
  return CARD_TIERS.basic;
}

/** ✨ 테두리에 빛이 흐르는지 — 은색 이상은 전부 반짝 (10/4 Jin "은색 반짝이게") */
export function frameShines(tier: CardTierStyle): boolean {
  return tier.key !== 'basic';
}
