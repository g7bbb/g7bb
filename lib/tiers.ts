// ─────────────────────────────────────────────────────────────
// 참가 금액(등급) — 2026-10-01 Jin 확정
//
// **앱은 아이가 얼마를 냈는지 알 방법이 종이 번호밖에 없다.** 그래서 번호 앞 글자로 구분한다.
//   A-001 → 1만원 / B-001 → 3만원 / C-001 → 5만원 / D-001 → 10만원
// 종이를 금액별로 따로 뽑아서, 부스에서 돈을 받고 그 금액의 종이를 건네주면 된다.
// (`/print` 에서 금액을 고르면 그 글자부터 뽑힌다.)
//
// 🔁 **2026-10-01 바뀜 (Jin: "가격마다 종이를 따로 인쇄해야 해? 더 편한 방법은?")**
// 종이는 **한 종류(A, 1만원)만** 뽑고, 3만원 이상 낸 아이만 **직원이 `/admin/tier` 에서 올려준다.**
// 올려준 금액은 `players.survey.game.tier` 에 저장되고, 번호 앞 글자보다 **우선한다** (`tierForPlayer`).
// 금액별로 따로 인쇄하는 방법(`/print?tier=B`)도 그대로 남아 있어서 섞어 써도 된다.
//
// 금액·횟수·혜택을 바꾸려면 이 파일만 고치면 된다.
// ─────────────────────────────────────────────────────────────

export type TierKey = 'A' | 'B' | 'C' | 'D';

/** 카드 바탕 꾸밈 — 5만원은 금장식, 10만원은 홀로그램 다이아 (첫 카드부터) */
export type TierCardStyle = 'normal' | 'gold' | 'diamond';

export interface Tier {
  key: TierKey;
  price: string;
  name: string;
  emoji: string;
  /** 참여할 수 있는 게임 수 (랭킹 도전 1번 = 1게임). 무제한이면 Infinity */
  games: number;
  /** true 면 **첫 게임을 한 날 하루만** 쓸 수 있다 (날짜가 바뀌면 남은 게임이 있어도 끝) — 5만원 (10/2 Jin: 10만원 유도) */
  oneDay?: boolean;
  card: TierCardStyle;
  /** 아이·부모님에게 보여줄 혜택 */
  perks: string[];
}

// 🔁 2026-10-02 밤 Jin (카톡 채널 안내 글과 맞춤): 3만원 2 → **3게임**, 5만원 2일간 5 → **첫날 하루 6게임**.
export const TIERS: Record<TierKey, Tier> = {
  A: {
    key: 'A',
    price: '1만원',
    name: '참가권',
    emoji: '🎟️',
    games: 1,
    card: 'normal',
    perks: ['1게임(3판) 참여', '랭킹 상품 도전', '내 곤충 카드 발급'],
  },
  B: {
    key: 'B',
    price: '3만원',
    name: '레벨업권',
    emoji: '⬆️',
    games: 3,
    card: 'normal',
    perks: ['3게임(9판) 참여', '랭킹 상품 도전', '내 곤충 카드 발급', '다시 참여하면 레벨업'],
  },
  C: {
    key: 'C',
    price: '5만원',
    name: '골드',
    emoji: '🥇',
    games: 6,
    oneDay: true,
    card: 'gold',
    perks: [
      '하루 6게임(18판) 참여',
      '랭킹 상품 도전 (랭킹 선물은 별도)',
      '내 곤충 카드 발급',
      '내 곤충 피규어·포스터 선물 배송',
      '게임 데이터 계속 보관 (시즌1 이후에도 QR만 있으면 참여 가능)',
      '게임 속 금장식 카드 업적',
    ],
  },
  D: {
    key: 'D',
    price: '10만원',
    name: '다이아',
    emoji: '💎',
    games: Infinity,
    card: 'diamond',
    perks: [
      '2일간 무제한 참여',
      '랭킹 상품 도전 (랭킹 선물은 별도)',
      '내 곤충 카드 발급',
      '내 곤충 피규어·포스터 선물 배송',
      '홀로그램 카드 선물 배송',
      '게임 데이터 계속 보관 (시즌1 이후에도 QR만 있으면 참여 가능)',
      '4분기(10~12월) 전국 곤충체험 실내·실외 2회 참여권',
      '게임 속 홀로그램 다이아 카드 업적',
    ],
  },
};

export const TIER_ORDER: TierKey[] = ['A', 'B', 'C', 'D'];

/**
 * 종이 번호 → 등급. 번호 앞 글자로 정한다.
 * 모르는 글자(E 이후, 옛 테스트 번호 등)는 **가장 낮은 1만원**으로 본다 —
 * 더 많이 주는 쪽으로 틀리면 공짜로 게임을 더 하게 되기 때문이다.
 */
export function tierForTicket(ticket: string | null | undefined): Tier {
  const letter = (ticket ?? '').trim().toUpperCase().charAt(0) as TierKey;
  return TIERS[letter] ?? TIERS.A;
}

/** `/print` 에서 이 등급 종이를 뽑기 시작할 위치. `ticketAt` 은 999장마다 글자가 바뀐다. */
export function tierStartIndex(key: TierKey): number {
  return TIER_ORDER.indexOf(key) * 999;
}

/** 1게임 = 랭킹 도전 3판 (10/3 Jin: "1만원 1게임 = 3판, 3만원 3게임 = 9판") */
export const ROUNDS_PER_GAME = 3;

export function gamesLabel(tier: Tier): string {
  if (!Number.isFinite(tier.games)) return '무제한';
  const rounds = `(${tier.games * ROUNDS_PER_GAME}판)`;
  return tier.oneDay ? `하루 ${tier.games}게임 ${rounds}` : `${tier.games}게임 ${rounds}`;
}

/**
 * 이 아이의 참가권. **직원이 올려준 금액이 있으면 그게 우선**이고, 없으면 종이 번호 앞 글자.
 * (`players.survey.game.tier`, lib/game-state.ts)
 */
export function tierForPlayer(player: { ticket_code?: string | null; survey?: unknown } | null | undefined): Tier {
  const override = (player?.survey as any)?.game?.tier as TierKey | undefined;
  if (override && TIERS[override]) return TIERS[override];
  return tierForTicket(player?.ticket_code);
}
