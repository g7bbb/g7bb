// 🪄 "그림 → AI 곤충" 변신 쇼 (2026-11-21 인천 행사 중 Jin: "순위판에서 스케치가 AI 곤충이 되는 걸로 눈길을 끌자.
//    실시간 저장 없이, 내가 보내주는 스케치·변환 사진으로 계속 틀어주자")
//
// - 그림은 **Jin 이 직접 골라 보낸 짝**만 쓴다 (앱은 아이 그림 사진을 저장하지 않는다 — 개인정보).
// - 짝을 더하려면 public/show/ 에 두 장을 넣고 아래 목록에 한 줄 추가.
// - 보여주는 곳: /show (모니터에 하루 종일 틀어두는 용) · /live 순위판 (1분마다 한 번씩 끼워 넣음)

export interface ShowPair {
  /** 아이가 그린 스케치 사진 */
  sketch: string;
  /** AI 가 바꿔준 곤충 그림 */
  ai: string;
  /** 곤충 이름 (없으면 종류를 이름처럼 쓴다) */
  name?: string;
  /** 곤충 종류 — 배틀 장면 카드·필살기에 쓴다 */
  species: string;
  /** 그림 가로 ÷ 세로 (AI 그림 기준, 없으면 1 = 정사각형). 화면 칸 모양을 여기에 맞춘다 */
  ratio?: number;
}

/** Jin 이 보낸 짝 (11/21). 스케치는 옆으로 누운 폰 사진이라 세우고 그림 칸만 잘랐다 (회색 종이 → 흰색으로 밝게). */
export const SHOW_PAIRS: ShowPair[] = [
  { sketch: '/show/sketch-1.jpg', ai: '/show/ai-1.jpg', ratio: 1024 / 559, species: '장수풍뎅이', name: '빨간 장수풍뎅이' },
  { sketch: '/show/sketch-2.jpg', ai: '/show/ai-2.jpg', ratio: 1024 / 768, species: '사슴벌레', name: '황금 사슴벌레' },
];

/**
 * 🔁 11/21 Jin: "스케치랑 완성 그림을 한 화면에 (모니터가 커서)" + "마지막에 바뀐 그림끼리 배틀하는 영상"
 * 한 짝: 스케치만 1.6초 → 오른쪽이 번쩍 0.8초 → 둘이 나란히 4초. 짝을 다 보여준 뒤 1번 vs 2번 배틀 9초.
 */
// 🔁 11/21 Jin "1.5배 빠르게" → 전부 ÷1.5 (1600·800·4000 → 1070·530·2670, 배틀 9.5초 → 6.3초)
export const SHOW_SPEED = 1.5;
export const SHOW_SKETCH_MS = 1070;
export const SHOW_FLASH_MS = 530;
export const SHOW_AI_MS = 2670;
export const SHOW_PAIR_MS = SHOW_SKETCH_MS + SHOW_FLASH_MS + SHOW_AI_MS;
/** 마지막 배틀 장면 (app/attract BattleScene 그대로 — 7.3초에 승리) */
export const SHOW_BATTLE_MS = Math.round(9500 / SHOW_SPEED);
/**
 * ✍️ 맨 끝 10초 — "AI 프롬프트 쓰는 연습" (11/21 Jin 문구). 생김새 칸에 글을 쓰는 모습 → 그 그림.
 * 예시 글은 2번 그림(번개 대포·무지개 날개)에 맞췄다.
 */
export const SHOW_PROMPT_MS = 10000;
export const SHOW_PROMPT_TEXT = '등에 번개 대포를 달고, 무지개 날개로 날아다녀! ⚡🌈';
export const SHOW_PROMPT_IMAGE = '/show/ai-2.jpg';
/**
 * 👩‍👧 맨 마지막 8초 — 보호자용 "AI 창작 3단계" (11/21 Jin: 게임·배틀보다 AI 교육·프롬프트 연습으로 보이게).
 * 세 단계 모두 앱에 실제로 있는 것만 (그리기 · 생김새 설명 칸 · 다시 만들기 2번). 없는 걸 교육이라고 적지 말 것.
 */
export const SHOW_EDU_MS = 8000;
export const SHOW_EDU_STEPS = [
  { icon: '🖍️', title: '상상을 그림으로', desc: '종이에 나만의 곤충을 직접 그려요' },
  { icon: '✍️', title: '생각을 말로 정확하게', desc: '색깔·효과·위치를 글로 설명해요 (AI 프롬프트)' },
  { icon: '🔁', title: '결과를 보고 다시 요청', desc: '마음에 안 들면 설명을 고쳐서 다시 만들어요' },
];
export const SHOW_EDU_TAGLINE = 'AI에게 원하는 걸 정확히 말하는 힘, 놀이로 연습해요';
/** 한 바퀴 = 짝 전부 + 배틀 + 프롬프트 + 3단계 */
export const SHOW_CYCLE_MS =
  SHOW_PAIRS.length * SHOW_PAIR_MS + (SHOW_PAIRS.length >= 2 ? SHOW_BATTLE_MS : 0) + SHOW_PROMPT_MS + SHOW_EDU_MS;
