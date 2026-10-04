import { CoreStats, EnvironmentKey } from './types';
import { statsWithLevelBonus } from './insect-stats';
import { bonusSpecialChance, critChance } from './leveling';
import { MATCHUP_BONUS, matchup } from './origins';
import { SPECIAL_MOVES, SpecialMoveKey, rollMoveRate } from './special-moves';

// ─────────────────────────────────────────────────────────────
// 배틀 점수 (2026-09-30 재설계)
//
// 예전에는 배틀마다 "환경"을 골라 환경별로 중요한 능력치에 가중치를 줬다.
// 이제는 **곤충의 출신지**가 능력치 보너스와 상성을 정하므로(`lib/origins.ts`),
// 배틀 화면에서 환경을 따로 고르지 않는다. 같은 이름(운석충돌 등)이 두 가지 뜻으로
// 쓰이면 아이도 진행 요원도 헷갈린다.
//
// 기본 점수 = 100 × (HP)^0.4 × (공격력)^0.3 × (수비력)^0.3   (전부 3점 곤충 ≈ 100)
//   - 지능은 공격력과 수비력을 함께 올려준다 (Jin 규칙).
//   - 세 가지를 **곱하는** 이유: 하나만 몰빵한 곤충이 이기지 않게. 골고루 좋아야 세다.
// ─────────────────────────────────────────────────────────────

/** 지능 1 이 공격력·수비력에 주는 효과. 지능 60 이면 +4%, 40 이면 −4%. */
const INT_EFFECT = 1 / 250;

function power(stats: CoreStats): number {
  const smart = 1 + (stats.int - 50) * INT_EFFECT;
  const hp = Math.max(1, stats.hp) / 192.5;
  const atk = Math.max(1, stats.atk * smart) / 57.5;
  const def = Math.max(1, stats.def * smart) / 50;
  return 100 * Math.pow(hp, 0.4) * Math.pow(atk, 0.3) * Math.pow(def, 0.3);
}

/** 회피력(%) → 상대 필살기를 피할 확률. 너무 높으면 아무것도 안 맞으므로 60% 에서 막는다. */
export function dodgeChance(stats: CoreStats): number {
  return Math.max(0, Math.min(0.6, (stats.eva ?? 0) / 100));
}

/**
 * 성실함 1 이 막아주는 피해. 성실함 5 → 필살기 피해 15% 덜 받음.
 * Jin 표현 "공격을 당할 때마다 HP 10씩 참" 을 점수 대결에 맞게 옮긴 것이다.
 */
const GRIT_GUARD = 0.03;

export interface BattleSideResult {
  score: number;
  crit: boolean;
  /** 이 배틀에서 실제로 쓴 필살기들 (LV3부터 두 개까지) */
  specials: SpecialMoveKey[];
  /** "필살기 한 번 더!" 를 썼는지 */
  bonus: boolean;
  /** 상대 필살기를 피했는지 */
  dodged: boolean;
  /** 출신지 상성: 1 이김 / 0 상관없음 / -1 짐 */
  matchup: -1 | 0 | 1;
}

export interface BattleResult {
  a: BattleSideResult;
  b: BattleSideResult;
  winner: 'A' | 'B' | 'draw';
  survivalPercentA: number;
  survivalPercentB: number;
}

export interface BattleSide {
  stats: CoreStats;
  level: number;
  origin: EnvironmentKey | null;
  /**
   * 뱃지 개수 버프 (lib/badges.ts badgePerks, 2026-10-01 Jin). 없으면 버프 없음.
   * hp·def 는 능력치 배수, special 은 공격형 필살기 위력 배수.
   */
  perks?: { hp: number; def: number; special: number };
}

/**
 * 주사위를 굴린 "날것의" 결과입니다.
 * 필살기를 배틀 도중에 고를 수 있어야 해서, 운/크리티컬/회피는 배틀 시작 때 한 번만 굴려두고
 * 필살기 배수는 나중에 resolveBattle 에서 곱합니다.
 * (선택할 때마다 다시 굴리면 "필살기를 썼는데 더 나빠졌다"가 생길 수 있습니다.)
 */
export interface SideRoll {
  base: number;
  crit: boolean;
  dodged: boolean;
  grit: number;
  matchup: -1 | 0 | 1;
  /**
   * "필살기 한 번 더!" 가 걸렸는지 (역전 찬스, lib/leveling.ts).
   * 걸리면 기본 필살기를 한 번 더 쓸 수 있다. 레벨이 낮을수록 잘 걸린다 (LV1 50%).
   */
  bonus: boolean;
  /** 공격형 필살기 위력 배수 (뱃지 20개 버프). 없으면 1 */
  specialBoost?: number;
  /**
   * 🛡️ 이번 배틀에서 수비 기술이 **실패**했는지 (10/3 밤 Jin: "수비 기술 성공 확률이 너무 높아, 반으로").
   * 실패하면 수비 필살기(기본기·바위처럼!!·한 번 더)가 아무것도 못 막고 되받아치기도 없다. 없으면 성공.
   */
  guardFail?: boolean;
}

