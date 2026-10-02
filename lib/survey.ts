// 선물 목록과 설문 문항을 한곳에 모아둡니다.
// 화면 / 구글 시트 / 인쇄용 종이가 모두 이 파일을 보고 같은 값을 쓰도록 하기 위함입니다.
// 내용을 바꾸고 싶으면 이 파일만 고치면 됩니다.

export interface PrizeOption {
  key: string;
  label: string;
  emoji: string;
}

// "받고 싶은 상품" 선택지 (2026-10-02 밤 Jin 이 새로 정한 랭킹 시상에 맞춤 — 카톡 채널 안내 글과 같음).
// 위에서부터 높은 순위의 상품. 순위별 상품표는 RANKING_REWARDS.
export const PRIZES: PrizeOption[] = [
  { key: 'stag_breeding', label: '왕사슴벌레 암수 산란 사육세트', emoji: '🪲' },
  { key: 'pair_kit', label: '왕사슴벌레 or 장수풍뎅이 한 쌍 사육세트', emoji: '🦏' },
  { key: 'single_kit', label: '사슴벌레 or 장수풍뎅이 한 마리 사육세트', emoji: '🐞' },
  { key: 'larva_kit', label: '사슴벌레 or 장수풍뎅이 애벌레 사육세트', emoji: '🐛' },
  { key: 'collect_ticket', label: '야외 곤충 채집 체험권', emoji: '🌲' },
  { key: 'jelly', label: '곤충 젤리', emoji: '🍯' },
];

/** 순위별 시상 (10/3~4 이틀 합산) — Jin 의 카톡 채널 안내 글 그대로. /guide 에 보여준다. */
export const RANKING_REWARDS: { rank: string; emoji: string; text: string }[] = [
  { rank: '1위', emoji: '🥇', text: '왕사슴벌레 암수 산란 사육세트 + 우승자 업적 뱃지 + 시즌1 우승자 버프 (시즌2에서 사용 가능) + 야외 곤충 채집 체험권 5회' },
  { rank: '2위', emoji: '🥈', text: '왕사슴벌레 or 장수풍뎅이 한 쌍 사육세트 + 준우승자 업적 뱃지 + 시즌1 준우승자 버프 (시즌2에서 사용 가능) + 야외 곤충 채집 체험권 3회' },
  { rank: '3~5위', emoji: '🥉', text: '사슴벌레 or 장수풍뎅이 한 마리 사육세트 (암수 선택) + 순위권 업적 뱃지 + 시즌1 순위권 버프 (시즌2에서 사용 가능) + 야외 곤충 채집 체험권 1회' },
  { rank: '6~10위', emoji: '🏅', text: '사슴벌레 or 장수풍뎅이 애벌레 사육세트 + 10위권 업적 뱃지 + 시즌1 10위권 버프 (시즌2에서 사용 가능)' },
  { rank: '11~30위', emoji: '🎖️', text: '곤충 젤리 + 아차상 업적 뱃지 + 시즌1 아차상 버프 (시즌2에서 사용 가능)' },
  { rank: '31~100위', emoji: '⭐', text: '100위권 업적 뱃지 + 시즌1 100위권 버프 (시즌2에서 사용 가능)' },
];

// 좋아하는 곤충 선택지. 목록에 없으면 '기타'를 눌러 직접 적을 수 있습니다.
export const FAVORITE_INSECTS: string[] = [
  '장수풍뎅이',
  '왕사슴벌레',
  '사슴벌레',
  '나비',
  '잠자리',
  '무당벌레',
  '개미',
  '메뚜기',
  '반딧불이',
  '매미',
];

export const OTHER_INSECT_KEY = '기타';

// 3번 질문이 "채집 체험 해보고 싶어?" → "같이 갈래?"로 바뀌면서 (2026-09-30 Jin)
// 답도 거기에 맞췄습니다. '이미 해봤어'는 "같이 갈래?"의 대답이 안 되기 때문입니다.
export const COLLECTING_QUESTION =
  '여름엔 야간 곤충채집, 봄가을겨울엔 애벌레 채집 떠날건데 같이갈래?';
export const COLLECTING_OPTIONS: string[] = ['응, 같이 갈래!', '생각해볼게', '아니'];

export const GAME_OPTIONS: string[] = ['응, 재밌겠다!', '잘 모르겠어', '아니'];

export interface SurveyAnswers {
  favoriteInsect: string;
  wantsCollecting: string;
  wantsGame: string;
}

export function prizeLabel(key: string | null | undefined): string {
  if (!key) return '';
  return PRIZES.find((prize) => prize.key === key)?.label ?? key;
}
