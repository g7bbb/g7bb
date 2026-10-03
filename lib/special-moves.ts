import { findSpecies } from './species';

// ─────────────────────────────────────────────────────────────
// 필살기 (2026-09-29 Jin 이 전면 재설계)
//
// **바뀐 점 — 이전에는 "가장 높은 능력치"가 필살기였다.**
// 이제는 **곤충 종류**가 필살기를 정한다. 사슴벌레는 큰턱공격, 장수풍뎅이는 씨름선수처럼
// 그 곤충다운 기술이 나온다. 아이가 고른 종류가 배틀에서 바로 티가 난다.
//
// **두 가지 형(型)**
//   - 공격형: 상대 점수를 깎는다        ("상대 HP의 50% 감소")
//   - 수비형: 상대가 나를 깎는 것을 막는다 ("내가 받는 피해의 50% 감소")
//
// **LV3 부터 필살기가 하나 더 생긴다.** 자기 기본기와 **반대 형**의 공통기가 추가되어
// 한 배틀에서 두 번 시전할 수 있다. 공격형 곤충은 수비를, 수비형 곤충은 공격을 얻는다.
//
// ⚠️ 이 게임의 배틀은 **HP를 깎는 방식이 아니라 점수 대결**이다 (`lib/battle-engine.ts`).
// 화면의 HP 바는 두 점수의 비율을 보여주는 연출이다. 그래서 Jin 이 말한
// "상대 HP의 50% 감소"는 **상대 점수 × 0.5** 로 옮겼다. 느낌은 그대로다.
//
// 숫자를 바꾸고 싶으면 이 파일만 고치면 된다.
// ─────────────────────────────────────────────────────────────

export type MoveKind = 'attack' | 'defense';

/**
 * 종별 기본기 6개 + LV3 공통기 2개.
 * 앞의 6개는 `lib/species.ts` 의 key 와 같은 이름이라 종류 ↔ 기술이 1:1 로 붙습니다.
 */
export type SpecialMoveKey =
  | 'rhino'
  | 'stag'
  | 'mantis'
  | 'bee'
  | 'butterfly'
  | 'other'
  | 'commonDefense'
  | 'commonAttack';

export interface SpecialMove {
  key: SpecialMoveKey;
  name: string;
  emoji: string;
  /** 아이에게 보여줄 한 줄 설명 */
  description: string;
  kind: MoveKind;
  /**
   * 크리티컬이 터졌을 때의 효과 크기 (0.5 = 50%).
   * 공격형이면 상대 점수를 이만큼 깎고, 수비형이면 내가 받는 깎임을 이만큼 막는다.
   */
  critRate: number;
  /** 크리티컬이 아닐 때. 이 범위 안에서 무작위로 정해진다 (배틀 시작 때 한 번만 굴림). */
  normalMin: number;
  normalMax: number;
  /** 화면 전체를 덮는 섬광 색 */
  flashColor: string;
  /** 기술 이름 글자 색 */
  textColor: string;
}

/** 크리티컬이 아닐 때는 모든 기술이 20~30% 로 같다 (Jin 규칙). */
const NORMAL_MIN = 0.2;
const NORMAL_MAX = 0.3;

