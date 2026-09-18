import { AgeStageKey, BodyPart, BodyPartScores, CoreStats, StatKey } from './types';
import { MutationCounts, applyMutations } from './mutations';

export const BODY_PARTS: { key: BodyPart; label: string; hint: string }[] = [
  { key: 'head', label: '머리 (턱)', hint: '공격력 · 지능' },
  { key: 'legs', label: '다리 (발톱)', hint: '공격력 · 생존능력' },
  { key: 'armor', label: '갑옷 (두께)', hint: 'HP · 수비력' },
  { key: 'wings', label: '날개', hint: '수비력 · 생존능력' },
  { key: 'eyes', label: '눈', hint: '수비력 · 생존능력' },
  { key: 'instinct', label: '육감', hint: '공격력 · 수비력 · 생존능력 · 지능' },
  { key: 'genetics', label: '유전', hint: '공격력 · 수비력 · 생존능력' },
];

const BODY_PART_STAT_MAP: Record<BodyPart, StatKey[]> = {
  head: ['atk', 'int'],
  legs: ['atk', 'surv'],
  armor: ['hp', 'def'],
  wings: ['def', 'surv'],
  eyes: ['def', 'surv'],
  instinct: ['atk', 'def', 'surv', 'int'],
  genetics: ['atk', 'def', 'surv'],
};

export const AGE_STAGES: {
  key: AgeStageKey;
  label: string;
  statMultiplier: number; // hp/atk/surv/int 에 적용 (수비력은 나이 영향 없음)
  xpMultiplier: number;
}[] = [
  { key: 'newborn', label: '신생충', statMultiplier: 0.9, xpMultiplier: 1.0 },
  { key: 'yearling', label: '1년충', statMultiplier: 1.0, xpMultiplier: 1.15 },
  { key: 'veteran', label: 'n년충', statMultiplier: 1.15, xpMultiplier: 1.3 },
];

export function defaultBodyParts(): BodyPartScores {
  return { head: 3, legs: 3, armor: 3, wings: 3, eyes: 3, instinct: 3, genetics: 3 };
}

const clamp = (v: number) => Math.max(10, Math.min(100, Math.round(v)));

// 7개 신체부위 점수(1~5)를 5개 핵심 능력치로 변환합니다.
// 각 부위가 연결된 능력치들에 점수를 더한 뒤, 그 능력치에 기여하는 부위 개수만큼 나눠서 0~100 범위로 맞춥니다.
// mutations(아이가 상상으로 더 그린 부위)를 넘기면 마지막에 보너스/페널티까지 반영합니다.
// species 를 넘기면 그 종의 "정상 개수"를 기준으로 특별 진화를 계산합니다.
// (나비·벌·사마귀는 날개 4장이 정상이라, 안 넘기면 4장을 그린 것만으로 보너스를 받아버립니다.)
export function calculateStats(
  parts: BodyPartScores,
  ageStage: AgeStageKey,
  mutations?: MutationCounts,
  species?: string | null
): CoreStats {
  const contributions: Record<StatKey, number[]> = { atk: [], def: [], hp: [], surv: [], int: [] };
  (Object.keys(parts) as BodyPart[]).forEach((part) => {
    const score = parts[part];
    BODY_PART_STAT_MAP[part].forEach((stat) => contributions[stat].push(score));
  });

  const normalize = (values: number[]) => {
    if (values.length === 0) return 50;
    const sum = values.reduce((a, b) => a + b, 0);
    return (sum / (values.length * 5)) * 100;
  };

  const stage = AGE_STAGES.find((s) => s.key === ageStage) ?? AGE_STAGES[1];

  const base: CoreStats = {
    atk: clamp(normalize(contributions.atk) * stage.statMultiplier),
    def: clamp(normalize(contributions.def)),
    hp: clamp(normalize(contributions.hp) * stage.statMultiplier),
    surv: clamp(normalize(contributions.surv) * stage.statMultiplier),
    int: clamp(normalize(contributions.int) * stage.statMultiplier),
  };

  return mutations ? applyMutations(base, mutations, species) : base;
}

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(xp / 50);
}

export function critChanceForLevel(level: number): number {
  return Math.min(0.5, 0.1 + (level - 1) * 0.02);
}

export function xpGainForBattle(won: boolean, ageStage: AgeStageKey): number {
  const stage = AGE_STAGES.find((s) => s.key === ageStage) ?? AGE_STAGES[1];
  const base = 10 + (won ? 20 : 0);
  return Math.round(base * stage.xpMultiplier);
}

// 레벨이 오를수록 배틀에서 실제로 쓰이는 능력치에 소폭 보너스가 붙습니다.
// 저장된 기본 스탯 자체는 바뀌지 않고, 배틀 계산 시점에만 적용됩니다.
export function statsWithLevelBonus(stats: CoreStats, level: number): CoreStats {
  const bonus = 1 + (level - 1) * 0.03;
  return {
    atk: clamp(stats.atk * bonus),
    def: clamp(stats.def * bonus),
    hp: clamp(stats.hp * bonus),
    surv: clamp(stats.surv * bonus),
    int: clamp(stats.int * bonus),
  };
}
