// 게임 이름과 로고를 한곳에 모아둡니다 (2026-09-30, Jin 요청).
// 이름이 바뀌면 이 파일만 고치면 브라우저 탭·홈 화면 아이콘·각 화면 제목에 퍼집니다.

export const GAME_NAME = '꾸러기 G7BB 배틀';
export const GAME_TITLE = `${GAME_NAME} (베타)`;

/**
 * 로고 그림 경로.
 *
 * ⚠️ **원본 로고는 검은색**인데 앱 바탕이 거의 검정(`#020617`)이라 그대로 얹으면 안 보입니다.
 * 그래서 색만 뒤집은 흰색 판을 따로 만들어 두었습니다.
 * - 앱 화면(어두운 바탕) → `white`
 * - 인쇄 종이(흰 바탕) → `black`
 *
 * `logo` = 마스코트 + "곤충본부" 글씨까지 전체, `mark` = 마스코트만 (버튼 안 같은 작은 자리).
 * 파일은 `public/brand/` 에 있습니다.
 */
export const BRAND = {
  logo: { white: '/brand/logo-white.png', black: '/brand/logo-black.png' },
  mark: { white: '/brand/mark-white.png', black: '/brand/mark-black.png' },
} as const;
