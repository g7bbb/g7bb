'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { loadHeartCounts } from '@/lib/hearts';

// "예쁜 곤충 랭킹" 심사 화면입니다. 운영자 전용.
//
// 아이들 하트 수는 **참고용으로만** 보여주고, 최종 1~4위는 운영자가 직접 정합니다.
// 하트가 많아도 운영자 선택이 다를 수 있다는 것이 사용자가 정한 방침입니다.

const PAGE_SIZE = 24;
const RANKS = [1, 2, 3, 4];

interface JudgeInsect {
  id: string;
  nickname: string;
  species: string | null;
  image_base64: string;
  mime_type: string;
  judge_rank: number | null;
  created_at: string;
}

export default function JudgePage() {
  const [authed, setAuthed] = useState(false);
  const [code, setCode] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem('insect-battle-admin') === 'ok') setAuthed(true);
    } catch {
      // 저장소가 막혀 있으면 매번 암호를 다시 입력하면 됩니다.
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    const res = await fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setAuthError(data?.error || '암호가 맞지 않아요.');
      return;
    }
    try {
      window.sessionStorage.setItem('insect-battle-admin', 'ok');
    } catch {
      // 저장 실패는 무시합니다.
    }
    setAuthed(true);
  }

  if (!authed) {
    return (
      <main className="max-w-sm mx-auto min-h-screen flex flex-col justify-center gap-4 px-6">
        <h1 className="text-xl font-bold text-center">🔒 심사 화면</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="password"
            className="bg-slate-800 rounded-xl px-4 py-3"
            placeholder="운영자 암호"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {authError && <p className="text-red-400 text-sm text-center">{authError}</p>}
          <button className="bg-emerald-500 text-slate-900 font-bold py-3 rounded-xl">들어가기</button>
        </form>
      </main>
    );
  }

  return <JudgeBoard />;
}

