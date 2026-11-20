'use client';

// 🔎 내 순위 보기 (2026-11-20 Jin: 카톡 채널 메시지에 링크로 넣어서, 번호만 치면 지금 순위가 보이게)
// - 순위 기준은 /ranking '전체' 와 같다: 이번 행사(SEASON_FROM) 기록 · 아이별 최고 점수 · 테스트 번호는 테스트끼리.
// - /ranking 은 상위 200줄만 보지만 여기는 **모든 기록**을 끊어 받아 정확한 등수를 센다 (그림 없이 2칸만이라 가볍다).
// - 번호(014)는 순위판·카드에 원래 보이는 값이라 비밀번호 없이 보여준다 (보여주는 것도 순위판과 같은 것뿐).
// - 주소로 바로: /my-rank?t=014

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SEASON_FROM, CURRENT_EVENT } from '@/lib/event-config';
import { displayTicket, isTestTicket, normalizeTicket } from '@/lib/ticket';
import { loadTestPlayerIds } from '@/lib/test-world';
import { BrandMark } from '@/app/brand-logo';

/** 상품을 주는 마지막 등수 (인천: 1~5위) */
const PRIZE_LAST = 5;
const REMEMBER_KEY = 'g7bb-myrank';
const MEDALS = ['🥇', '🥈', '🥉'];

interface Result {
  ticket: string;
  kid: string;
  insect: string;
  rank: number | null;
  total: number;
  score: number;
  /** 바로 위 등수까지 남은 점수 */
  gapUp: number | null;
  /** 상품권(5위)까지 남은 점수 */
  gapPrize: number | null;
  top: { rank: number; insect: string; kid: string; score: number; me: boolean }[];
}

