export type EnvironmentKey = 'meteor' | 'heat' | 'lowland' | 'water' | 'highland';

export type StatKey = 'atk' | 'def' | 'hp' | 'surv' | 'int';

// 공격력 / 수비력 / HP 체력 / 생존능력 / 지능
export interface CoreStats {
  atk: number;
  def: number;
  hp: number;
  surv: number;
  int: number;
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