/** 수비 기술이 성공할 확률 (10/3 밤 Jin: 100% → 50%) */
export const GUARD_SUCCESS = 0.5;
/**
 * 수비형 곤충(나비·기타 곤충)의 기본 힘 보정. 수비 성공이 반으로 줄면 수비형 승률이 50% → 37% 로 떨어져서 맞췄다.
 * (막는 힘을 키우는 쪽은 운이 커져서 '전부5 vs 전부1' 이 56% → 51% 로 떨어짐 → 기본 힘으로 보정, 55.5% 유지)
 * 시뮬레이션: 종류별 48~51%. 고치면 tools/sim/balance.ts · levels.ts 다시 돌릴 것.
 */
export const DEF_TYPE_POWER = 1.2;

function rollSide(me: BattleSide, foe: BattleSide, random: () => number): SideRoll {
  const perks = me.perks;
  const boosted = perks ? { ...me.stats, hp: me.stats.hp * perks.hp, def: me.stats.def * perks.def } : me.stats;
  const effective = statsWithLevelBonus(boosted, me.level);
  const edge = matchup(me.origin, foe.origin);
  const luck = 0.9 + random() * 0.2; // 운 요소 ±10%
  // 크리티컬은 레벨과 상관없이 같고, **상대보다 레벨이 낮으면** 더 잘 터진다 (역전 찬스).
  const crit = random() < critChance(me.level, foe.level);
  const dodged = random() < dodgeChance(me.stats);
  const bonus = random() < bonusSpecialChance(me.level);
  const guardFail = random() >= GUARD_SUCCESS;
  return {
    base: power(effective) * luck * (crit ? 1.5 : 1) * (edge === 1 ? 1 + MATCHUP_BONUS : 1),
    crit,
    dodged,
    grit: me.stats.grit ?? 0,
    matchup: edge,
    bonus,
    specialBoost: perks?.special ?? 1,
    guardFail,
  };
}

