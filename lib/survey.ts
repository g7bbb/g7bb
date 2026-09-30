// 선물 목록과 설문 문항을 한곳에 모아둡니다.
// 화면 / 구글 시트 / 인쇄용 종이가 모두 이 파일을 보고 같은 값을 쓰도록 하기 위함입니다.
// 내용을 바꾸고 싶으면 이 파일만 고치면 됩니다.

export interface PrizeOption {
  key: string;
  label: string;
  emoji: string;
}

// 배틀 랭킹 / 예쁜 곤충 랭킹 시상에 쓰이는 선물 6종. 위에서부터 높은 등수의 상품입니다.
export const PRIZES: PrizeOption[] = [
  { key: 'poster_figure', label: '내 곤충 포스터 + 소형 피규어 제작', emoji: '🏆' },
  { key: 'stag_kit', label: '왕사슴벌레 사육세트', emoji: '🪲' },
  { key: 'rhino_kit', label: '장수풍뎅이 사육세트', emoji: '🦏' },
  { key: 'collect_ticket', label: '사슴벌레 & 장수풍뎅이 채집 체험권', emoji: '🎟️' },
  { key: 'larva_kit', label: '사슴벌레 애벌레 사육세트', emoji: '🐛' },
  { key: 'drawing_set', label: '그림그리기 세트', emoji: '🎨' },
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
