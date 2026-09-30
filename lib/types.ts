export type EnvironmentKey = 'meteor' | 'heat' | 'lowland' | 'water' | 'highland';

export type StatKey = 'atk' | 'def' | 'hp' | 'int' | 'eva';

// 공격력 / 수비력 / HP 체력 / 지능 / 회피력 (2026-09-30 Jin 재설계)
//
// ⚠️ 예전에는 `surv`(생존능력)가 있었다. Jin 이 "생존능력(HP)" 라고 적어 HP 로 합치고,
// 그 자리에 **회피력**을 넣었다. 예전에 저장된 곤충의 `stats` 에는 `surv` 가 남아 있으므로
// 배틀·카드는 저장된 값을 믿지 말고 `statsForInsect()` 로 **입력값에서 다시 계산**한다.
export interface CoreStats {
  atk: number;
  def: number;
  /** 실제 체력 숫자 (대략 130~290). 다른 능력치처럼 0~100 이 아니다. */
  hp: number;
  int: number;
  /** 상대 필살기를 피할 힘. 이 숫자(%)만큼의 확률로 피한다 (최대 60%). */
  eva: number;
  /** 성실함 — 육감이 낮을 때만 생기는 특별 능력치 (0~5). 맞을 때마다 버틴다. */
  grit?: number;
}

export type BodyPart = 'head' | 'legs' | 'armor' | 'wings' | 'eyes' | 'instinct' | 'genetics';

export interface BodyPartScores {
  head: number; // 머리(턱)
  legs: number; // 다리(발톱)
  armor: number; // 갑옷(두께)
  wings: number; // 날개
  eyes: number; // 눈
  instinct: number; // 육감
  genetics: number; // 유전
}

export type AgeStageKey = 'newborn' | 'yearling' | 'veteran';

export interface Insect {
  id: string;
  player_id: string;
  nickname: string;
  species: string;
  origin: EnvironmentKey;
  age_stage: AgeStageKey;
  body_parts: BodyPartScores;
  // 아이가 상상으로 더 그린 부위의 개수 (lib/mutations.ts)
  mutations: MutationCountsRecord | null;
  image_base64: string;
  mime_type: string;
  stats: CoreStats;
  level: number;
  xp: number;
  battle_count: number;
  created_at: string;
}

export interface Player {
  id: string;
  // 종이에 인쇄된 참가 번호(예: A-014). 부스에서는 이 값이 신분증 역할을 합니다.
  ticket_code: string;
  display_name: string;
  // 받고 싶은 선물 (lib/survey.ts 의 PRIZES 키)
  prize_choice: string | null;
  // 설문 답변 3개를 통째로 담습니다. 문항이 늘어도 컬럼을 추가할 필요가 없습니다.
  survey: SurveyAnswersRecord | null;
  email: string | null;
  marketing_consent: boolean;
  created_at: string;
}

export interface SurveyAnswersRecord {
  favoriteInsect?: string;
  wantsCollecting?: string;
  wantsGame?: string;
}

// 특별 진화 개수. lib/mutations.ts 와 순환 참조가 생기지 않도록 여기에 형태만 적어둡니다.
export interface MutationCountsRecord {
  mandibles?: number;
  wings?: number;
  legs?: number;
  antennae?: number;
}