export function rollBattle(
  a: BattleSide,
  b: BattleSide,
  random: () => number = Math.random
): { a: SideRoll; b: SideRoll } {
  return { a: rollSide(a, b, random), b: rollSide(b, a, random) };
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
 * 같은 형이 두 번 나오면 **남은 만큼에 또 적용**합니다.
 * 30% 두 번이면 60% 가 아니라 1 − 0.7 × 0.7 = 51%. 그냥 더하면 100% 를 넘어 점수가 0 이 됩니다.
 */
function combineMoves(
  keys: SpecialMoveKey[],
  crit: boolean,
  random?: () => number,
  /** 공격형 위력 배수 (뱃지 버프). 100% 를 넘지 않게 95% 에서 자른다. */
  attackBoost = 1
): { attack: number; defense: number } {
  let attackLeft = 1;
  let defenseLeft = 1;
  keys.forEach((key) => {
    const move = SPECIAL_MOVES[key];
    if (!move) return;
    const rate = rollMoveRate(move, crit, random);
    if (move.kind === 'attack') attackLeft *= 1 - Math.min(0.95, rate * attackBoost);
    else defenseLeft *= 1 - rate;
  });
  return { attack: 1 - attackLeft, defense: 1 - defenseLeft };
}

/**
 * 수비형이 "막아낸 힘으로 되받아치는" 비율.
 * 이 숫자가 없으면 수비형 곤충은 이길 방법이 없어집니다 (위 주석 참고).
 */
const DEFENSE_COUNTER = 0.75;

/** "필살기 한 번 더!" 가 수비형일 때의 반격 비율 (아래 resolveBattle 주석 참고) */
const EXTRA_COUNTER = 0.4;

export function resolveBattle(
  rollA: SideRoll,
  rollB: SideRoll,
  specialsA: SpecialMoveKey[] = [],
  specialsB: SpecialMoveKey[] = [],
  timingA = 1,
  /** 테스트에서 결과를 고정하고 싶을 때만 넘깁니다. */
  random?: () => number,
  /**
   * "필살기 한 번 더!" 로 쓴 기술 (역전 찬스, lib/leveling.ts). 없으면 null.
   *
   * ⚠️ **한 번 더는 일부러 약하게 둔다: 크리티컬이 없고(20~30%), 대신 회피로 못 피한다.**
   * 처음엔 그냥 필살기를 한 번 더 쓰게 했더니 필살기 비중이 너무 커져서,
   * 필살기를 통째로 피하는 회피력이 지나치게 세졌다 (전부5 vs 전부1 승률 58.9% → 45.3%,
   * 부위 점수가 낮을수록 이기는 거꾸로 된 게임). 시뮬레이션으로 잡았다.
   */
  extra: {
    a?: SpecialMoveKey | null;
    b?: SpecialMoveKey | null;
    reflectA?: boolean;
    /** 수비형 곤충인지 (버튼을 못 눌러 기술 목록이 비어도 보정은 받게 화면이 직접 알려준다) */
    defTypeA?: boolean;
    defTypeB?: boolean;
    /** 🎯 연습 게임에서 만난 상대면 내 점수에 곱한다 (PRACTICE_EDGE) */
    edgeA?: number;
  } = {}
): BattleResult {
  // 🛡️ 수비 기술이 실패한 쪽은 수비형 기술을 뺀다 (공격형은 그대로)
  const guardOk = (keys: SpecialMoveKey[], roll: SideRoll) =>
    roll.guardFail ? keys.filter((k) => SPECIAL_MOVES[k]?.kind !== 'defense') : keys;
  const moveA = combineMoves(guardOk(specialsA, rollA), rollA.crit, random, rollA.specialBoost ?? 1);
  const moveB = combineMoves(guardOk(specialsB, rollB), rollB.crit, random, rollB.specialBoost ?? 1);
  const bonusA = combineMoves(guardOk(extra.a ? [extra.a] : [], rollA), false, random, rollA.specialBoost ?? 1);
  const bonusB = combineMoves(guardOk(extra.b ? [extra.b] : [], rollB), false, random, rollB.specialBoost ?? 1);

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

  // "한 번 더!" — 공격형은 한 번 더 때리고(회피로 못 피함), 수비형은 한 번 더 막고(아래 guard)
  // 조금 되받아친다. 수비형 반격을 원래(0.75)대로 주면 수비형만 55%, 아예 빼면 43% 라서
  // 그 사이 EXTRA_COUNTER 로 맞췄다 (시뮬레이션).
  const extraHitA = Math.max(bonusA.attack, bonusA.defense * EXTRA_COUNTER);
  const extraHitB = Math.max(bonusB.attack, bonusB.defense * EXTRA_COUNTER);

  // 회피: 피한 쪽은 상대의 공격(반격 포함)을 **통째로** 안 맞는다. ("한 번 더!" 는 빼고)
  const hitAraw = 1 - (1 - (rollA.dodged ? 0 : attackB)) * (1 - extraHitB);
  const hitBraw = 1 - (1 - (rollB.dodged ? 0 : attackA)) * (1 - extraHitA);
  // 🔄 되받아치기 (10/3 Jin, lib/special-moves.ts COUNTER_*): 내가 빠른 고리를 퍼펙트로 누르면
  // 상대 공격·필살기를 **안 맞고, 그 피해 그대로** 상대가 맞는다.
  const hitA = extra.reflectA ? 0 : hitAraw;
  const hitB = extra.reflectA ? 1 - (1 - hitBraw) * (1 - hitAraw) : hitBraw;

  // 수비도 "한 번 더!" 만큼 단단해진다.
  const guardA = 1 - (1 - moveA.defense) * (1 - bonusA.defense);
  const guardB = 1 - (1 - moveB.defense) * (1 - bonusB.defense);

  // 성실함: 맞은 만큼에서 조금 버틴다.
  const takenByA = hitA * (1 - guardA) * (1 - GRIT_GUARD * rollA.grit);
  const takenByB = hitB * (1 - guardB) * (1 - GRIT_GUARD * rollB.grit);

  // 타이밍 보너스는 기술과 무관하게 **내 점수에만** 곱합니다.
  // 기술 효과 자체를 키우면 수비형만 유독 세지는 등 밸런스가 틀어집니다.
  // 🛡️ 수비형 곤충(나비·기타) 기본 힘 보정 — 수비 성공이 반으로 줄어든 만큼 (10/3 밤, 시뮬레이션으로 맞춤)
  const defType = (keys: SpecialMoveKey[]) => keys.some((k) => SPECIAL_MOVES[k]?.kind === 'defense' && k !== 'commonDefense');
  const kA = extra.defTypeA ?? (defType(specialsA) || (!!extra.a && defType([extra.a]))) ? DEF_TYPE_POWER : 1;
  const kB = extra.defTypeB ?? (defType(specialsB) || (!!extra.b && defType([extra.b]))) ? DEF_TYPE_POWER : 1;
  const scoreA = rollA.base * kA * (1 - takenByA) * (specialsA.length || extra.a ? timingA : 1) * (extra.edgeA ?? 1);
  const scoreB = rollB.base * kB * (1 - takenByB);

  const a: BattleSideResult = {
    score: Math.round(scoreA),
    crit: rollA.crit,
    specials: specialsA,
    bonus: !!extra.a,
    // 상대가 필살기를 안 썼으면 피할 것도 없었던 것
    dodged: rollA.dodged && specialsB.length > 0,
    matchup: rollA.matchup,
  };
  const b: BattleSideResult = {
    score: Math.round(scoreB),
    crit: rollB.crit,
    specials: specialsB,
    bonus: !!extra.b,
    dodged: rollB.dodged && specialsA.length > 0,
    matchup: rollB.matchup,
  };

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
  a: BattleSide,
  b: BattleSide,
  specialsA: SpecialMoveKey[] = [],
  specialsB: SpecialMoveKey[] = [],
  timingA = 1
): BattleResult {
  const rolls = rollBattle(a, b);
  return resolveBattle(rolls.a, rolls.b, specialsA, specialsB, timingA);
}
