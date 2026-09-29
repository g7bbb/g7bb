import { CoreStats, EnvironmentKey, StatKey } from './types';
import { critChanceForLevel, statsWithLevelBonus } from './insect-stats';
import { SPECIAL_MOVES, SpecialMoveKey, rollMoveRate } from './special-moves';

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
  /** 이 배틀에서 실제로 쓴 필살기들 (LV3부터 두 개까지) */
  specials: SpecialMoveKey[];
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
/**
 * 한쪽이 쓴 필살기들을 **공격 효과 / 수비 효과** 두 숫자로 합칩니다.
 *
 * - 공격형: 상대 점수를 이만큼 깎는다 (Jin 표현으로 "상대 HP의 50% 감소")
 * - 수비형: 상대가 나를 깎는 것을 이만큼 막는다 ("내가 받는 피해의 50% 감소")
 *
 * 같은 형을 두 개 쓸 일은 없지만(기본기와 반대 형만 추가되므로), 혹시 겹치면
 * **더 센 쪽 하나만** 씁니다. 더해버리면 100%를 넘어 점수가 0이나 음수가 됩니다.
 */
function combineMoves(
  keys: SpecialMoveKey[],
  crit: boolean,
  random?: () => number
): { attack: number; defense: number } {
  let attack = 0;
  let defense = 0;
  keys.forEach((key) => {
    const move = SPECIAL_MOVES[key];
    if (!move) return;
    const rate = rollMoveRate(move, crit, random);
    if (move.kind === 'attack') attack = Math.max(attack, rate);
    else defense = Math.max(defense, rate);
  });
  return { attack, defense };
}

/**
 * 수비형이 "막아낸 힘으로 되받아치는" 비율.
 * 이 숫자가 없으면 수비형 곤충은 이길 방법이 없어집니다 (위 주석 참고).
 */
const DEFENSE_COUNTER = 0.75;

export function resolveBattle(
  rollA: SideRoll,
  rollB: SideRoll,
  specialsA: SpecialMoveKey[] = [],
  specialsB: SpecialMoveKey[] = [],
  timingA = 1,
  /** 테스트에서 결과를 고정하고 싶을 때만 넘깁니다. */
  random?: () => number
): BattleResult {
  const moveA = combineMoves(specialsA, rollA.crit, random);
  const moveB = combineMoves(specialsB, rollB.crit, random);

  // 상대의 공격은 내 수비만큼 무뎌집니다.
  //   내가 받는 실제 깎임 = 상대 공격률 × (1 − 내 수비율)
  // 둘 다 수비만 쓰면 아무도 안 깎여 순수 능력치 싸움이 됩니다. 그게 맞는 결과입니다.
  // 🔴 **수비형에도 반격을 붙여야 한다 (2026-09-29, 시뮬레이션으로 발견).**
  //
  // 처음에는 Jin 규칙 그대로 "수비형 = 받는 피해만 줄임"으로 짰는데,
  // 4000판씩 돌려보니 **나비·기타곤충(수비형)이 공격형 상대로 승률 0.7~1.4%** 였다.
  // 점수 대결이라 막기만 해서는 **천천히 질 뿐 이길 방법이 없기 때문**이다.
  // 상품이 걸린 랭킹인데 나비를 그린 아이가 전멸한다.
  //
  // → 수비형은 막아낸 힘으로 **되받아친다**. 방어율의 75%만큼 상대도 깎는다.
  //   기술 이름과 설명(흔들흔들 회피 / 웅크리기)은 그대로 두고 숫자만 맞춘 것이다.
  //   0.8 을 올리면 수비형이 유리해지고, 낮추면 다시 불리해진다.
  const counterA = moveA.defense * DEFENSE_COUNTER;
  const counterB = moveB.defense * DEFENSE_COUNTER;

  const attackA = Math.max(moveA.attack, counterA);
  const attackB = Math.max(moveB.attack, counterB);

  const takenByA = attackB * (1 - moveA.defense);
  const takenByB = attackA * (1 - moveB.defense);

  // 타이밍 보너스는 기술과 무관하게 **내 점수에만** 곱합니다.
  // 기술 효과 자체를 키우면 수비형만 유독 세지는 등 밸런스가 틀어집니다.
  const scoreA = rollA.base * (1 - takenByA) * (specialsA.length ? timingA : 1);
  const scoreB = rollB.base * (1 - takenByB);

  const a: BattleSideResult = { score: Math.round(scoreA), crit: rollA.crit, specials: specialsA };
  const b: BattleSideResult = { score: Math.round(scoreB), crit: rollB.crit, specials: specialsB };

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

/**
 * HP 바에 보여줄 값 (0~100). **점수 계산과는 무관한 연출용 수치입니다.**
 *
 * Jin 요청 (2026-09-29): "곤충이 배틀에서 질 때 생명력 바가 0까지 안 된다.
 * 0이 돼야 배틀이 끝나는 걸로 다시 세팅해줘."
 *
 * 이 게임은 HP를 깎는 방식이 아니라 **점수 대결**입니다(위 `resolveBattle`).
 * 그래서 점수 비율을 그대로 바에 그리면 `49% : 51%` 처럼 **진 쪽도 절반이 남아**
 * "졌는데 왜 아직 살아있지?" 가 됩니다. 바에만 따로 규칙을 둡니다.
 *
 *   진 쪽   → **0**
 *   이긴 쪽 → 이긴 만큼만 남음 (점수차 ÷ 이긴 쪽 점수)
 *
 * 51 대 49 처럼 아슬아슬하면 이긴 쪽도 4%만 남아 "간신히 이겼다"가 눈에 보이고,
 * 크게 이기면 많이 남습니다. 승부가 얼마나 팽팽했는지가 바 하나로 읽힙니다.
 *
 * ⚠️ **여기 숫자를 바꿔도 승패·점수·랭킹은 전혀 바뀌지 않습니다.**
 * 밸런스(6종 × 6종 48.1~51.2%)는 `resolveBattle` 이 정하고,
 * 이 함수는 그 결과를 보기 좋게 그릴 뿐입니다.
 */
export function barPercents(result: BattleResult): { a: number; b: number } {
  if (result.winner === 'draw') return { a: 50, b: 50 };

  const win = result.winner === 'A' ? result.a.score : result.b.score;
  const lose = result.winner === 'A' ? result.b.score : result.a.score;

  // 이긴 쪽까지 0으로 보이면 진 쪽과 구분이 안 되므로 최소 1%는 남깁니다.
  const left = win <= 0 ? 100 : Math.max(1, Math.round(((win - lose) / win) * 100));

  return result.winner === 'A' ? { a: left, b: 0 } : { a: 0, b: left };
}

export function calculateBattle(
  statsA: CoreStats,
  levelA: number,
  statsB: CoreStats,
  levelB: number,
  env: EnvironmentKey,
  specialsA: SpecialMoveKey[] = [],
  specialsB: SpecialMoveKey[] = [],
  timingA = 1
): BattleResult {
  const { a, b } = rollBattle(statsA, levelA, statsB, levelB, env);
  return resolveBattle(a, b, specialsA, specialsB, timingA);
}