export const SPECIAL_MOVES: Record<SpecialMoveKey, SpecialMove> = {
  stag: {
    key: 'stag',
    name: '큰턱공격!',
    emoji: '🦌',
    description: '집게턱으로 콱! 상대를 크게 깎아',
    kind: 'attack',
    critRate: 0.5,
    normalMin: NORMAL_MIN,
    normalMax: NORMAL_MAX,
    flashColor: 'bg-red-500',
    textColor: 'text-red-400',
  },
  rhino: {
    key: 'rhino',
    name: '씨름선수!',
    emoji: '🦏',
    description: '뿔로 밀어붙여! 제일 강한 한 방',
    kind: 'attack',
    critRate: 0.6,
    normalMin: NORMAL_MIN,
    normalMax: NORMAL_MAX,
    flashColor: 'bg-orange-500',
    textColor: 'text-orange-400',
  },
  mantis: {
    key: 'mantis',
    name: '당랑권!',
    emoji: '🥋',
    description: '낫처럼 빠른 앞발 연속 공격',
    kind: 'attack',
    critRate: 0.55,
    normalMin: NORMAL_MIN,
    normalMax: NORMAL_MAX,
    flashColor: 'bg-lime-500',
    textColor: 'text-lime-400',
  },
  bee: {
    key: 'bee',
    name: '나비처럼 날아 벌처럼 쏜다!',
    emoji: '🐝',
    description: '휙 날았다가 침으로 정확히 한 방',
    kind: 'attack',
    critRate: 0.5,
    normalMin: NORMAL_MIN,
    normalMax: NORMAL_MAX,
    flashColor: 'bg-amber-400',
    textColor: 'text-amber-300',
  },
  butterfly: {
    key: 'butterfly',
    name: '흔들흔들 회피!',
    emoji: '🦋',
    description: '살랑살랑 피해서 공격을 덜 받아',
    kind: 'defense',
    critRate: 0.5,
    normalMin: NORMAL_MIN,
    normalMax: NORMAL_MAX,
    flashColor: 'bg-sky-400',
    textColor: 'text-sky-300',
  },
  other: {
    key: 'other',
    name: '웅크리기!',
    emoji: '🛡️',
    description: '몸을 꽉 말아 단단하게 버텨',
    kind: 'defense',
    critRate: 0.6,
    normalMin: NORMAL_MIN,
    normalMax: NORMAL_MAX,
    flashColor: 'bg-slate-300',
    textColor: 'text-slate-200',
  },

  // ── LV3 부터 추가되는 공통기 ─────────────────────────────
  // 기본기가 공격형이면 수비를, 수비형이면 공격을 받는다. 그래서 둘 다 갖추게 된다.
  commonDefense: {
    key: 'commonDefense',
    name: '바위처럼!!',
    emoji: '🪨',
    description: '바위가 되어 버틴다! 받는 피해를 크게 줄여',
    kind: 'defense',
    critRate: 0.6,
    normalMin: 0.3,
    normalMax: 0.3,
    flashColor: 'bg-stone-300',
    textColor: 'text-stone-200',
  },
  commonAttack: {
    key: 'commonAttack',
    name: '공격!!',
    emoji: '💥',
    description: '있는 힘껏 밀어붙인다!',
    kind: 'attack',
    critRate: 0.6,
    normalMin: 0.3,
    normalMax: 0.3,
    flashColor: 'bg-rose-500',
    textColor: 'text-rose-400',
  },
};

/** 두 번째 필살기가 열리는 레벨. */
export const SECOND_MOVE_LEVEL = 3;

/**
 * 곤충 종류로 기본 필살기(LV1)를 정합니다.
 *
 * ⚠️ **`insects.species` 에는 키(`stag`)가 아니라 한글 이름(`사슴벌레`)이 저장됩니다.**
 * (`app/upload/page.tsx` 가 `speciesLabel(species)` 로 저장하기 때문)
 * 그래서 키로만 찾으면 **모든 곤충이 기타곤충의 웅크리기로 나와버립니다.**
 * `findSpecies` 가 키와 한글 이름을 모두 받아주므로 그걸 거칩니다.
 *
 * 모르는 종이 들어오면 `기타 곤충`의 웅크리기로 둡니다. 옛 데이터나 오타로
 * 배틀이 통째로 멈추는 것보다 낫습니다.
 */
export function baseMoveFor(species: string | null | undefined): SpecialMove {
  const found = findSpecies(species);
  const key = (found?.key ?? 'other') as SpecialMoveKey;
  return SPECIAL_MOVES[key] ?? SPECIAL_MOVES.other;
}

/**
 * LV3 부터 열리는 두 번째 필살기. 기본기와 **반대 형**입니다.
 * 레벨이 모자라면 `null` — 이때는 배틀에서 필살기 기회가 한 번만 뜹니다.
 */
export function secondMoveFor(
  species: string | null | undefined,
  level: number
): SpecialMove | null {
  if (!Number.isFinite(level) || level < SECOND_MOVE_LEVEL) return null;
  return baseMoveFor(species).kind === 'attack'
    ? SPECIAL_MOVES.commonDefense
    : SPECIAL_MOVES.commonAttack;
}

/** 그 곤충이 배틀에서 쓸 수 있는 필살기 전부 (순서대로 시전). */
export function movesFor(species: string | null | undefined, level: number): SpecialMove[] {
  const second = secondMoveFor(species, level);
  return second ? [baseMoveFor(species), second] : [baseMoveFor(species)];
}

/**
 * 이번 배틀에서 그 기술이 실제로 낼 효과 크기를 굴립니다.
 *
 * ⚠️ **배틀 시작 때 한 번만 굴려두고 재사용해야 합니다.** 매번 굴리면
 * "필살기를 썼는데 아까보다 나빠졌다"가 생깁니다. (크리티컬을 미리 굴려두는 것과 같은 이유)
 */
