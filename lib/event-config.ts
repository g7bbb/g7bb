// 🏙️ 행사(시즌) 나누기 (2026-11-20, 인천 행사 준비)
//
// 대전 행사 기록은 **지우지 않는다** (2만원 아이들에게 "캐릭터 보존" 을 약속했다).
// 대신 랭킹·배틀 상대·순위판·TOP3·승리 팁·갤러리·심사는 **이번 행사 시작 날짜 이후** 기록만 본다.
// 그래야 인천 아이들이 레벨 높은 대전 1~3위를 상대로 시작하지 않는다.
//
// 다음 행사 때는 CURRENT_EVENT 의 이름·날짜만 바꾸고, 지금 것을 PAST_EVENT 로 옮기면 된다.
// 날짜는 UTC 로 적는다 (한국 시간 0시 = 전날 15:00Z).

export interface EventInfo {
  /** 화면에 쓰는 정식 이름 */
  name: string;
  /** 짧은 이름 (뱃지·작은 글씨) */
  short: string;
  /** 이 시각부터의 기록 (ISO, UTC) */
  from: string;
  /** 이 시각 전까지의 기록 (없으면 지금까지) */
  to?: string;
}

/** 지난 행사 — 순위표 옆 "대전 1~10위" 에 쓴다 */
export const PAST_EVENT: EventInfo = {
  name: '2026 대전 곤충박람회',
  short: '대전',
  from: '2026-10-02T15:00:00Z', // 10/3 0시 (한국)
  to: '2026-10-05T15:00:00Z', // 10/6 0시 (한국)
};

/**
 * 이번 행사.
 * ⚠️ 이름은 Jin 이 정식 이름을 주면 바꿀 것. Vercel 환경변수 `NEXT_PUBLIC_EVENT_NAME` 으로도 덮을 수 있다.
 * 시작 시각은 리허설(11/20)부터 — 그 전 기록(대전·개발 테스트)은 이번 랭킹에 안 들어간다.
 * 테스트 번호(900번대)는 원래 따로 노니까 리허설 기록이 진짜 랭킹에 섞이지는 않는다.
 */
export const CURRENT_EVENT: EventInfo = {
  name: process.env.NEXT_PUBLIC_EVENT_NAME || '2026 인천 G7BB 배틀',
  short: '인천',
  from: process.env.NEXT_PUBLIC_SEASON_FROM || '2026-11-19T15:00:00Z', // 11/20 0시 (한국)
};

/** 이번 행사 기록만 쓰는 기준 시각 (supabase `.gte('created_at', SEASON_FROM)`) */
export const SEASON_FROM = CURRENT_EVENT.from;

/** 이 시각(created_at)의 행사 — 이번 행사 시작 전이면 지난 행사(대전). 뱃지·포스터 꼬리에 쓴다. */
export function eventFor(createdAt: string | null | undefined): EventInfo {
  if (!createdAt) return CURRENT_EVENT;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t < Date.parse(SEASON_FROM) ? PAST_EVENT : CURRENT_EVENT;
}

/** 이 시각(created_at)이 이번 행사 안인가 */
export function inSeason(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && t >= Date.parse(SEASON_FROM);
}
