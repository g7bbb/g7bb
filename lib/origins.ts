import { EnvironmentKey } from './types';

// ─────────────────────────────────────────────────────────────
// 출신지 효과와 상성 (2026-09-30 Jin 설계)
//
// 출신지는 아이가 종이에 고른다. 이제 **능력치 보너스**와 **상성**이 붙는다.
//
// ⚠️ Jin 이 처음 쓴 표에서 두 가지를 바꿨다 (Jin 승인, 2026-09-30):
//
// 1) **운석충돌** — 원래 "HP+30%·수비+15%, 모든 출신지에게 강함" 이었다.
//    보너스도 제일 크고 상성까지 이기면 **아이들이 전부 운석충돌만 고른다.**
//    상품이 걸린 랭킹이라 그대로 둘 수 없었다.
//    → **상성 없음**(누구에게도 강하지도 약하지도 않은 안전한 선택),
//      보너스 크기는 다른 출신지와 비슷하게 줄였다.
//
// 2) **상성 구조** — 원래 표대로면 기온상승↔물근처가 **서로에게 약해서** 결국 상성이 없는 것과 같고,
//    저지대는 이길 상대가 하나도 없었다.
//    → **4개가 돌고 도는 가위바위보**로 바꿨다. 모두 하나씩 이기고 하나씩 진다.
//
//        물근처 → 기온상승 → 고지대 → 저지대 → 물근처
//        (물이 더위를 식히고 / 더위가 산 얼음을 녹이고 / 높은 곳이 낮은 곳을 내려다보고 / 낮은 땅이 물을 막는다)
//
// 숫자를 고치면 **반드시 시뮬레이션을 다시 돌릴 것** (`tools/sim/balance.ts`).
// 출신지끼리 보너스 크기가 어긋나면 그 출신지만 고르게 된다.
// ─────────────────────────────────────────────────────────────

export interface OriginEffect {
  /** 퍼센트. 20 = 20% 증가, -5 = 5% 감소 */
  hp: number;
  def: number;
  /** 필살기 회피력 */
  eva: number;
  /** 내가 이기는 출신지 (없으면 null) */
  beats: EnvironmentKey | null;
  /** 아이에게 보여줄 이야기 */
  story: string;
  /** 상성 한 줄 설명 (이기는 이유) */
  beatsWhy: string | null;
}

export const ORIGIN_EFFECTS: Record<EnvironmentKey, OriginEffect> = {
  meteor: {
    hp: 15,
    def: 5,
    eva: 0,
    beats: null,
    story: '하늘에서 운석이 쾅! 떨어진 곳에서 살아남은 곤충이야. 몸이 아주 튼튼해.',
    beatsWhy: null,
  },
  heat: {
    hp: 20,
    def: -5,
    eva: 0,
    beats: 'highland',
    story: '뜨거운 땅에서 버텨온 곤충이야. 체력은 엄청 좋은데 껍질이 조금 물러졌어.',
    beatsWhy: '뜨거운 열기로 산꼭대기 얼음을 녹여버려!',
  },
  lowland: {
    hp: 5,
    def: 15,
    eva: 0,
    beats: 'water',
    story: '낮은 땅에서 친구들과 부딪히며 자란 곤충이야. 껍질이 아주 단단해.',
    beatsWhy: '단단한 땅이 둑처럼 물을 막아버려!',
  },
  water: {
    hp: 10,
    def: 0,
    eva: 30,
    beats: 'heat',
    story: '물가에 사는 곤충이야. 몸이 미끌미끌해서 필살기를 쏙쏙 잘 피해.',
    beatsWhy: '시원한 물로 뜨거운 열기를 식혀버려!',
  },
  highland: {
    hp: 10,
    def: 10,
    eva: 0,
    beats: 'lowland',
    story: '높은 산에서 사는 곤충이야. 체력도 껍질도 골고루 좋아.',
    beatsWhy: '높은 곳에서 내려다보며 먼저 공격해!',
  },
};

/**
 * 상성에서 이긴 쪽이 받는 점수 보너스.
 * 0.07 = 7% 더 세진다. 이 숫자로 "상성이 얼마나 중요한가"가 정해진다.
 */
export const MATCHUP_BONUS = 0.07;

/** 나를 이기는 출신지 (없으면 null) */
export function weakTo(origin: EnvironmentKey): EnvironmentKey | null {
  const found = (Object.keys(ORIGIN_EFFECTS) as EnvironmentKey[]).find(
    (key) => ORIGIN_EFFECTS[key].beats === origin
  );
  return found ?? null;
}

/** 내 출신지가 상대 출신지를 상대로 이기면 1, 지면 -1, 상관없으면 0 */
export function matchup(mine: EnvironmentKey | null | undefined, theirs: EnvironmentKey | null | undefined): -1 | 0 | 1 {
  if (!mine || !theirs) return 0;
  if (ORIGIN_EFFECTS[mine]?.beats === theirs) return 1;
  if (ORIGIN_EFFECTS[theirs]?.beats === mine) return -1;
  return 0;
}