export function rollMoveRate(move: SpecialMove, crit: boolean, random = Math.random): number {
  if (crit) return move.critRate;
  return move.normalMin + random() * (move.normalMax - move.normalMin);
}

// ─────────────────────────────────────────────────────────────
// 타이밍 판정 (2026-09-19, Jin 요청)
//
// 필살기 버튼이 그냥 "누르면 발동"이 아니라, 리듬게임처럼 **타이밍**을 맞추게 합니다.
// 큰 고리가 4초 동안 줄어들면서 2초 지점에서 목표 고리와 정확히 겹칩니다.
// 그때 누르면 퍼펙트. 빨라도 늦어도 위력이 떨어집니다.
//
// 타이밍 보너스는 **기술과 무관하게 내 점수에만** 곱합니다.
// 기술 자체의 효과를 키우면 수비형만 유독 세지는 등 밸런스가 틀어집니다.
// ─────────────────────────────────────────────────────────────

/** 고리가 목표와 겹치는 순간 (버튼이 뜬 뒤 몇 ms). */
export const PERFECT_AT_MS = 2000;

export interface TimingTier {
  key: 'perfect' | 'great' | 'good' | 'ok';
  label: string;
  emoji: string;
  /** 퍼펙트 순간에서 이만큼 안쪽이면 이 등급 */
  withinMs: number;
  /** 내 점수에 곱하는 값 */
  scoreMultiplier: number;
  textColor: string;
  ringColor: string;
}

// 부스에 오는 아이들 기준이라 판정을 넉넉하게 잡았습니다.
// 어른 기준으로 맞추면 대부분 "발동!"만 보고 재미를 못 느낍니다.
export const TIMING_TIERS: TimingTier[] = [
  {
    key: 'perfect',
    label: '퍼펙트!',
    emoji: '✨',
    withinMs: 250,
    scoreMultiplier: 1.35,
    textColor: 'text-amber-300',
    ringColor: 'border-amber-300',
  },
  {
    key: 'great',
    label: '굿!',
    emoji: '👍',
    withinMs: 550,
    scoreMultiplier: 1.2,
    textColor: 'text-emerald-300',
    ringColor: 'border-emerald-300',
  },
  {
    key: 'good',
    label: '굿!',
    emoji: '👍',
    withinMs: 900,
    scoreMultiplier: 1.1,
    textColor: 'text-sky-300',
    ringColor: 'border-sky-300',
  },
  {
    key: 'ok',
    label: '안돼!!',
    emoji: '😣',
    withinMs: Number.POSITIVE_INFINITY,
    scoreMultiplier: 1,
    textColor: 'text-rose-300',
    ringColor: 'border-slate-300',
  },
];

// ── 🔄 되받아치기 (2026-10-03 밤 Jin: "상대 공격·필살기 때 30% 확률로, 내 필살기 고리보다 2.5~3배 빠르게.
//    퍼펙트면 그 기술 그대로 되받아치기, 피해 그대로") ─────────────────────────
// 배틀마다 한 번 굴려서 COUNTER_CHANCE 면, 상대가 처음 공격할 때 **빨간 고리**가 뜬다.
// 고리는 COUNTER_SPEED 배 빠르고(4초 → 1.6초) 퍼펙트 칸도 같은 비율로 좁다(±250 → ±100ms). **퍼펙트만** 성공.
// 성공하면 그 공격을 안 맞고 그대로 상대가 맞는다 (resolveBattle 의 reflectA).
export const COUNTER_CHANCE = 0.3;
export const COUNTER_SPEED = 2.5;

/** 되받아치기 고리에서 퍼펙트인지 */
export function judgeCounter(elapsedMs: number): boolean {
  return Math.abs(elapsedMs - PERFECT_AT_MS / COUNTER_SPEED) <= TIMING_TIERS[0].withinMs / COUNTER_SPEED;
}

/** 버튼이 뜬 뒤 몇 ms에 눌렀는지로 등급을 매깁니다. */
export function judgeTiming(elapsedMs: number): TimingTier {
  const off = Math.abs(elapsedMs - PERFECT_AT_MS);
  return TIMING_TIERS.find((tier) => off <= tier.withinMs) ?? TIMING_TIERS[TIMING_TIERS.length - 1];
}
