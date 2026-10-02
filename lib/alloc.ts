import { CoreStats } from './types';

// ─────────────────────────────────────────────────────────────
// 다시 온 아이의 레벨업 포인트 (2026-10-01 Jin: "아이가 올릴 걸 고름")
//
// QR 로 다시 와서 "내 곤충 키울래" 를 고르면 경험치를 받고(lib/leveling.ts), **레벨이 오르면**
// 오른 레벨 × 3 포인트를 받는다. (LV5 까지는 올 때마다 오르고, 그 뒤로는 50%·30% 라 안 오를 때도 있다)
// 아이가 HP·공격·수비·지능·회피 중 원하는 곳에 직접 나눠 준다.
//
// ⚠️ **어디에 몰아줘도 손해도 이득도 없게** 한 포인트의 값을 능력치마다 다르게 맞췄다.
// 똑같이 +5% 로 두면 배틀 계산에서 HP 가 제일 크게 작용해서 다들 HP 에만 몰아준다.
// 2026-10-01 레벨 재설계 때 **반으로 줄였다** (3포인트 몰아주기 vs 없음 59~61% → 55%).
// 그대로 두면 2회차 아이가 1회차를 75% 넘게 이겨서 "다회차가 무조건 이김" 이 됐다.
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
  /** 무엇을 해주는지 (아이 눈높이, 10/2 Jin "설명이 너무 대충") */
  desc: string;
}[] = [
  { key: 'hp', label: 'HP', emoji: '💚', per: 0.02, percent: true, hint: '오래 버텨', desc: '체력이야. 높을수록 오래 버텨서 끝까지 살아남아!' },
  { key: 'atk', label: '공격력', emoji: '⚔️', per: 0.025, percent: true, hint: '세게 때려', desc: '세게 때려서 상대 HP 를 더 많이 깎아!' },
  { key: 'def', label: '수비력', emoji: '🛡️', per: 0.025, percent: true, hint: '덜 아파', desc: '맞아도 덜 아파. 상대 공격을 잘 버텨!' },
  { key: 'int', label: '지능', emoji: '🧠', per: 3, percent: false, hint: '공격·수비 둘 다 조금씩', desc: '똑똑해져서 공격력·수비력이 같이 조금씩 올라!' },
  { key: 'eva', label: '회피력', emoji: '💨', per: 5, percent: false, hint: '필살기를 쏙 피해', desc: '상대 필살기를 통째로 피할 확률이 올라가!' },
];

/** "+1 포인트 = …" 한 줄 */
export function allocPerLabel(row: { per: number; percent: boolean; label: string }): string {
  return row.percent ? `포인트 1개 = ${row.label} +${Math.round(row.per * 1000) / 10}%` : `포인트 1개 = ${row.label} +${row.per}`;
}

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
