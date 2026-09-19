import { CoreStats, EnvironmentKey, StatKey } from './types';
import { critChanceForLevel, statsWithLevelBonus } from './insect-stats';
import { SPECIAL_MOVES, SpecialMoveKey } from './special-moves';

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
  /** 이 배틀에서 실제로 쓴 필살기 (안 썼으면 null) */
  special: SpecialMoveKey | null;
}

export interface BattleResult {
  a: BattleSideResult;
  b: BattleSideResult;
  winner: 'A' | 'B' | 'draw';
  survivalPercentA: number;
  survivalPercentB: number;
}

/**
 * 주사위를 굴린 "날것의" 결과입니다.
 * 필살기를 배틀 도중에 고를 수 있어야 해서, 운/크리티컬은 배틀 시작 때 한 번만 굴려두고
 * 필살기 배수는 나중에 resolveBattle 에서 곱합니다.
 * (선택할 때마다 다시 굴리면 "필살기를 썼는데 더 나빠졌다"가 생길 수 있습니다.)
 */
export interface SideRoll {
  base: number;
  crit: boolean;
}

function rollSide(baseStats: CoreStats, level: number, env: EnvironmentKey): SideRoll {
  const effective = statsWithLevelBonus(baseStats, level);
  const base = weightedScore(effective, env);
  const luck = 0.9 + Math.random() * 0.2; // 운 요소 ±10%
  const crit = Math.random() < critChanceForLevel(level);
  return { base: base * luck * (crit ? 1.5 : 1), crit };
}

export function rollBattle(
  statsA: CoreStats,
  levelA: number,
  statsB: CoreStats,
  levelB: number,
  env: EnvironmentKey
): { a: SideRoll; b: SideRoll } {
  return {
    a: rollSide(statsA, levelA, env),
    b: rollSide(statsB, levelB, env),
  };
}

/**
 * 굴려둔 결과에 필살기 배수를 적용해 최종 승패를 냅니다.
 *
 * timingA 는 필살기 버튼을 얼마나 정확한 타이밍에 눌렀는지에 대한 보너스입니다(퍼펙트 1.35 ~ 1.0).
 * 기술 배수와 **따로** 곱하는 이유는 lib/special-moves.ts 의 타이밍 주석에 적어뒀습니다.
 */
export function resolveBattle(
  rollA: SideRoll,
  rollB: SideRoll,
  specialA: SpecialMoveKey | null = null,
  specialB: SpecialMoveKey | null = null,
  timingA = 1
): BattleResult {
  const moveA = specialA ? SPECIAL_MOVES[specialA] : null;
  const moveB = specialB ? SPECIAL_MOVES[specialB] : null;

  // 내 필살기는 내 점수를 올리고, 상대 필살기는 내 점수를 깎습니다.
  const scoreA =
    rollA.base * (moveA?.selfMultiplier ?? 1) * (moveB?.opponentMultiplier ?? 1) * (moveA ? timingA : 1);
  const scoreB = rollB.base * (moveB?.selfMultiplier ?? 1) * (moveA?.opponentMultiplier ?? 1);

  const a: BattleSideResult = { score: Math.round(scoreA), crit: rollA.crit, special: specialA };
  const b: BattleSideResult = { score: Math.round(scoreB), crit: rollB.crit, special: specialB };

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

/** 한 번에 굴리고 바로 결과까지 내는 기존 방식 (필살기 없이 계산하고 싶을 때). */
export function calculateBattle(
  statsA: CoreStats,
  levelA: number,
  statsB: CoreStats,
  levelB: number,
  env: EnvironmentKey,
  specialA: SpecialMoveKey | null = null,
  specialB: SpecialMoveKey | null = null,
  timingA = 1
): BattleResult {
  const { a, b } = rollBattle(statsA, levelA, statsB, levelB, env);
  return resolveBattle(a, b, specialA, specialB, timingA);
}