/** 이번 행사 랭킹 기록 전부 (1000줄씩 끊어서) */
async function loadSeasonBattles(): Promise<{ player_id: string; insect_id: string; score: number }[]> {
  const out: { player_id: string; insect_id: string; score: number }[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase
      .from('battles')
      .select('player_id, insect_id, score')
      .gte('created_at', SEASON_FROM)
      .order('score', { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...((data || []) as any));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function lookUp(ticket: string): Promise<Result | 'none'> {
  const { data: player } = await supabase.from('players').select('id, display_name').eq('ticket_code', ticket).maybeSingle();
  if (!player || !(player as any).display_name) return 'none';
  const me = player as { id: string; display_name: string };

  const [battles, testIds] = await Promise.all([loadSeasonBattles(), loadTestPlayerIds()]);
  const viewerIsTest = isTestTicket(ticket);
  const best = new Map<string, { score: number; insect_id: string }>();
  battles.forEach((b) => {
    if (testIds.has(b.player_id) !== viewerIsTest) return;
    const cur = best.get(b.player_id);
    if (!cur || b.score > cur.score) best.set(b.player_id, { score: b.score, insect_id: b.insect_id });
  });
  const ranked = Array.from(best.entries())
    .map(([player_id, v]) => ({ player_id, ...v }))
    .sort((a, b) => b.score - a.score);

  const idx = ranked.findIndex((r) => r.player_id === me.id);
  const mine = idx >= 0 ? ranked[idx] : null;
  // 같은 점수는 같은 등수
  const rank = mine ? ranked.filter((r) => r.score > mine.score).length + 1 : null;

  const top = ranked.slice(0, PRIZE_LAST);
  const insectIds = Array.from(new Set([...top.map((r) => r.insect_id), mine?.insect_id].filter(Boolean))) as string[];
  const playerIds = top.map((r) => r.player_id);
  const [{ data: insects }, { data: kids }] = await Promise.all([
    insectIds.length ? supabase.from('insects').select('id, nickname').in('id', insectIds) : Promise.resolve({ data: [] as any[] }),
    playerIds.length ? supabase.from('players').select('id, display_name').in('id', playerIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const insectName = new Map((insects || []).map((r: any) => [r.id, r.nickname || '이름없음']));
  const kidName = new Map((kids || []).map((r: any) => [r.id, r.display_name || '']));

  let gapUp: number | null = null;
  let gapPrize: number | null = null;
  if (mine && rank && rank > 1) {
    // 바로 위 = 내 점수보다 높은 것 중 제일 낮은 점수
    const above = Math.min(...ranked.filter((r) => r.score > mine.score).map((r) => r.score));
    if (Number.isFinite(above)) gapUp = above - mine.score + 1;
    if (rank > PRIZE_LAST && ranked[PRIZE_LAST - 1]) gapPrize = ranked[PRIZE_LAST - 1].score - mine.score + 1;
  }

  return {
    ticket,
    kid: me.display_name,
    insect: mine ? insectName.get(mine.insect_id) ?? '' : '',
    rank,
    total: ranked.length,
    score: mine?.score ?? 0,
    gapUp,
    gapPrize,
    top: top.map((r) => ({
      rank: ranked.filter((x) => x.score > r.score).length + 1,
      insect: insectName.get(r.insect_id) ?? '이름없음',
      kid: kidName.get(r.player_id) ?? '',
      score: r.score,
      me: r.player_id === me.id,
    })),
  };
}

export default function MyRankPage() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  async function search(raw: string) {
    const ticket = normalizeTicket(raw);
    if (!ticket) {
      setError('종이 오른쪽 위 번호를 숫자로 적어줘 (예: 14)');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const found = await lookUp(ticket);
      if (found === 'none') {
        setResult(null);
        setError(`${displayTicket(ticket)}번으로 시작한 친구가 없어. 번호를 다시 봐줘!`);
      } else {
        setResult(found);
        try {
          localStorage.setItem(REMEMBER_KEY, ticket);
        } catch {}
      }
    } catch {
      setError('순위를 못 불러왔어. 잠깐 뒤에 다시 눌러줘!');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let start = new URLSearchParams(window.location.search).get('t') || '';
    if (!start) {
      try {
        start = localStorage.getItem(REMEMBER_KEY) || '';
      } catch {}
    }
    if (start) {
      const t = normalizeTicket(start);
      setInput(t ? displayTicket(t) : start);
      void search(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    void search(input);
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-5 px-5 py-8" style={{ wordBreak: 'keep-all' }}>
      <div className="text-center">
        <h1 className="text-2xl font-black">
          <BrandMark size={32} className="mr-2 -mt-1" />내 순위 보기
        </h1>
        <p className="mt-1 text-sm text-amber-300 font-bold">{CURRENT_EVENT.name}</p>
      </div>

      <form onSubmit={submit} className="bg-slate-800/80 rounded-2xl p-4 flex flex-col gap-3">
        <label className="font-bold" htmlFor="ticket">
          🎫 종이 오른쪽 위 번호
        </label>
        <div className="flex gap-2">
          <input
            id="ticket"
            inputMode="numeric"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 14"
            className="flex-1 min-w-0 rounded-xl bg-slate-950 border border-slate-600 px-4 py-3 text-xl font-bold"
          />
          <button disabled={busy} className="shrink-0 bg-emerald-400 text-slate-900 font-black px-5 rounded-xl text-lg disabled:opacity-50">
            {busy ? '…' : '보기'}
          </button>
        </div>
        {error && <p className="text-rose-300 text-sm font-bold">{error}</p>}
      </form>

      {result && (
        <section className="bg-slate-800/80 rounded-2xl p-5 flex flex-col items-center gap-2 text-center">
          <p className="text-slate-300">
            {displayTicket(result.ticket)}번 · 👦 {result.kid}
          </p>
          {result.rank ? (
            <>
              {result.insect && <p className="text-lg font-bold">🐞 {result.insect}</p>}
              <p className="text-5xl font-black text-amber-300 my-1">
                {result.rank <= 3 ? MEDALS[result.rank - 1] + ' ' : ''}
                {result.rank}위
              </p>
              <p className="text-sm text-slate-400">
                전체 {result.total}명 중 · 최고 점수 {result.score}
              </p>
              {result.rank <= PRIZE_LAST ? (
                <p className="mt-2 bg-amber-400/20 border border-amber-400/50 rounded-xl px-3 py-2 font-bold text-amber-200">
                  🎁 지금 시상권(1~{PRIZE_LAST}위) 안이야! 끝까지 지켜보자!
                </p>
              ) : (
                result.gapPrize !== null && (
                  <p className="mt-2 bg-sky-400/15 border border-sky-400/40 rounded-xl px-3 py-2 font-bold text-sky-200">
                    🎯 {PRIZE_LAST}위(시상권)까지 {result.gapPrize}점!
                  </p>
                )
              )}
              {result.gapUp !== null && result.rank > 1 && (
                <p className="text-sm text-slate-300">⬆️ {result.rank - 1}위까지 {result.gapUp}점 남았어</p>
              )}
            </>
          ) : (
            <p className="text-lg font-bold my-2">아직 랭킹 기록이 없어! ⚔️ 랭킹 도전을 해봐!</p>
          )}
        </section>
      )}

      {result && result.top.length > 0 && (
        <section className="bg-slate-800/80 rounded-2xl p-4">
          <p className="font-black">🏆 지금 1~{PRIZE_LAST}위</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {result.top.map((r, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${r.me ? 'bg-amber-400/20 border border-amber-400/50' : ''}`}
              >
                <span className="w-9 shrink-0 font-black text-center">{r.rank <= 3 ? MEDALS[r.rank - 1] : `${r.rank}위`}</span>
                <span className="flex-1 min-w-0" style={{ overflowWrap: 'anywhere' }}>
                  <b>{r.insect}</b>
                  {r.kid && <span className="text-xs text-slate-400"> · 👦 {r.kid}</span>}
                </span>
                <span className="shrink-0 font-bold text-amber-300">{r.score}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <p className="text-xs text-slate-400 text-center">순위는 계속 바뀌어! 다시 보려면 [보기]를 눌러줘!</p>
      )}

      <Link href="/ranking" className="text-center text-sm text-slate-400 underline">
        전체 랭킹 보러 가기
      </Link>
    </main>
  );
}
