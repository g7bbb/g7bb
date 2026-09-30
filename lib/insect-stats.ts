import {
  AgeStageKey,
  BodyPart,
  BodyPartScores,
  CoreStats,
  EnvironmentKey,
  Insect,
} from './types';
import { MutationCounts, applyMutations } from './mutations';
import { ORIGIN_EFFECTS } from './origins';

// ─────────────────────────────────────────────────────────────
// 능력치 계산 (2026-09-30 Jin 재설계)
//
//   최종 능력치 = 신체부위(1~5점) → 성장단계 → 출신지 → 특별 진화
//
// 5개 능력치: 공격력 · 수비력 · HP · 지능 · 회피력  (+ 특별 능력치 성실함)
//   - 지능은 높을수록 배틀에서 공격력·수비력을 함께 올려준다.
//   - 회피력은 상대 필살기를 **통째로 피할** 확률이다.
//   - 성실함은 육감이 낮을 때만 생긴다. 맞을 때마다 버텨서 받는 피해가 줄어든다.
//
// Jin 규칙: 부위 점수 3 이 평균(변화 없음), 5 는 +2, 1 은 −2.
// 대신 **낮은 점수에는 회피력·성실함 같은 보상**이 붙어서, 전부 5점이 무조건 이기지 않게 했다.
// 목표(Jin 승인): 전부 5점이 전부 1점을 상대로 **55~60%** — 조금만 유리.
//
// ⚠️ 숫자를 고치면 **반드시 `tools/sim/balance.ts` 로 다시 돌려볼 것.**
// ─────────────────────────────────────────────────────────────

export const BODY_PARTS: { key: BodyPart; label: string; hint: string }[] = [
  { key: 'head', label: '머리 (턱)', hint: '공격력 · 지능 ↑ / 클수록 회피력 ↓' },
  { key: 'legs', label: '다리 (발톱)', hint: '공격력 · HP ↑ / 너무 크면 회피력 ↓' },
  { key: 'armor', label: '갑옷 (두께)', hint: 'HP · 수비력 ↑ / 두꺼울수록 회피력 ↓' },
  { key: 'wings', label: '날개', hint: 'HP · 수비력 ↑ / 클수록 회피력 ↓' },
  { key: 'eyes', label: '눈', hint: 'HP · 수비력 ↑ / 클수록 회피력 ↓' },
  { key: 'instinct', label: '육감', hint: '수비력 · 회피력 ↑ / 낮으면 성실함 💪 발동' },
  { key: 'genetics', label: '유전', hint: '높으면 HP ↑ / 낮으면 공격력 ↑' },
];

export interface AgeStage {
  key: AgeStageKey;
  label: string;
  /** 퍼센트. -10 = 10% 감소 */
  hp: number;
  atk: number;
  def: number;
  eva: number;
  xpMultiplier: number;
  /** 아이에게 보여줄 설명 */
  story: string;
}

// 성장단계 (Jin 설계, 1년충이 기준)
export const AGE_STAGES: AgeStage[] = [
  {
    key: 'newborn',
    label: '신생충',
    // Jin 원안은 HP·공·수 −10%, 회피 +5% 였는데 시뮬레이션에서 신생충 승률 35% 였다.
    // 2026-09-30 Jin 승인(A안): 깎이는 폭을 줄이고 회피를 크게 ("작아서 잘 피한다"를 확실하게).
    // A안의 −5%/+30% 로는 44% 여서 같은 방향으로 더 밀어 −3%/+80% 로 맞췄다 (신생충 49.4%).
    // 회피 +80% 는 커 보이지만 **비율**이라 회피력 20 → 36 정도다.
    hp: -3,
    atk: -3,
    def: -3,
    eva: 80,
    xpMultiplier: 1.0,
    story: '이제 막 태어난 아기 곤충이야! 아직 힘은 약하지만 몸이 작고 재빨라서 잘 피해.',
  },
  {
    key: 'yearling',
    label: '1년충',
    hp: 0,
    atk: 0,
    def: 0,
    eva: 0,
    xpMultiplier: 1.15,
    story: '1년 동안 쑥쑥 자란 곤충이야. 모든 능력치가 딱 기본이야!',
  },
  {
    key: 'veteran',
    label: 'n년충',
    hp: -5,
    atk: 5,
    def: 5,
    eva: 10,
    xpMultiplier: 1.3,
    story: '오랫동안 살아남은 베테랑 곤충이야! 체력은 조금 줄었지만 싸움 경험이 많아서 세고, 필살기도 잘 피해.',
  },
];

export function defaultBodyParts(): BodyPartScores {
  return { head: 3, legs: 3, armor: 3, wings: 3, eyes: 3, instinct: 3, genetics: 3 };
}

/**
 * 신체부위 효과를 얼마나 세게 반영할지 (1 = Jin 이 적은 비율 그대로).
 * Jin 이 "1~5점 사이 비율은 알아서 정해줘" 라고 해서, 전부 5점이 55~60% 가 되도록 시뮬레이션으로 맞춘 값이다.
 */
