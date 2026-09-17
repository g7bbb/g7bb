// 선물 목록과 설문 문항을 한곳에 모아둡니다.
// 화면 / 구글 시트 / 인쇄용 종이가 모두 이 파일을 보고 같은 값을 쓰도록 하기 위함입니다.
// 내용을 바꾸고 싶으면 이 파일만 고치면 됩니다.

export interface PrizeOption {
  key: string;
  label: string;
  emoji: string;
}

// 배틀 랭킹 / 예쁜 곤충 랭킹 시상에 쓰이는 선물 5종.
export const PRIZES: PrizeOption[] = [
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

export const COLLECTING_OPTIONS: string[] = ['응, 꼭 해보고 싶어!', '그냥 그래', '이미 해봤어'];

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
