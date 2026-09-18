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