export const BODY_PART_STRENGTH = 0.2;

/**
 * 회피력·성실함 효과의 세기.
 *
 * 낮은 점수에 붙는 회피력·성실함은 **깎이는 것 없이 얹어주는 보상**이라, 너무 크면
 * "1점 몇 개 섞은 곤충"이 "전부 3점(평균)"보다 세지는 일이 생긴다 (처음 돌렸을 때 전부 3점이 43%).
 * Jin 규칙은 3점 = 평균이므로, 보상 크기를 줄여서 평균이 평균답게 나오게 맞췄다.
 */
export const EVA_STRENGTH = 0.5;

/** 전부 3점일 때의 값 = 기준점. 부위 효과는 여기서부터 늘거나 준다. */
const BASE = { hp: 192.5, atk: 57.5, def: 50, int: 50, eva: 20 };

/** 1~5 로 자릅니다 (종이에서 잘못 읽혔거나 옛날 데이터일 때 대비). */
const score = (value: number | undefined) => Math.max(1, Math.min(5, Math.round(value ?? 3)));

/**
 * 신체부위 7개(1~5점) → 능력치. Jin 이 적은 규칙을 그대로 옮기고, 마지막에 세기만 줄인다.
 *
 * d = 점수 − 3  (1점 → −2, 3점 → 0, 5점 → +2)
 */
function fromBodyParts(parts: BodyPartScores): CoreStats & { grit: number } {
  const head = score(parts.head);
  const legs = score(parts.legs);
  const armor = score(parts.armor);
  const wings = score(parts.wings);
  const eyes = score(parts.eyes);
  const instinct = score(parts.instinct);
  const genetics = score(parts.genetics);
  const d = (s: number) => s - 3;
  // "작을수록 회피력": 1점 +전부, 2점 +절반, 3점 0, 4점 −절반, 5점 −전부.
  //
  // ⚠️ Jin 규칙은 "1점이면 회피력 +" 쪽만 있었는데, **반대쪽(두꺼우면 둔하다)도 똑같이** 적용했다.
  // 한쪽만 두면 1점 몇 개 섞은 곤충이 공짜 보너스를 받아 "전부 3점(평균)"보다 세진다
  // (시뮬레이션에서 전부 3점 44%). Jin 이 정한 "3점 = 평균" 을 지키려면 양쪽이어야 한다.
  const lowBonus = (s: number, full: number) => (-d(s) / 2) * full;

  // HP — 갑옷이 몸통이다 (1점 150 ~ 5점 200). 날개·눈은 0~10 을 더하고, 유전은 5~10.
  const hp =
    150 + 12.5 * (armor - 1) + // 갑옷
    2.5 * (wings - 1) + // 날개
    2.5 * (eyes - 1) + // 눈
    5 + 1.25 * (genetics - 1) + // 유전
    5 * d(legs); // 다리 (생존능력 = HP)

  // Jin 의 "+2 / −2" 한 칸을 능력치 5 로 옮겼다.
  const atk =
    50 + 5 * d(head) + 5 * d(legs) +
    // 유전은 낮을수록 공격력 (1점 +2칸 → +10, 5점 0). Jin 은 +3칸이었는데 그러면 1점이 5점보다 세서 줄였다
    (10 * (5 - genetics)) / 4;

  const def = 50 + 5 * (d(armor) + d(wings) + d(eyes) + d(instinct));

  // 지능은 머리에서만 나온다. 한 칸에 10 이라 40 ~ 60.
  const int = 50 + 10 * d(head);

  const eva =
    20 -
    5 * d(head) - // 머리가 클수록 둔하다
    5 * Math.max(0, d(legs)) + // 다리는 3점을 넘어가면 무거워진다 (Jin: "3점에서 5점으로 갈수록")
    lowBonus(armor, 25) + // 갑옷이 얇으면 +5칸
    lowBonus(wings, 10) + // 날개가 작으면 +2칸
    lowBonus(eyes, 10) + // 눈이 작으면 +2칸
    5 * d(instinct); // 육감은 회피력을 올린다

  // 성실함 — 육감이 낮을수록. Jin: "1일 때 +5"
  const grit = instinct === 1 ? 5 : instinct === 2 ? 2 : 0;

  // 세기 조절: 기준점에서 벌어진 만큼만 BODY_PART_STRENGTH 배로 반영한다.
  const k = BODY_PART_STRENGTH;
  return {
    hp: BASE.hp + k * (hp - BASE.hp),
    atk: BASE.atk + k * (atk - BASE.atk),
    def: BASE.def + k * (def - BASE.def),
    int: BASE.int + k * (int - BASE.int),
    // 회피력은 따로 조절한다 (아래 EVA_STRENGTH 설명).
    eva: BASE.eva + EVA_STRENGTH * (eva - BASE.eva),
    grit,
  };
}

