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

export type CardTier = 'basic' | 'silver' | 'gold' | 'holo';

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
    label: '🥈 실버 카드 · 2회차',
    frame: 'linear-gradient(145deg, #f8fafc, #94a3b8 35%, #e2e8f0 55%, #64748b 80%, #f1f5f9)',
    ink: '#1e293b',
    holographic: false,
  },
  gold: {
    key: 'gold',
    label: '🥇 골드 카드 · 3회차',
    frame: 'linear-gradient(145deg, #fff7c2, #d4a017 30%, #fde68a 52%, #b45309 78%, #fef3c7)',
    ink: '#3b2606',
    holographic: false,
  },
  holo: {
    key: 'holo',
    label: '✨ 홀로그램 카드',
    frame:
      'linear-gradient(145deg, #ff8bd1, #8be9ff 22%, #b6ff8b 42%, #fff68b 62%, #ff8b8b 82%, #d18bff)',
    ink: '#2b1240',
    holographic: true,
  },
};

/**
 * 이 아이의 **몇 번째 곤충인지**로 카드 등급을 정합니다.
 *
 * @param visit 1이면 첫 곤충, 2면 두 번째… (그 아이가 만든 곤충 개수)
 *
 * Jin 이 정한 규칙 그대로입니다: 2회차 은색, 3회차 금색, **3회차를 넘으면** 홀로그램.
 * 즉 4회차부터가 홀로그램입니다.
 */
export function tierForVisit(visit: number): CardTierStyle {
  if (!Number.isFinite(visit) || visit <= 1) return CARD_TIERS.basic;
  if (visit === 2) return CARD_TIERS.silver;
  if (visit === 3) return CARD_TIERS.gold;
  return CARD_TIERS.holo;
}