function JudgeBoard() {
  const [insects, setInsects] = useState<JudgeInsect[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [shortlist, setShortlist] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'recent' | 'hearts'>('recent');
  const [onlyShortlist, setOnlyShortlist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const loadMore = useCallback(async (offset: number) => {
    setLoading(true);
    const { data } = await supabase
      .from('insects')
      .select('id, nickname, species, image_base64, mime_type, judge_rank, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    const rows = (data || []) as JudgeInsect[];
    setInsects((prev) => [...prev, ...rows]);
    if (rows.length < PAGE_SIZE) setDone(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      setCounts(await loadHeartCounts());
      await loadMore(0);
    }
    init();
  }, [loadMore]);

  function toggleShortlist(id: string) {
    setShortlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 같은 순위를 두 곤충이 갖지 않도록, 새 순위를 줄 때 기존 보유자는 비웁니다.
  async function setRank(insectId: string, rank: number | null) {
    setSaving(insectId);

    const previousHolder = rank ? insects.find((item) => item.judge_rank === rank) : undefined;
    if (previousHolder && previousHolder.id !== insectId) {
      await supabase.from('insects').update({ judge_rank: null }).eq('id', previousHolder.id);
    }
    await supabase.from('insects').update({ judge_rank: rank }).eq('id', insectId);

    setInsects((prev) =>
      prev.map((item) => {
        if (item.id === insectId) return { ...item, judge_rank: rank };
        if (previousHolder && item.id === previousHolder.id) return { ...item, judge_rank: null };
        return item;
      })
    );
    setSaving(null);
  }

  const visible = insects
    .filter((item) => (onlyShortlist ? shortlist.has(item.id) || item.judge_rank : true))
    .slice()
    .sort((a, b) => {
      if (sortBy === 'hearts') {
        return (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
      }
      return 0;
    });

  const picked = insects
    .filter((item) => item.judge_rank)
    .sort((a, b) => (a.judge_rank ?? 0) - (b.judge_rank ?? 0));

  return (
    <main className="max-w-5xl mx-auto min-h-screen flex flex-col gap-5 px-5 py-8">
      <header>
        <h1 className="text-2xl font-bold">🎨 예쁜 곤충 심사</h1>
        <p className="mt-1 text-sm text-slate-400">
          하트 수는 참고용이에요. 최종 순위는 직접 정하시면 됩니다.
        </p>
      </header>

      {/* 확정된 순위를 맨 위에 모아 보여줍니다. */}
      <section className="bg-slate-800 rounded-2xl p-4">
        <h2 className="font-bold mb-3">현재 확정 순위</h2>
        {picked.length === 0 ? (
          <p className="text-sm text-slate-400">아직 정한 순위가 없어요.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {picked.map((item) => (
              <li key={item.id} className="flex items-center gap-3 text-sm">
                <span className="font-bold text-amber-400 w-10">{item.judge_rank}위</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${item.mime_type};base64,${item.image_base64}`}
                  alt={item.nickname}
                  className="w-10 h-10 rounded object-cover"
                />
                <span className="flex-1 truncate">{item.nickname}</span>
                <span className="text-pink-400">❤️ {counts.get(item.id) ?? 0}</span>
                <button
                  onClick={() => setRank(item.id, null)}
                  className="text-slate-400 underline text-xs"
                >
                  해제
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex flex-wrap gap-2 text-sm">
        <button
          onClick={() => setSortBy('recent')}
          className={`px-4 py-2 rounded-xl ${sortBy === 'recent' ? 'bg-sky-500 text-slate-900 font-bold' : 'bg-slate-800'}`}
        >
          최신순
        </button>
        <button
          onClick={() => setSortBy('hearts')}
          className={`px-4 py-2 rounded-xl ${sortBy === 'hearts' ? 'bg-sky-500 text-slate-900 font-bold' : 'bg-slate-800'}`}
        >
          하트순
        </button>
        <button
          onClick={() => setOnlyShortlist((v) => !v)}
          className={`px-4 py-2 rounded-xl ${onlyShortlist ? 'bg-amber-400 text-slate-900 font-bold' : 'bg-slate-800'}`}
        >
          ⭐ 후보만 보기 ({shortlist.size})
        </button>
        <span className="px-4 py-2 text-slate-400">불러온 곤충 {insects.length}마리</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {visible.map((item) => (
          <div
            key={item.id}
            className={`bg-slate-800 rounded-2xl overflow-hidden border-2 ${
              item.judge_rank
                ? 'border-amber-400'
                : shortlist.has(item.id)
                  ? 'border-sky-500'
                  : 'border-transparent'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${item.mime_type};base64,${item.image_base64}`}
              alt={item.nickname}
              className="w-full aspect-square object-cover"
              loading="lazy"
            />
            <div className="px-3 py-2 flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold truncate">{item.nickname}</span>
                <span className="text-pink-400 shrink-0">❤️ {counts.get(item.id) ?? 0}</span>
              </div>
              {item.species && <p className="text-xs text-slate-400 truncate">{item.species}</p>}

              <button
                onClick={() => toggleShortlist(item.id)}
                className={`py-1.5 rounded-lg text-xs font-bold ${
                  shortlist.has(item.id) ? 'bg-sky-500 text-slate-900' : 'bg-slate-700'
                }`}
              >
                {shortlist.has(item.id) ? '⭐ 후보' : '후보 담기'}
              </button>

              <div className="flex gap-1">
                {RANKS.map((rank) => (
                  <button
                    key={rank}
                    onClick={() => setRank(item.id, item.judge_rank === rank ? null : rank)}
                    disabled={saving === item.id}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 ${
                      item.judge_rank === rank ? 'bg-amber-400 text-slate-900' : 'bg-slate-700'
                    }`}
                  >
                    {rank}위
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="text-center text-slate-400">불러오는 중...</p>}

      {!loading && !done && (
        <button
          onClick={() => loadMore(insects.length)}
          className="bg-slate-800 py-3 rounded-2xl font-semibold"
        >
          더 보기 ({PAGE_SIZE}마리씩)
        </button>
      )}
    </main>
  );
}