const pct = (value: number, percent: number) => value * (1 + percent / 100);
const round = (value: number) => Math.round(value);

export function ageStageOf(key: AgeStageKey | null | undefined): AgeStage {
  return AGE_STAGES.find((s) => s.key === key) ?? AGE_STAGES[1];
}

/**
 * 곤충의 최종 능력치.
 *
 * species 를 넘기면 그 종의 "정상 개수"를 기준으로 특별 진화를 계산합니다.
 * (나비·벌·사마귀는 날개 4장이 정상이라, 안 넘기면 4장을 그린 것만으로 보너스를 받아버립니다.)
 * origin 을 넘기면 출신지 보너스가 붙습니다.
 */
export function calculateStats(
  parts: BodyPartScores,
  ageStage: AgeStageKey,
  mutations?: MutationCounts,
  species?: string | null,
  origin?: EnvironmentKey | null
): CoreStats {
  const raw = fromBodyParts(parts);
  const age = ageStageOf(ageStage);
  const place = origin ? ORIGIN_EFFECTS[origin] : null;

  let stats: CoreStats = {
    hp: pct(pct(raw.hp, age.hp), place?.hp ?? 0),
    atk: pct(raw.atk, age.atk),
    def: pct(pct(raw.def, age.def), place?.def ?? 0),
    int: raw.int,
    eva: pct(pct(raw.eva, age.eva), place?.eva ?? 0),
    grit: raw.grit,
  };

  if (mutations) stats = applyMutations(stats, mutations, species);

  return {
    hp: round(stats.hp),
    atk: round(stats.atk),
    def: round(stats.def),
    int: round(stats.int),
    eva: Math.min(60, round(stats.eva)),
    grit: stats.grit ?? 0,
  };
}

/**
 * 저장된 곤충의 능력치를 **입력값에서 다시 계산**합니다.
 *
 * DB 의 `stats` 는 만들 당시의 공식으로 계산된 값이라, 공식이 바뀌면 옛 곤충만 옛 규칙으로 싸우게 됩니다.
 * (2026-09-30 재설계 전 곤충은 `surv` 는 있고 `eva` 가 없어서 그대로 쓰면 계산이 `NaN` 으로 깨집니다.)
 * 부위 점수가 없는 아주 옛날 데이터만 저장된 값을 씁니다.
 */
export function statsForInsect(
  insect: Pick<Insect, 'body_parts' | 'age_stage' | 'mutations' | 'species' | 'origin' | 'stats'>
): CoreStats {
  if (insect.body_parts) {
    return calculateStats(
      insect.body_parts,
      insect.age_stage,
      (insect.mutations ?? undefined) as MutationCounts | undefined,
      insect.species,
      insect.origin
    );
  }
  const old = (insect.stats ?? {}) as Partial<CoreStats> & { surv?: number };
  return {
    atk: old.atk ?? BASE.atk,
    def: old.def ?? BASE.def,
    hp: old.hp && old.hp > 100 ? old.hp : BASE.hp,
    int: old.int ?? BASE.int,
    eva: old.eva ?? BASE.eva,
    grit: old.grit ?? 0,
  };
}

// ── 화면에 그릴 때 쓰는 값 ─────────────────────────────────────
// 막대 길이를 정할 때의 "꽉 찬" 기준. 넘으면 막대는 꽉 찬 채로 숫자만 커진다.
export const STAT_BAR_MAX: Record<'atk' | 'def' | 'hp' | 'int' | 'eva', number> = {
  atk: 80,
  def: 80,
  hp: 280,
  int: 70,
  eva: 60,
};

export function statBarPercent(key: keyof typeof STAT_BAR_MAX, value: number): number {
  return Math.max(4, Math.min(100, Math.round((value / STAT_BAR_MAX[key]) * 100)));
}

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(xp / 50);
}

export function critChanceForLevel(level: number): number {
  return Math.min(0.5, 0.1 + (level - 1) * 0.02);
}

export function xpGainForBattle(won: boolean, ageStage: AgeStageKey): number {
  const stage = ageStageOf(ageStage);
  const base = 10 + (won ? 20 : 0);
  return Math.round(base * stage.xpMultiplier);
}

// 레벨이 오를수록 배틀에서 실제로 쓰이는 능력치에 소폭 보너스가 붙습니다.
// 저장된 기본 스탯 자체는 바뀌지 않고, 배틀 계산 시점에만 적용됩니다.
// 회피력은 확률이라 레벨로 키우지 않습니다 (계속 오르면 아무것도 안 맞게 됩니다).
export function statsWithLevelBonus(stats: CoreStats, level: number): CoreStats {
  const bonus = 1 + (level - 1) * 0.03;
  return {
    ...stats,
    atk: stats.atk * bonus,
    def: stats.def * bonus,
    hp: stats.hp * bonus,
    int: stats.int * bonus,
  };
}
