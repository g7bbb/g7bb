import { CoreStats, StatKey } from './types';
import { findSpecies } from './species';

// "특별 진화" — 아이가 상상해서 실제 곤충보다 많이 그린 부위입니다.
//
// 이 체험은 도감이 아니라 아이의 그림이 살아나는 놀이입니다. 그래서 턱을 4개 그렸으면
// 4개로 그려줍니다. 다만 많이 달수록 무조건 유리해지면 배틀이 시시해지므로,
// 얻는 만큼 잃게 만들어 "진화는 공짜가 아니다"를 체감하게 합니다.
//
// 밸런스를 바꾸고 싶으면 아래 bonus / penalty 의 perStep 숫자만 고치면 됩니다.
//
// ⚠️ "정상 개수"는 종마다 다릅니다 (2026-09-18).
// 나비·벌·사마귀는 원래 날개가 4장이므로, 4장을 그려도 진화가 아닙니다.
// 종별 기준값은 lib/species.ts 의 normalWings 에 있습니다.

export type MutationKey = 'mandibles' | 'wings' | 'legs' | 'antennae';

export interface MutationOption {
  key: MutationKey;
  label: string;
  // 대부분의 곤충에서의 정상 개수. 종에 따라 달라지는 값은 normalCountsFor() 가 덮어씁니다.
  normal: number;
  choices: { value: number; label: string }[];
  bonus: { stat: StatKey; perStep: number };
  penalty: { stat: StatKey; perStep: number }[];
  // 부스에서 아이에게 읽어줄 한 줄 설명
  hint: string;
}

export const MUTATIONS: MutationOption[] = [
  {
    key: 'mandibles',
    label: '큰턱 (집게)',
    normal: 2,
    choices: [
      { value: 2, label: '2개' },
      { value: 3, label: '3개' },
      { value: 4, label: '4개 이상' },
    ],
    bonus: { stat: 'atk', perStep: 0.12 },
    penalty: [
      { stat: 'surv', perStep: 0.08 },
      { stat: 'int', perStep: 0.08 },
    ],
    hint: '공격은 세지지만 무거워서 잘 못 숨어',
  },
  {
    key: 'wings',
    label: '날개',
    normal: 2,
    // 날개는 실제로 한 쌍씩 늘어나고, 나비·벌·사마귀의 정상값(4장)이 선택지 안에 있어야 하므로
    // 2장 / 4장 / 6장 이상으로 둡니다.
    choices: [
      { value: 2, label: '2장' },
      { value: 4, label: '4장' },
      { value: 6, label: '6장 이상' },
    ],
    bonus: { stat: 'def', perStep: 0.12 },
    penalty: [{ stat: 'hp', perStep: 0.08 }],
    hint: '잘 피하지만 몸이 약해져',
  },
  {
    key: 'legs',
    label: '다리',
    normal: 6,
    choices: [
      { value: 6, label: '6개' },
      { value: 7, label: '7개' },
      { value: 8, label: '8개 이상' },
    ],
    bonus: { stat: 'surv', perStep: 0.12 },
    penalty: [{ stat: 'atk', perStep: 0.08 }],
    hint: '잘 도망가지만 힘이 나뉘어',
  },
  {
    key: 'antennae',
    label: '더듬이',
    normal: 2,
    choices: [
      { value: 2, label: '2개' },
      { value: 3, label: '3개 이상' },
    ],
    bonus: { stat: 'int', perStep: 0.18 },
    penalty: [{ stat: 'def', perStep: 0.1 }],
    hint: '잘 느끼지만 약점이 늘어나',
  },
];

export type MutationCounts = Record<MutationKey, number>;

/**
 * 이 종에서 "정상"으로 볼 개수입니다.
 * 날개만 종마다 다르고(나비·벌·사마귀는 4장), 나머지는 곤충 공통입니다.
 */
export function normalCountsFor(species?: string | null): MutationCounts {
  const matched = findSpecies(species);
  const base = {} as MutationCounts;
  MUTATIONS.forEach((option) => {
    base[option.key] = option.normal;
  });
  if (matched) base.wings = matched.normalWings;
  return base;
}

/** 아무것도 안 고쳤을 때의 기본값 = 그 종의 정상 개수 */
export function defaultMutations(species?: string | null): MutationCounts {
  return normalCountsFor(species);
}

/**
 * 정상보다 몇 단계 더 그렸는지 (0이면 보정 없음).
 *
 * 개수를 그냥 빼지 않고 **선택지 순서**로 셉니다.
 * 날개가 2 → 4 → 6 처럼 2씩 뛰기 때문에, 빼기로 세면 한 칸 올린 것이 두 단계로 계산됩니다.
 */
export function stepsAbove(
  option: MutationOption,
  counts: MutationCounts,
  species?: string | null
): number {
  const normal = normalCountsFor(species)[option.key];
  const values = option.choices.map((choice) => choice.value);

  const pickedIndex = values.indexOf(counts[option.key] ?? normal);
  const normalIndex = values.indexOf(normal);
  if (pickedIndex === -1 || normalIndex === -1) {
    // 선택지에 없는 값이 저장돼 있으면 옛 방식(빼기)으로 넘어갑니다.
    return Math.max(0, (counts[option.key] ?? normal) - normal);
  }
  return Math.max(0, pickedIndex - normalIndex);
}

export function hasAnyMutation(counts: MutationCounts, species?: string | null): boolean {
  return MUTATIONS.some((option) => stepsAbove(option, counts, species) > 0);
}

const clamp = (value: number) => Math.max(10, Math.min(100, Math.round(value)));

// 기본 능력치에 특별 진화의 보너스/페널티를 곱해서 최종 능력치를 만듭니다.
export function applyMutations(
  stats: CoreStats,
  counts: MutationCounts,
  species?: string | null
): CoreStats {
  const multipliers: Record<StatKey, number> = { atk: 1, def: 1, hp: 1, surv: 1, int: 1 };

  MUTATIONS.forEach((option) => {
    const steps = stepsAbove(option, counts, species);
    if (steps === 0) return;
    multipliers[option.bonus.stat] += option.bonus.perStep * steps;
    option.penalty.forEach((item) => {
      multipliers[item.stat] -= item.perStep * steps;
    });
  });

  return {
    atk: clamp(stats.atk * multipliers.atk),
    def: clamp(stats.def * multipliers.def),
    hp: clamp(stats.hp * multipliers.hp),
    surv: clamp(stats.surv * multipliers.surv),
    int: clamp(stats.int * multipliers.int),
  };
}

// 아이 화면과 이미지 생성 프롬프트에 함께 쓸 설명입니다. (예: "큰턱 4개 이상, 다리 8개 이상")
export function describeMutations(counts: MutationCounts, species?: string | null): string {
  return MUTATIONS.filter((option) => stepsAbove(option, counts, species) > 0)
    .map((option) => {
      const value = counts[option.key];
      const choice = option.choices.find((item) => item.value === value);
      return `${option.label} ${choice?.label ?? value}`;
    })
    .join(', ');
}
