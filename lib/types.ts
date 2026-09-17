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
  display_name: string;
  email: string | null;
  marketing_consent: boolean;
  created_at: string;
}
