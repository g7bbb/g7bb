'use client';

import { useEffect, useState } from 'react';
import { loadPastTop10, PastRankRow } from '@/lib/past-ranking';
import { PAST_EVENT } from '@/lib/event-config';

/**
 * 🏆 지난 행사(대전) 1~10위 — 인천 순위표 옆에 **작게** (2026-11-20 Jin).
 * 이름 · 레벨 · ⚔️공격력. 기록이 없거나 못 받으면 아무것도 안 그린다 (순위표는 그대로 떠야 한다).
 */
export default function PastTop10({ className = '' }: { className?: string }) {
  const [rows, setRows] = useState<PastRankRow[] | null>(null);
  useEffect(() => {
    loadPastTop10().then(setRows);
  }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <section
      className={`rounded-2xl border border-slate-600 bg-slate-900/80 p-3 flex flex-col gap-1.5 ${className}`}
      style={{ wordBreak: 'keep-all' }}
    >
      <p className="text-sm font-black text-slate-200 leading-tight">
        🏆 지난 {PAST_EVENT.short} 행사 TOP 10
        <span className="block text-[0.7rem] font-normal text-slate-400">{PAST_EVENT.name} · ⚔️ 공격력</span>
      </p>
      <ol className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.rank} className="flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-2 py-1 text-xs">
            <span className="w-5 shrink-0 text-center font-black text-amber-300">
              {['🥇', '🥈', '🥉'][r.rank - 1] ?? r.rank}
            </span>
            <span className="min-w-0 flex-1 leading-tight [overflow-wrap:anywhere]">
              <span className="font-bold text-slate-100">{r.nickname}</span>
              <span className="block text-[0.65rem] text-slate-400">
                {r.kid ? `👦 ${r.kid} · ` : ''}LV.{r.level}
              </span>
            </span>
            <span className="shrink-0 font-black text-rose-300">⚔️ {r.atk}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
