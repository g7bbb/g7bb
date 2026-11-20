// ─────────────────────────────────────────────────────────────
// 참가 금액(등급) — 2026-10-01 Jin 확정
//
// **앱은 아이가 얼마를 냈는지 알 방법이 종이 번호밖에 없다.** 그래서 번호 앞 글자로 구분한다.
//   A-001 → 1.5만원(10/4 전엔 1만원) / B-001 → 2만원(10/3 밤 전엔 3만원) / C-001 → 5만원 / D-001 → 10만원
// 종이를 금액별로 따로 뽑아서, 부스에서 돈을 받고 그 금액의 종이를 건네주면 된다.
// (`/print` 에서 금액을 고르면 그 글자부터 뽑힌다.)
//
// 🔁 **2026-10-01 바뀜 (Jin: "가격마다 종이를 따로 인쇄해야 해? 더 편한 방법은?")**
// 종이는 **한 종류(A, 1.5만원)만** 뽑고, 2만원 이상 낸 아이만 **직원이 `/admin/tier` 에서 올려준다.**
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
  /** 게임 수 대신 보여줄 말 (10/4 Jin: 1.5만원은 "1게임", 2만원은 "9판" 으로 부른다) */
  label?: string;
  /**
   * 🎲 랭킹 도전 한 게임에 중간보스·보너스 스테이지가 나올 확률 (lib/bonus-stage.ts `planLadderEvent`).
   * 10/4 Jin: 1.5만원 15% · 2만원 이상 **무조건**(1).
   */
  eventChance: number;
  /** 🎁 첫 이벤트는 무조건 "레벨 1 업" 보너스 스테이지 (한 번) — 2만원 이상 (10/4 Jin "레벨업 보너스게임 1회 무조건!") */
  levelUpOnce?: boolean;
  /**
   * ⏩ 30분 대기 없이 **연달아** 다음 게임 — 2만원 이상 (10/4 Jin "한 번에 연달아 다 할 수 있게, 로그아웃됐다 다시 와도 연달아").
   * 3판이 끝나면 '게임 끝' 로그아웃 대신 "다음 게임 바로!" 버튼이 뜨고, QR 로 다시 와도 기다림 없이 다음 게임.
   */
  continuous?: boolean;
  /** 🎁 매 게임 보너스 스테이지(보물상자)가 무조건 — 중간보스 대신 (11/20 Jin: 10만원 "매회 보너스게임") */
  bonusAlways?: boolean;
}

// 🔁 2026-10-02 밤 Jin (카톡 채널 안내 글과 맞춤): 3만원 2 → **3게임**, 5만원 2일간 5 → **첫날 하루 6게임**.
// 🔁 2026-10-03 밤 Jin: **3만원권 → 2만원권** (게임 수 3게임 그대로) + "앱이 나오면 데이터 보존".
//    1만원은 그대로 1게임인데 **데이터 보존 안 함**을 안내에 적는다. 5만·10만원은 그대로.
//    ⚠️ 이미 B(3만원)로 올려준 아이는 표시만 2만원으로 바뀌고 게임 수(3)는 같다.
// 🔁 2026-10-04 아침 Jin: "5만원 이상은 거의 안 써서, 초반 가격을 1.5만원·2만원으로 단순하게 하고 2만원을 고르게 만들 것".
//    1.5만원(A) = 1게임(3판) + 보너스 게임(가끔, 15%) · 데이터 보존 안 됨
//    2만원(B)   = 9판(= 3게임) + 레벨업 보너스 게임 1회 무조건 + 매 게임 중간보스/보너스 하나는 무조건 · 앱에서 캐릭터 보존
//    5만·10만원 혜택 그대로 (이벤트는 2만원처럼 무조건 — 2만원보다 덜 주면 안 되니까).
export const TIERS: Record<TierKey, Tier> = {
  // 🔁 2026-11-20 인천 Jin: 5천원 3판 · 1만원 하루 9판 · 10만원 무제한(매회 보너스). 5만원은 안 판다(옛 C 아이 표시용으로만 남김).
  A: {
    key: 'A',
    price: '5천원',
    name: '참가권',
    emoji: '🎟️',
    games: 1,
    label: '3판',
    eventChance: 0.15,
    card: 'normal',
    perks: ['3판 (1게임)', '앱에서 사용 불가능', '내 곤충 카드 제작'],
  },
  B: {
    key: 'B',
    price: '1만원',
    name: '레벨업권',
    emoji: '⬆️',
    games: 3,
    oneDay: true,
    label: '하루 9판',
    eventChance: 1,
    levelUpOnce: true,
    continuous: true,
    card: 'normal',
    perks: [
      '9판 (3게임, 그날 하루)',
      '레벨업 보너스게임 (무조건 발동!!)',
      '앱에서 캐릭터 이용 가능 ⭐',
      '내 곤충 카드 제작',
      '전국 곤충채집 1회 체험권',
    ],
  },
  C: {
    key: 'C',
    price: '5만원',
    name: '골드',
    emoji: '🥇',
    games: 6,
    oneDay: true,
    eventChance: 1,
    levelUpOnce: true,
    continuous: true,
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
    label: '게임 무제한',
    eventChance: 1,
    levelUpOnce: true,
    continuous: true,
    bonusAlways: true,
    card: 'diamond',
    perks: [
      '게임 무제한',
      '매회 보너스게임',
      '내 곤충 고급 포스터·고급 피규어 제작',
      '홀로그램 카드 제작',
      '앱에서 시즌1 버프 획득',
      '전국 곤충채집 5회 체험권',
    ],
  },
};

export const TIER_ORDER: TierKey[] = ['A', 'B', 'C', 'D'];
/** 지금 파는 참가권 (직원 화면·안내·인쇄 버튼) — 11/20 인천부터 5만원(C)은 안 판다. 옛 C 아이는 표시만 그대로. */
export const SELL_ORDER: TierKey[] = ['A', 'B', 'D'];

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

/** 1게임 = 랭킹 도전 3판 (10/3 Jin: "1만원 1게임 = 3판, 3만원(→ 밤에 2만원) 3게임 = 9판") */
export const ROUNDS_PER_GAME = 3;

export function gamesLabel(tier: Tier): string {
  if (tier.label) return tier.label;
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
