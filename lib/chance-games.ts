// 🎮 필살기 미니게임 3종 (2026-11-28 Jin, 부산 행사 준비)
//
// Jin: "필살기·기술 쓰는 게 너무 액티브하지 못해. ① 기존 타이밍 버튼 ② 이지투디제이처럼 내려오는 바를 차례대로 눌러 게이지 채우기
//       ③ 화면에 뜬 수액을 연타 — 많이 할수록 내 HP 가 차거나 적 HP 가 깎이기. 한 게임에서 2개는 나오게."
//
// ⚖️ 밸런스는 그대로: 세 게임 모두 결과를 **같은 등급(TIMING_TIERS: 퍼펙트 1.35 · 굿 1.2/1.1 · 못함 1.0)** 으로 바꾼다.
//    승패 계산(resolveBattle)·시뮬레이션 숫자는 안 바뀐다. 바뀌는 건 "등급을 따는 방법" 뿐.
//
// 🔄 되받아치기(빨간 빠른 고리)는 그대로 고리만 쓴다 — 그건 상대 공격을 받아치는 다른 장치라서.
import { TIMING_TIERS, TimingTier } from './special-moves';

export type ChanceKind = 'ring' | 'rhythm' | 'sap';
export const CHANCE_KINDS: ChanceKind[] = ['ring', 'rhythm', 'sap'];

export const CHANCE_KIND_LABEL: Record<ChanceKind, string> = {
  ring: '⏱ 타이밍 맞추기',
  rhythm: '🎵 리듬 게이지',
  sap: '🍯 수액 연타',
};

/**
 * 이번 기회는 어떤 게임?
 * - 랭킹 도전 1게임(3판)은 판마다 한 칸씩 돌려서 **세 게임이 다 나온다** (Jin "한 게임에서 2개는").
 * - 한 판에 필살기 기회가 2번 이상(LV3~·"한 번 더")이면 그 판 안에서도 서로 다른 게임.
 * @param battleIndex 이번 게임에서 몇 번째 판인지 (0부터). 연습·보스처럼 판 번호가 없으면 아무 수.
 * @param chanceIndex 이번 판에서 몇 번째 기회인지 (0부터)
 * @param offset      게임마다 무작위 시작점 (0~2) — 첫 판이 늘 같은 게임이면 지루하니까
 */
export function chanceKindFor(battleIndex: number, chanceIndex: number, offset: number): ChanceKind {
  const i = (((offset + battleIndex + chanceIndex) % 3) + 3) % 3;
  return CHANCE_KINDS[i];
}

const [PERFECT, GREAT, GOOD, OK] = TIMING_TIERS;

// ── 🎵 리듬 게이지 ─────────────────────────────────────────
// 줄 3개(왼·가운데·오른쪽)로 음표 6개가 차례로 내려온다. 판정선에 닿을 때 그 줄을 누르면 게이지가 찬다.
// 아이용이라 넉넉하게: 딱 맞음 ±170ms(한 칸 가득) · 거의 ±340ms(반 칸). 엉뚱한 줄을 눌러도 벌점은 없다.
export const RHYTHM_NOTES = 6;
export const RHYTHM_LANES = 3;
/** 음표가 위에서 판정선까지 내려오는 시간 */
export const RHYTHM_FALL_MS = 1500;
/** 음표 사이 간격 */
export const RHYTHM_GAP_MS = 560;
export const RHYTHM_PERFECT_MS = 170;
export const RHYTHM_GOOD_MS = 340;

export interface RhythmNote {
  lane: number;
  /** 시작부터 판정선에 닿는 시각(ms) */
  at: number;
}

/** 음표 순서. 같은 줄이 세 번 연달아 나오지 않게 (아이가 한 손가락으로 연타만 하면 재미가 없다). */
export function makeRhythmChart(rand: () => number = Math.random): RhythmNote[] {
  const notes: RhythmNote[] = [];
  for (let i = 0; i < RHYTHM_NOTES; i++) {
    let lane = Math.floor(rand() * RHYTHM_LANES);
    if (i >= 2 && notes[i - 1].lane === lane && notes[i - 2].lane === lane) lane = (lane + 1) % RHYTHM_LANES;
    notes.push({ lane, at: RHYTHM_FALL_MS + i * RHYTHM_GAP_MS });
  }
  return notes;
}

/** 리듬이 끝나는 시각 (마지막 음표 + 늦게 누를 여유) */
export function rhythmEndMs(chart: RhythmNote[]): number {
  return (chart[chart.length - 1]?.at ?? 0) + RHYTHM_GOOD_MS + 250;
}

/** 한 번 누른 게 몇 점인지: 1 = 딱 맞음, 0.5 = 거의, 0 = 놓침 */
export function rhythmHitScore(offMs: number): number {
  const off = Math.abs(offMs);
  if (off <= RHYTHM_PERFECT_MS) return 1;
  if (off <= RHYTHM_GOOD_MS) return 0.5;
  return 0;
}

/** 게이지(0~1) → 등급. 6개 중 5개쯤 딱 맞추면 퍼펙트. */
export function rhythmTier(gauge: number): TimingTier {
  if (gauge >= 0.82) return PERFECT;
  if (gauge >= 0.58) return GREAT;
  if (gauge >= 0.3) return GOOD;
  return OK;
}

// ── 🍯 수액 연타 ───────────────────────────────────────────
// 4초 동안 수액을 마구 누른다. 공격 필살기면 상대 HP 가 깎이고, 수비 필살기면 내 HP 가 찬다(보여주기).
// 한 번 누르고 다음 누름까지 최소 55ms (두 손가락 비비기·폰이 두 번 세는 것 막기 → 초당 최대 18번).
export const SAP_READY_MS = 700;
export const SAP_MS = 4000;
export const SAP_MIN_GAP_MS = 55;
/** 등급 기준 (누른 횟수) — 초등 저학년이 한 손가락으로 열심히 하면 굿, 두 손가락으로 빠르게 하면 퍼펙트 */
export const SAP_TAPS = { perfect: 28, great: 19, good: 10 };

export function sapTier(taps: number): TimingTier {
  if (taps >= SAP_TAPS.perfect) return PERFECT;
  if (taps >= SAP_TAPS.great) return GREAT;
  if (taps >= SAP_TAPS.good) return GOOD;
  return OK;
}

/** 못 했을 때 글자 — 게임마다 말을 다르게 (고리는 원래 "타이밍을 맞춰야해 ㅠ") */
export const CHANCE_MISS_TEXT: Record<ChanceKind, string> = {
  ring: '😣 타이밍을 맞춰야해 ㅠ',
  rhythm: '😣 음표를 더 맞춰야해 ㅠ',
  sap: '😣 더 빨리 눌러야해 ㅠ',
};
