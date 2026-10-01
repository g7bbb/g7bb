// 그림 꾸미기 — 색깔 / 느낌 (2026-09-18 추가)
//
// 왜 필요한가:
// 아이가 금색 사슴벌레를 그렸는데 AI가 검은색으로 그려버리면 "내 거랑 다른데?"가 됩니다.
// 이 체험의 핵심은 "내가 그린 곤충이 살아나는 것"이라, 색이 달라지는 건 치명적입니다.
// 연필로만 그린 아이도 많을 텐데, 그런 그림에서는 AI가 색을 알 수 없습니다.
//
// **둘 다 고르지 않아도 됩니다.** 안 고르면 AI가 아이 그림에 있는 색과 분위기를 그대로 따릅니다.
// 종이에서도 "안 골라도 돼"라고 적어둡니다.
//
// 능력치에는 전혀 영향을 주지 않습니다. 순수하게 그림만 바뀝니다.
// (배틀 밸런스를 건드리지 않으려고 일부러 이렇게 뒀습니다.)

export interface AppearanceOption {
  key: string;
  label: string;
  // 이미지 생성 AI에게 넘길 문장
  prompt: string;
}

export const COLORS: AppearanceOption[] = [
  { key: 'black', label: '검정', prompt: '몸 전체를 광택 있는 검은색으로 칠해라.' },
  { key: 'brown', label: '갈색', prompt: '몸 전체를 짙은 갈색으로 칠해라.' },
  { key: 'red', label: '빨강', prompt: '몸 전체를 선명한 빨간색으로 칠해라.' },
  { key: 'blue', label: '파랑', prompt: '몸 전체를 선명한 파란색으로 칠해라.' },
  { key: 'green', label: '초록', prompt: '몸 전체를 선명한 초록색으로 칠해라.' },
  { key: 'purple', label: '보라', prompt: '몸 전체를 진한 보라색으로 칠해라.' },
  {
    key: 'gold',
    label: '금색',
    prompt: '몸 전체를 금속처럼 반짝이는 황금색으로 칠해라.',
  },
  {
    key: 'rainbow',
    label: '무지개',
    prompt: '몸에 무지개처럼 여러 색이 자연스럽게 어우러지도록 칠해라.',
  },
];

// 느낌별 연출 — 2026-10-01 Jin 디렉션 그대로.
//   그냥        기본 곤충과 가장 흡사하게 (실사 100%)
//   무섭게      살짝 흔들리는 연출, 돌·불똥이 튀는 연출, 턱·발톱이 앞으로 튀어나올 것처럼
//   멋있게·빛나게 곤충 외곽선이 은은하게 빛나게
//   귀엽게      실사 50% + 만화·웹툰 50% (다른 느낌은 실사 100% · 만화 0%)
export const MOODS: AppearanceOption[] = [
  {
    key: 'scary',
    label: '무섭게',
    prompt:
      '[무섭게] 실사 100%. 화면이 살짝 흔들리는 듯한 모션 블러 연출과, 주변에 돌 조각과 불똥이 튀는 연출을 넣어라. ' +
      '큰턱이나 발톱이 화면 앞(보는 사람 쪽)으로 튀어나올 것처럼 원근감 있게 표현해라.',
  },
  {
    key: 'cool',
    label: '멋있게',
    prompt: '[멋있게] 실사 100%. 당당하고 영웅적인 자세로, 곤충의 외곽선(몸 테두리)이 은은하게 빛나게 그려라.',
  },
  {
    key: 'cute',
    label: '귀엽게',
    prompt:
      '[귀엽게] 실사 50% + 만화·웹툰 그림체 50% 로 섞어라. 곤충의 생김새는 알아볼 수 있게 유지하면서 ' +
      '둥글고 친근한 형태, 밝고 부드러운 색감으로 귀엽게 그려라.',
  },
  {
    key: 'shiny',
    label: '빛나게',
    prompt: '[빛나게] 실사 100%. 곤충의 외곽선(몸 테두리)이 은은하게 빛나고, 주위에 작은 빛 입자가 흩날리게 그려라.',
  },
];

// 아무것도 고르지 않았을 때 ("그냥") — 기본 곤충과 가장 흡사하게.
const DEFAULT_MOOD_PROMPT = '[그냥] 실사 100%. 그 종류의 실제 곤충과 가장 흡사하게, 자연스러운 자세로 그려라.';

export function findAppearance(
  options: AppearanceOption[],
  value: string | null | undefined
): AppearanceOption | null {
  if (!value) return null;
  const trimmed = value.trim();
  return (
    options.find((item) => item.key === trimmed) ??
    options.find((item) => item.label === trimmed) ??
    null
  );
}

/** 이미지 생성 프롬프트에 붙일 한 덩어리를 만듭니다. */
export function appearancePrompt(
  color: string | null | undefined,
  mood: string | null | undefined
): string {
  const matchedColor = findAppearance(COLORS, color);
  const matchedMood = findAppearance(MOODS, mood);

  const colorText = matchedColor
    ? matchedColor.prompt
    : '아이가 그림에 쓴 색을 최대한 그대로 살려라.';
  const moodText = matchedMood ? matchedMood.prompt : DEFAULT_MOOD_PROMPT;

  return `${colorText} ${moodText}`;
}

/** 아이 화면에 보여줄 요약 (예: "금색 · 무섭게") */
export function describeAppearance(
  color: string | null | undefined,
  mood: string | null | undefined
): string {
  return [findAppearance(COLORS, color)?.label, findAppearance(MOODS, mood)?.label]
    .filter(Boolean)
    .join(' · ');
}
