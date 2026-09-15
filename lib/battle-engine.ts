import { CoreStats, EnvironmentKey, StatKey } from './types';
import { critChanceForLevel, statsWithLevelBonus } from './insect-stats';

// 환경마다 중요하게 작용하는 능력치를 다르게 둬서, 같은 곤충이라도 환경에 따라 결과가 달라지게 했습니다.
// 이 가중치는 게임 밸런스 부분이라 실제 테스트 결과를 보고 여기 숫자만 조정하면 됩니다.
const ENV_WEIGHTS: Record<EnvironmentKey, Partial<Record<StatKey, number>>> = {
  meteor: { surv: 0.5, def: 0.3, hp: 0.2 }, // 운석충돌: 버티고 피하는 생존능력이 핵심
  heat: { surv: 0.4, int: 0.3, def: 0.3 }, // 기온상승: 체온 조절 지능 + 생존능력
  lowland: { atk: 0.4, def: 0.3, surv: 0.3 }, // 저지대: 경쟁이 치열해서 공격력 중요
  water: { surv: 0.4, def: 0.3, hp: 0.3 }, // 물근처: 천적이 많아 수비/생존 중요
  highland: { int: 0.4, surv: 0.4, hp: 0.2 }, // 고지대: 환경 적응 지능 + 생존능력
};

function weightedScore(stats: CoreStats, env: EnvironmentKey) {
  const weights = ENV_WEIGHTS[env];
  let score = 0;
  (Object.keys(weights) as StatKey[]).forEach((stat) => {
    score += stats[stat] * (weights[stat] ?? 0);
  });
  return score;
}

export interface BattleSideResult {
  score: number;
  crit: boolean;
}

export interface BattleResult {
  a: BattleSideResult;
  b: BattleSideResult;
  winner: 'A' | 'B' | 'draw';
  survivalPercentA: number;
  survivalPercentB: number;
}

function rollSide(baseStats: CoreStats, level: number, env: EnvironmentKey): BattleSideResult {
  const effective = statsWithLevelBonus(baseStats, level);
  const base = weightedScore(effective, env);
  const luck = 0.9 + Math.random() * 0.2; // 운 요소 ±10%
  const crit = Math.random() < critChanceForLevel(level);
  const score = base * luck * (crit ? 1.5 : 1);
  return { score: Math.round(score), crit };
}

export function calculateBattle(
  statsA: CoreStats,
  levelA: number,
  statsB: CoreStats,
  levelB: number,
  env: EnvironmentKey
): BattleResult {
  const a = rollSide(statsA, levelA, env);
  const b = rollSide(statsB, levelB, env);
  const sum = a.score + b.score;
  const total = sum === 0 ? 1 : sum; // 0으로 나누기만 방지 (NaN은 그대로 드러나야 원인을 찾기 쉬움)

  return {
    a,
    b,
    winner: a.score === b.score ? 'draw' : a.score > b.score ? 'A' : 'B',
    survivalPercentA: Math.round((a.score / total) * 100),
    survivalPercentB: Math.round((b.score / total) * 100),
  };
}
