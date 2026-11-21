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
  /** 곤충 이름 (없으면 안 씀) */
  name?: string;
  /** 그림 가로 ÷ 세로 (AI 그림 기준, 없으면 1 = 정사각형). 화면 칸 모양을 여기에 맞춘다 */
  ratio?: number;
}

/** Jin 이 보낸 짝 (11/21). 스케치는 옆으로 누운 폰 사진이라 세우고 그림 칸만 잘랐다 (회색 종이 → 흰색으로 밝게). */
export const SHOW_PAIRS: ShowPair[] = [
  { sketch: '/show/sketch-1.jpg', ai: '/show/ai-1.jpg', ratio: 1024 / 559 },
  { sketch: '/show/sketch-2.jpg', ai: '/show/ai-2.jpg', ratio: 1024 / 768 },
];

/** 한 마리 보여주는 시간 (스케치 2.4초 → 번쩍 0.8초 → AI 곤충 3.6초) */
export const SHOW_SKETCH_MS = 2400;
export const SHOW_FLASH_MS = 800;
export const SHOW_AI_MS = 3600;
export const SHOW_PAIR_MS = SHOW_SKETCH_MS + SHOW_FLASH_MS + SHOW_AI_MS;
