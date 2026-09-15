'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface RankRow {
  player_id: string;
  nickname: string;
  best_score: number;
}

export default function RankingPage() {
  const [tab, setTab] = useState<'today' | 'all'>('today');
  const [rows, setRows] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRanking(tab);
  }, [tab]);

  async function loadRanking(mode: 'today' | 'all') {
    setLoading(true);
    // battles 테이블은 insects를 insect_id(내 곤충), opponent_insect_id(상대 곤충) 두 방식으로 참조하므로
    // 어떤 외래키 관계를 쓸지 명시해야 합니다 (insect_id 기준으로 참여자 닉네임을 가져옴).
    let query = supabase
      .from('battles')
      .select('player_id, score, insects!battles_insect_id_fkey(nickname), created_at')
      .order('score', { ascending: false })
      .limit(200);

    if (mode === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfDay.toISOString());
    }

    const { data } = await query;
    const best = new Map<string, RankRow>();
    (data || []).forEach((row: any) => {
      const nickname = row.insects?.nickname || '이름없음';
      const existing = best.get(row.player_id);
      if (!existing || row.score > existing.best_score) {
        best.set(row.player_id, { player_id: row.player_id, nickname, best_score: row.score });
      }
    });

    setRows(
      Array.from(best.values())
        .sort((a, b) => b.best_score - a.best_score)
        .slice(0, 20)
    );
    setLoading(false);
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold text-center">🏆 랭킹</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('today')}
          className={`flex-1 py-3 rounded-xl font-semibold ${
            tab === 'today' ? 'bg-amber-400 text-slate-900' : 'bg-slate-800'
          }`}
        >
          오늘의 랭킹
        </button>
        <button
          onClick={() => setTab('all')}
          className={`flex-1 py-3 rounded-xl font-semibold ${
            tab === 'all' ? 'bg-amber-400 text-slate-900' : 'bg-slate-800'
          }`}
        >
          전체 랭킹
        </button>
      </div>

      {loading ? (
        <p className="text-center text-slate-400">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-slate-400">아직 배틀 기록이 없어요.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li
              key={row.player_id}
              className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3"
            >
              <span className="font-bold">
                {i + 1}. {row.nickname}
              </span>
              <span className="text-emerald-400 font-bold">{row.best_score}점</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
