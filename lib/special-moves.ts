import { CoreStats, StatKey } from './types';

// ─────────────────────────────────────────────────────────────
// 필살기 (배틀당 1번)
//
// **어떤 필살기를 쓸지 아이가 따로 고르지 않습니다.**
// 곤충의 가장 높은 능력치가 곧 그 곤충의 필살기가 됩니다.
// 종이(마킹란)를 한 줄도 늘리지 않으면서, 아이마다 다른 필살기가 나오게 하는 방법입니다.
// "내 곤충은 다리를 세게 그려서 그림자 숨기가 나왔어!" 처럼 그림과 기술이 연결됩니다.
//
// 밸런스: 다섯 기술 모두 **내 점수 / 상대 점수 비율이 약 1.35배**가 되도록 맞춰져 있습니다.
// 어떤 기술이 나와도 손해가 아니고, 연출과 느낌만 다릅니다.
// 숫자를 바꾸고 싶으면 이 파일만 고치면 됩니다.
// ─────────────────────────────────────────────────────────────

export type SpecialMoveKey = StatKey;

export interface SpecialMove {
  key: SpecialMoveKey;
  name: string;
  emoji: string;
  /** 아이에게 보여줄 한 줄 설명 */
  description: string;
  /** 내 점수에 곱하는 값 */
  selfMultiplier: number;
  /** 상대 점수에 곱하는 값 */
  opponentMultiplier: number;
  /** 화면 전체를 덮는 섬광 색 */
  flashColor: string;
  /** 기술 이름 글자 색 */
  textColor: string;
}

export const SPECIAL_MOVES: Record<SpecialMoveKey, SpecialMove> = {
  atk: {
    key: 'atk',
    name: '큰턱 강타',
    emoji: '⚔️',
    description: '온 힘을 모아 한 방! 내 공격이 확 세져',
    selfMultiplier: 1.35,
    opponentMultiplier: 1,
    flashColor: 'bg-red-500',
    textColor: 'text-red-400',
  },
  def: {
    key: 'def',
    name: '철갑 방어',
    emoji: '🛡️',
    description: '갑옷을 딱 굳혀서 상대 공격을 튕겨내',
    selfMultiplier: 1,
    opponentMultiplier: 0.74,
    flashColor: 'bg-sky-400',
    textColor: 'text-sky-300',
  },
  hp: {
    key: 'hp',
    name: '불굴의 생명력',
    emoji: '💚',
    description: '쓰러질 뻔해도 다시 일어나! 체력이 되살아나',
    selfMultiplier: 1.18,
    opponentMultiplier: 0.87,
    flashColor: 'bg-emerald-400',
    textColor: 'text-emerald-300',
  },
  surv: {
    key: 'surv',
    name: '그림자 숨기',
    emoji: '🌫️',
    description: '스윽 사라져서 상대가 나를 못 때려',
    selfMultiplier: 1.1,
    opponentMultiplier: 0.81,
    flashColor: 'bg-violet-500',
    textColor: 'text-violet-300',
  },
  int: {
    key: 'int',
    name: '약점 간파',
    emoji: '🔮',
    description: '상대의 약점을 딱 찾아내서 정확히 노려',
    selfMultiplier: 1.25,
    opponentMultiplier: 0.92,
    flashColor: 'bg-amber-400',
    textColor: 'text-amber-300',
  },
};

// 능력치가 똑같이 높을 때 무엇을 먼저 고를지 정해둡니다. (매번 같은 기술이 나와야 아이가 헷갈리지 않음)
const PRIORITY: SpecialMoveKey[] = ['atk', 'surv', 'def', 'int', 'hp'];

/** 곤충의 가장 높은 능력치로 필살기를 정합니다. */
export function specialMoveFor(stats: CoreStats | null | undefined): SpecialMove {
  if (!stats) return SPECIAL_MOVES.atk;

  let best: SpecialMoveKey = PRIORITY[0];
  PRIORITY.forEach((key) => {
    const value = Number(stats[key] ?? 0);
    const bestValue = Number(stats[best] ?? 0);
    if (value > bestValue) best = key;
  });
  return SPECIAL_MOVES[best];
}

// ─────────────────────────────────────────────────────────────
// 타이밍 판정 (2026-09-19, Jin 요청)
//
// 필살기 버튼이 그냥 "누르면 발동"이 아니라, 리듬게임처럼 **타이밍**을 맞추게 합니다.
// 큰 고리가 4초 동안 줄어들면서 2초 지점에서 목표 고리와 정확히 겹칩니다.
// 그때 누르면 퍼펙트. 빨라도 늦어도 위력이 떨어집니다.
//
// 왜 "내 점수에 곱하기"로 했나:
// 기술마다 selfMultiplier / opponentMultiplier 가 달라서, 기술 배수 자체를 키우면
// 철갑 방어(상대를 깎는 기술)만 유독 세지는 등 밸런스가 틀어집니다.
// 타이밍 보너스는 **기술과 무관하게 내 점수에만** 곱해서 다섯 기술 모두 똑같이 이득을 봅니다.
//
// 밸런스 감각:
//   나·상대 둘 다 필살기 → 비김 (1.35 대 1.35)
//   내가 퍼펙트까지 → 1.35배 유리
//   내가 버튼을 놓침   → 0.74배 불리
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
    label: '그레이트!',
    emoji: '🔥',
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
    label: '발동!',
    emoji: '💥',
    withinMs: Number.POSITIVE_INFINITY,
    scoreMultiplier: 1,
    textColor: 'text-slate-200',
    ringColor: 'border-slate-300',
  },
];

/** 버튼이 뜬 뒤 몇 ms에 눌렀는지로 등급을 매깁니다. */
export function judgeTiming(elapsedMs: number): TimingTier {
  const off = Math.abs(elapsedMs - PERFECT_AT_MS);
  return TIMING_TIERS.find((tier) => off <= tier.withinMs) ?? TIMING_TIERS[TIMING_TIERS.length - 1];
}
