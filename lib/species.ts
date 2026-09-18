// 곤충 종류 목록과 "이 종은 이렇게 생겨야 한다"는 규칙입니다.
//
// AI에게 그냥 "멋있게 그려줘"라고만 하면 사슴벌레 턱을 4개 그리는 식으로 실제와 다르게 그립니다.
// 곤충 행사에 오는 아이들은 곤충을 잘 알기 때문에 이런 오류를 금방 알아챕니다.
// 그래서 종류별 생김새 규칙을 아래에 적어두고, 이미지 생성 프롬프트에 그대로 넣습니다.
//
// 이 목록은 인쇄용 종이(/print)의 마킹 항목과 앱 화면(/upload)에 동시에 쓰입니다.
// 여기만 고치면 종이·앱·AI 프롬프트가 한꺼번에 맞춰집니다.
//
// 2026-09-18 확정: 사슴벌레를 종별로 쪼개는 대신 곤충의 종류 자체를 넓혔습니다.
// (사장님 판단: "사슴벌레를 세분화하기보다 곤충 종류를 늘리는 게 낫다")

export interface SpeciesOption {
  key: string;
  label: string;
  // 이미지 생성 AI에게 전달할 생김새 규칙
  anatomy: string;
  // 이 종이 실제로 가진 날개 수. "특별 진화"에서 더 그렸는지 판단하는 기준점입니다.
  // 나비·벌·사마귀는 원래 날개가 4장이라 4장을 그려도 진화가 아닙니다.
  normalWings: number;
}

export const SPECIES: SpeciesOption[] = [
  {
    key: 'rhino',
    label: '장수풍뎅이',
    normalWings: 2,
    anatomy:
      '머리 위쪽에 끝이 Y자로 갈라진 큰 뿔이 1개, 가슴등판에 앞으로 굽은 작은 뿔이 1개 있다. ' +
      '집게 모양의 큰턱은 없다. 몸은 광택 있는 짙은 갈색이며 두껍고 단단하다. 딱지날개 한 쌍으로 덮여 있다.',
  },
  {
    key: 'stag',
    label: '사슴벌레',
    normalWings: 2,
    anatomy:
      '집게 모양의 큰턱이 좌우에 하나씩, 정확히 2개 있고 안쪽으로 굽어 있다. ' +
      '몸은 위아래로 납작하고 단단하며 광택 나는 검은색 또는 적갈색이다. 딱지날개 한 쌍으로 덮여 있다.',
  },
  {
    key: 'mantis',
    label: '사마귀',
    normalWings: 4,
    anatomy:
      '앞다리 한 쌍이 낫처럼 크게 굽어 있고 안쪽에 가시가 줄지어 나 있다. ' +
      '머리는 역삼각형이고 겹눈이 크며, 목이 가늘어 머리를 좌우로 돌릴 수 있다. ' +
      '더듬이는 가늘고 길다. 몸은 가늘고 길쭉하며 초록색 또는 갈색이다. 날개는 두 쌍(4장)이다.',
  },
  {
    key: 'bee',
    label: '벌',
    normalWings: 4,
    anatomy:
      '머리·가슴·배가 뚜렷하게 나뉘고 배와 가슴 사이가 잘록하다. ' +
      '날개는 얇고 투명하며 두 쌍(4장)이다. 배에는 노란색과 검은색 줄무늬가 있고 끝에 침이 있다. ' +
      '몸 전체에 잔털이 많다.',
  },
  {
    key: 'butterfly',
    label: '나비',
    normalWings: 4,
    anatomy:
      '날개가 두 쌍(4장)으로 크고 넓으며, 비늘가루로 덮인 화려한 무늬가 있다. ' +
      '더듬이 끝이 곤봉처럼 볼록하다. 입은 돌돌 말린 빨대 모양이다. 몸통은 가늘다.',
  },
  {
    key: 'other',
    label: '기타 곤충',
    normalWings: 2,
    anatomy: '',
  },
];

// 아이가 "특별 진화"로 개수를 직접 지정하지 않은 부위에 적용되는 기본 규칙입니다.
//
// 아이가 상상해서 턱을 4개 그렸다면 그건 그대로 살립니다(lib/mutations.ts).
// 다만 아무 지정이 없는 부위까지 AI가 마음대로 늘리면 "멋있게"를 핑계로
// 아무 곤충이나 그려버리므로, 지정 없는 부위는 실제 곤충대로 그리게 합니다.
//
// 종마다 다른 부위(큰턱·날개 개수)는 여기 넣지 않고 위 anatomy 에만 적습니다.
// 여기에 "큰턱은 2개"를 넣으면 나비·벌에게도 큰턱을 그리라는 말이 되어 버립니다.
export const INSECT_ANATOMY_RULES = [
  '아래는 아이가 개수를 따로 지정하지 않은 부위에만 적용된다.',
  '다리는 가슴에서 나온 3쌍, 6개로 그린다.',
  '더듬이는 2개(한 쌍)로 그린다.',
  '눈은 2개다.',
  '몸은 머리·가슴·배 세 부분으로 나뉜다.',
  '지정이 없는 부위를 멋있게 보이려고 임의로 늘리지 마라.',
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
