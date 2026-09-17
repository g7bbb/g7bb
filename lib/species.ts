// 곤충 종류 목록과 "이 종은 이렇게 생겨야 한다"는 규칙입니다.
//
// AI에게 그냥 "멋있게 그려줘"라고만 하면 사슴벌레 턱을 4개 그리는 식으로 실제와 다르게 그립니다.
// 곤충 행사에 오는 아이들은 곤충을 잘 알기 때문에 이런 오류를 금방 알아챕니다.
// 그래서 종류별 생김새 규칙을 아래에 적어두고, 이미지 생성 프롬프트에 그대로 넣습니다.
//
// 이 목록은 인쇄용 종이의 마킹 항목과도 같아야 합니다.

export interface SpeciesOption {
  key: string;
  label: string;
  // 이미지 생성 AI에게 전달할 생김새 규칙
  anatomy: string;
}

export const SPECIES: SpeciesOption[] = [
  {
    key: 'rhino',
    label: '장수풍뎅이',
    anatomy:
      '머리 위쪽에 끝이 Y자로 갈라진 큰 뿔이 1개, 가슴등판에 앞으로 굽은 작은 뿔이 1개 있다. ' +
      '집게 모양의 큰턱은 없다. 몸은 광택 있는 짙은 갈색이며 두껍고 단단하다.',
  },
  {
    key: 'dorcus_hopei',
    label: '왕사슴벌레',
    anatomy:
      '굵고 안쪽으로 둥글게 굽은 큰턱이 좌우에 하나씩, 정확히 2개 있다. ' +
      '큰턱 안쪽 가운데에 굵은 돌기가 하나씩 있다. 몸은 두껍고 광택 나는 검은색이다.',
  },
  {
    key: 'dorcus_titanus',
    label: '넓적사슴벌레',
    anatomy:
      '몸이 위아래로 납작하고 폭이 넓다. 큰턱은 좌우 한 쌍, 정확히 2개이며 ' +
      '안쪽에 작은 톱니가 여러 개 늘어서 있다. 몸은 검고 광택이 난다.',
  },
  {
    key: 'prosopocoilus',
    label: '톱사슴벌레',
    anatomy:
      '큰턱이 좌우 한 쌍, 정확히 2개이며 길고 활처럼 안쪽으로 휘어 있고 톱니가 촘촘하다. ' +
      '몸은 적갈색이다.',
  },
  {
    key: 'stag_other',
    label: '사슴벌레 (그 외)',
    anatomy: '큰턱이 좌우 한 쌍, 정확히 2개 있다. 몸은 단단하고 광택이 난다.',
  },
  {
    key: 'other',
    label: '기타 곤충',
    anatomy: '',
  },
];

// 종류와 상관없이 모든 곤충이 지켜야 하는 규칙입니다.
// "멋있게"를 우선하다 보면 AI가 가장 먼저 어기는 것들만 골라 적었습니다.
export const INSECT_ANATOMY_RULES = [
  '다리는 가슴에서 나온 3쌍, 정확히 6개여야 한다. 더 그리지 마라.',
  '더듬이는 정확히 2개(한 쌍)여야 한다.',
  '눈은 2개여야 한다.',
  '큰턱(집게)은 좌우 한 쌍, 즉 최대 2개다. 절대로 3개 이상 그리지 마라.',
  '뿔도 실제 그 종이 가진 개수만 그린다. 멋있게 보이려고 뿔이나 턱을 늘리지 마라.',
  '몸은 머리·가슴·배 세 부분으로 나뉜다.',
].join(' ');

export function speciesLabel(key: string | null | undefined): string {
  if (!key) return '';
  return SPECIES.find((item) => item.key === key)?.label ?? key;
}

// 화면에서 넘어온 값이 키(rhino)든 이름(장수풍뎅이)이든 모두 찾아줍니다.
export function findSpecies(value: string | null | undefined): SpeciesOption | null {
  if (!value) return null;
  const trimmed = value.trim();
  return (
    SPECIES.find((item) => item.key === trimmed) ??
    SPECIES.find((item) => item.label === trimmed) ??
    null
  );
}
