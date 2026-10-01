import { CoreStats } from './types';

// ─────────────────────────────────────────────────────────────
// 다시 온 아이의 레벨업 포인트 (2026-10-01 Jin: "아이가 올릴 걸 고름")
//
// QR 로 다시 와서 "내 곤충 키울래" 를 고르면 레벨이 1 오르고 포인트를 받는다.
// 아이가 HP·공격·수비·지능·회피 중 원하는 곳에 직접 나눠 준다.
//
// ⚠️ **어디에 몰아줘도 손해도 이득도 없게** 한 포인트의 값을 능력치마다 다르게 맞췄다.
// 똑같이 +5% 로 두면 배틀 계산에서 HP 가 제일 크게 작용해서 다들 HP 에만 몰아준다.
// 숫자는 시뮬레이션(`tools/sim/balance.ts`)으로 맞췄다. 고치면 다시 돌릴 것.
//
// 저장 위치: `insects.stats.alloc` (원래 있던 jsonb 칸 → 마이그레이션 불필요).
// 배틀·카드는 `statsForInsect()` 가 이 값을 얹어서 계산한다.
// ─────────────────────────────────────────────────────────────

export const POINTS_PER_LEVELUP = 3;

export type AllocKey = 'hp' | 'atk' | 'def' | 'int' | 'eva';
export type Alloc = Partial<Record<AllocKey, number>>;

export const ALLOC_STATS: {
  key: AllocKey;
  label: string;
  emoji: string;
  /** 한 포인트가 주는 양 */
  per: number;
  /** true 면 비율(%), false 면 그냥 더하기 */
  percent: boolean;
  hint: string;
}[] = [
  { key: 'hp', label: 'HP', emoji: '💚', per: 0.04, percent: true, hint: '오래 버텨' },
  { key: 'atk', label: '공격력', emoji: '⚔️', per: 0.05, percent: true, hint: '세게 때려' },
  { key: 'def', label: '수비력', emoji: '🛡️', per: 0.05, percent: true, hint: '덜 아파' },
  { key: 'int', label: '지능', emoji: '🧠', per: 6, percent: false, hint: '공격·수비 둘 다 조금씩' },
  { key: 'eva', label: '회피력', emoji: '💨', per: 9, percent: false, hint: '필살기를 쏙 피해' },
];

export function readAlloc(stats: unknown): Alloc {
  const raw = (stats as any)?.alloc;
  if (!raw || typeof raw !== 'object') return {};
  const out: Alloc = {};
  ALLOC_STATS.forEach(({ key }) => {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n > 0) out[key] = Math.floor(n);
  });
  return out;
}

export function addAlloc(a: Alloc, b: Alloc): Alloc {
  const out: Alloc = { ...a };
  (Object.keys(b) as AllocKey[]).forEach((key) => {
    out[key] = (out[key] ?? 0) + (b[key] ?? 0);
  });
  return out;
}

export function allocTotal(alloc: Alloc): number {
  return Object.values(alloc).reduce((sum, n) => sum + (n ?? 0), 0);
}

/** 포인트를 능력치에 얹습니다. 회피력은 60(%) 를 넘지 않습니다. */
export function applyAlloc(stats: CoreStats, alloc: Alloc): CoreStats {
  const out = { ...stats };
  ALLOC_STATS.forEach(({ key, per, percent }) => {
    const n = alloc[key] ?? 0;
    if (!n) return;
    out[key] = percent ? out[key] * (1 + per * n) : out[key] + per * n;
  });
  out.hp = Math.round(out.hp);
  out.atk = Math.round(out.atk);
  out.def = Math.round(out.def);
  out.int = Math.round(out.int);
  out.eva = Math.min(60, Math.round(out.eva));
  return out;
}
