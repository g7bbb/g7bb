// 🤖 연습 곤충 (2026-10-03 Jin: "배틀할 사람이 없는 첫 접속자는 가상의 곤충들을 띄워서 배틀하게 해줘")
//
// 상대가 3마리(랭킹 도전 칸 수)보다 적으면 **모자란 만큼만** 이 곤충들로 채운다.
// 진짜 아이들이 곤충을 만들면 자연스럽게 밀려나서 안 보이게 된다.
//
// - DB 에 없다 (코드에만 있다). 그래서 랭킹·갤러리·심사에는 절대 안 나온다.
// - 그림은 `public/bots/` (예전 테스트 때 AI 가 만든 그림).
// - 능력치는 "보통 곤충" (전부 3점 · 1년충 · LV1). 이기고 지는 건 진짜 배틀과 같은 규칙.
// - 이기면 내 점수·경험치는 그대로 남는다 (첫 아이도 랭킹에 올라가야 하니까).
//   대신 "1위를 쓰러뜨렸다"·곤충 도장 깨기 뱃지는 안 준다 (가짜 상대라서).
import { Insect } from './types';

export const BOT_PLAYER_ID = 'bot';

const AVERAGE = { head: 3, legs: 3, armor: 3, wings: 3, eyes: 3, instinct: 3, genetics: 3 };

function bot(id: string, nickname: string, species: string, origin: Insect['origin'], image: string): Insect {
  return {
    id,
    player_id: BOT_PLAYER_ID,
    nickname,
    species,
    origin,
    age_stage: 'yearling',
    body_parts: { ...AVERAGE },
    mutations: null,
    image_base64: '',
    mime_type: 'image/jpeg',
    image_url: image,
    stats: {} as Insect['stats'], // 능력치는 statsForInsect 가 body_parts 로 다시 계산한다
    level: 1,
    xp: 0,
    battle_count: 0,
    created_at: '2026-10-03T00:00:00.000Z',
  };
}

/** 채우는 순서대로 (첫 번째가 제일 먼저 들어간다) */
export const BOT_INSECTS: Insect[] = [
  bot('bot-stag', '숲지기 사슴이', '사슴벌레', 'meteor', '/bots/stag.jpg'),
  bot('bot-butterfly', '꽃밭 팔랑이', '나비', 'water', '/bots/butterfly.jpg'),
  bot('bot-mantis', '풀숲 사마', '사마귀', 'highland', '/bots/mantis.jpg'),
];

// ── 👹 중간보스 (2026-10-03 Jin: "기본 배틀 횟수 말고 갑자기 나타나는 이벤트. 여러 곤충을 합성한 생김새,
//    곤충들보다 아주 조금 셈. 등장 확률 45%") ───────────────────────────────────────────
//
// - 랭킹 도전(1게임)을 시작할 때 한 번 굴려서 45% 면, 1판 또는 2판이 끝난 뒤 **갑자기** 나타난다.
//   랭킹 도전 3판에는 안 센다(덤 배틀). 연습 게임에는 안 나온다.
// - 레벨은 **내 곤충과 같게** 맞춘다 → 몇 회차든 "살짝 센 상대".
// - 세기: 보통 곤충(전부 3점) + HP·수비 ×1.06. 시뮬레이션(scratchpad bosssim.ts, 같은 레벨 아이 무작위):
//   아이가 ⚡를 그냥 누르면(발동) 보스가 약 55% · 굿 이상이면 아이가 이길 때가 더 많다.
//   (보통 곤충이면 48% · 37%) — 숫자는 BOSS_PERKS 하나만 고치면 된다.
// - 기술은 사마귀 것(당랑권, 공격형)을 쓴다. 생김새는 잠자리 날개 + 사마귀 앞발 + 벌 꼬리.
// - 이기면 경험치는 보통 배틀처럼 받는다. **랭킹 점수(battles)는 안 남긴다** (보스를 이긴 점수로 순위가 흔들리지 않게).
export const BOSS_ID = 'bot-boss';
export const BOSS_CHANCE = 0.45;
export const BOSS_PERKS = { hp: 1.06, def: 1.06, special: 1 };

export function makeBoss(level: number): Insect {
  return {
    ...bot(BOSS_ID, '👹 합체곤충 키메라', '사마귀', 'meteor', '/bots/boss.jpg'),
    species_label: '합성 곤충 · 잠자리+사마귀+벌',
    level: Math.max(1, level),
  };
}

export function isBotId(id: string | null | undefined): boolean {
  return !!id && id.startsWith('bot-');
}

export function findBot(id: string): Insect | null {
  return BOT_INSECTS.find((b) => b.id === id) ?? null;
}

/** 곤충 그림 주소 — 연습 곤충은 파일, 진짜 곤충은 저장된 base64 */
export function insectImageSrc(insect: Pick<Insect, 'image_base64' | 'mime_type' | 'image_url'>): string {
  return insect.image_url || `data:${insect.mime_type || 'image/jpeg'};base64,${insect.image_base64}`;
}
