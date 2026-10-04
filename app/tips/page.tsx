'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentPlayer } from '@/lib/session';
import { isTestPlayer, loadTestPlayerIds, sameWorld } from '@/lib/test-world';
import { calculateStats, defaultBodyParts, statsForInsect } from '@/lib/insect-stats';
import { findSpecies } from '@/lib/species';
import { baseMoveFor } from '@/lib/special-moves';
import { ENVIRONMENTS } from '@/lib/environments';
import { weakTo } from '@/lib/origins';
import { ALLOC_STATS } from '@/lib/alloc';
import { EnvironmentKey, Insect, Player } from '@/lib/types';
import { BrandMark } from '@/app/brand-logo';
import { LEVELUP_HEADLINE } from '@/lib/levelup-tips';

// 💡 승리 팁 (2026-10-04 Jin: "현재 1~5위의 속성과 능력치를 요점으로 알려주고,
//    레벨업하고 이 스탯을 올리면 이길 수 있어! 를 알려주면 좋겠어. 승리 팁 버튼을 만들어서 연결되게")
// 전체 랭킹 1~5위 곤충을 **실제 데이터로** 보여주고, 내 곤충과 비교해 "레벨업 + 이 스탯" 을 알려준다.
// 그림은 안 받는다(가볍게). 테스트 번호(900번대)는 테스트끼리만 (lib/test-world.ts).

type StatKey = 'hp' | 'atk' | 'def' | 'int' | 'eva';
type Row = Pick<Insect, 'id' | 'nickname' | 'species' | 'origin' | 'age_stage' | 'body_parts' | 'mutations' | 'stats' | 'level'>;

const TOP = 5;
const MEDALS = ['🥇', '🥈', '🥉', '4위', '5위'];
const KEYS: StatKey[] = ['hp', 'atk', 'def', 'int', 'eva'];
const LABEL = Object.fromEntries(ALLOC_STATS.map((s) => [s.key, s])) as Record<StatKey, (typeof ALLOC_STATS)[number]>;
const SELECT = 'id, nickname, species, origin, age_stage, body_parts, mutations, stats, level';

// 받침: 'HP를' · '수비력을'
const OBJ: Record<StatKey, string> = { hp: '를', atk: '을', def: '을', int: '을', eva: '을' };
// 회피력은 0~2.4배로 크게 흔들려서 덜 키워 비교한다 (밸런스 도형과 같은 규칙, app/upload/stat-radar.tsx)
const GAIN: Record<StatKey, number> = { hp: 2.4, atk: 2.4, def: 2.4, int: 2.4, eva: 0.5 };
const lv = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "보통 곤충"(전부 3점 · 1년충 · 운석충돌, 같은 종류)보다 제일 센 능력치 */
function strongestOf(row: Row, s: Record<StatKey, number>): StatKey {
  const key = findSpecies(row.species)?.key ?? 'other';
  const base = calculateStats(defaultBodyParts(), 'yearling', undefined, key as any, 'meteor') as Record<StatKey, number>;
  const score = (k: StatKey) => Math.log(Math.max(0.05, (s[k] ?? 0) / Math.max(1, base[k] ?? 1))) * GAIN[k];
  return KEYS.slice().sort((a, b) => score(b) - score(a))[0];
}

function envOf(origin: string | null | undefined) {
  return ENVIRONMENTS.find((e) => e.key === origin || e.label === origin) ?? null;
}

export default function TipsPage() {
  const router = useRouter();
  const [top, setTop] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<Row | null>(null);

  useEffect(() => {
    (async () => {
      let me: Player | null = null;
      try {
        me = await getCurrentPlayer();
      } catch {
        // 로그인 안 했어도 1~5위는 보여준다
      }
      const [{ data }, testIds] = await Promise.all([
        supabase.from('battles').select('player_id, insect_id, score').order('score', { ascending: false }).limit(300),
        loadTestPlayerIds(),
      ]);
      const viewerIsTest = isTestPlayer(me);
      const best = new Map<string, { insect_id: string; score: number }>();
      (data || []).forEach((r: any) => {
        if (!sameWorld(r.player_id, testIds, viewerIsTest)) return;
        const cur = best.get(r.player_id);
        if (!cur || r.score > cur.score) best.set(r.player_id, { insect_id: r.insect_id, score: r.score });
      });
      const ids = Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, TOP).map((r) => r.insect_id);
      if (ids.length) {
        const { data: rows } = await supabase.from('insects').select(SELECT).in('id', ids);
        const byId = new Map((rows || []).map((r: any) => [r.id, r as Row]));
        setTop(ids.map((id) => byId.get(id)).filter(Boolean) as Row[]);
      } else setTop([]);
      if (me) {
        const { data: my } = await supabase
          .from('insects')
          .select(SELECT)
          .eq('player_id', me.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (my?.[0]) setMine(my[0] as Row);
      }
    })().catch(() => setTop([]));
  }, []);

  const topStats = (top ?? []).map((r) => ({ row: r, s: statsForInsect(r as any) }));
  const avg = (k: StatKey) => (topStats.length ? topStats.reduce((sum, x) => sum + (x.s[k] ?? 0), 0) / topStats.length : 0);
  const avgLevel = topStats.length ? topStats.reduce((sum, x) => sum + (x.row.level ?? 1), 0) / topStats.length : 0;
  const attackCount = topStats.filter((x) => baseMoveFor(x.row.species).kind === 'attack').length;
  const origins = new Map<string, number>();
  topStats.forEach((x) => x.row.origin && origins.set(x.row.origin, (origins.get(x.row.origin) ?? 0) + 1));
  const [topOrigin] = Array.from(origins.entries()).sort((a, b) => b[1] - a[1])[0] ?? [null];
  const counterOrigin = topOrigin ? weakTo(topOrigin as EnvironmentKey) : null;

  // 내 곤충이 1~5위 평균보다 제일 많이 모자란 능력치 (비율로 비교)
  const myStats = mine ? statsForInsect(mine as any) : null;
  const gaps = myStats
    ? KEYS.filter((k) => k !== 'eva') // 회피력은 확률이라 "올리면 이긴다" 로 권하지 않는다
        .map((k) => ({ k, ratio: avg(k) > 0 ? (myStats[k] ?? 0) / avg(k) : 1 }))
        .sort((a, b) => a.ratio - b.ratio)
    : [];
  const weakest = gaps[0]?.ratio < 0.98 ? gaps[0].k : null;
  // 내 곤충이 없으면: 1~5위가 공격형이 많으면 수비력, 수비형이 많으면 공격력
  const suggest: StatKey = weakest ?? (attackCount >= topStats.length / 2 ? 'def' : 'atk');
  const needLevel = Math.max(1, Math.ceil(avgLevel));

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-4 px-5 py-8" style={{ wordBreak: 'keep-all' }}>
      <h1 className="text-2xl font-black text-center">
        <BrandMark size={30} className="mr-2 -mt-1" />💡 승리 팁
      </h1>
      <p className="text-center text-sm text-slate-300">지금 랭킹 1~5위 곤충을 보고, 이기는 방법을 알려줄게!</p>

      {top === null ? (
        <p className="text-center text-slate-400 py-10">랭킹을 살펴보는 중...</p>
      ) : top.length === 0 ? (
        <p className="text-center text-slate-400 py-10">아직 랭킹에 곤충이 없어. 첫 번째로 올라가 보자!</p>
      ) : (
        <>
          {/* 🎯 핵심 팁 — 맨 위에 크게 */}
          <section className="rounded-3xl border-2 border-amber-300 bg-amber-400/15 p-4 flex flex-col gap-2">
            <p className="text-xl font-black text-amber-200 text-center">
              🆙 레벨업하고 {LABEL[suggest].emoji} {LABEL[suggest].label}{OBJ[suggest]} 올리면 이길 수 있어!
            </p>
            <ul className="text-base flex flex-col gap-1.5 mt-1">
              <li>
                🆙 1~5위 평균 레벨은 <b className="text-amber-300">LV.{lv(avgLevel)}</b> →{' '}
                <b>LV.{needLevel} 이상</b>을 만들어 보자!
                {mine && <span className="text-slate-300"> (내 곤충 LV.{mine.level ?? 1})</span>}
              </li>
              <li>
                {LABEL[suggest].emoji} <b>{LABEL[suggest].label}</b>: {LABEL[suggest].desc}
                {myStats && weakest && (
                  <span className="text-slate-300">
                    {' '}
                    (내 곤충 {Math.round(myStats[suggest] ?? 0)} · 1~5위 평균 {Math.round(avg(suggest))})
                  </span>
                )}
              </li>
              <li>
                ⚔️ 1~5위 중 <b>공격형 {attackCount}마리 · 수비형 {topStats.length - attackCount}마리</b>
                {attackCount >= topStats.length / 2 ? ' → 수비력·HP 로 버티자!' : ' → 공격력·지능으로 뚫자!'}
              </li>
              <li>
                🎯 이길 상대랑 <b>연습 게임</b>을 먼저 해봐! 공격 패턴을 읽게 돼서 그 상대를 만나면{' '}
                <b className="text-pink-300">승리 확률 +10%</b>
              </li>
              {topOrigin && counterOrigin && (
                <li>
                  🗺️ 제일 많은 출신지는 {envOf(topOrigin)?.emoji} <b>{envOf(topOrigin)?.label}</b> → {envOf(counterOrigin)?.emoji}{' '}
                  <b>{envOf(counterOrigin)?.label}</b> 출신이 상성으로 강해!
                </li>
              )}
            </ul>
            <p className="text-sm text-amber-100/90 text-center mt-1">
              💡 다시 와서 <b>레벨업 접속</b>하면 포인트로 능력치를 직접 올릴 수 있어!
            </p>
          </section>

          {/* 🏆 1~5위 요점 */}
          <section className="flex flex-col gap-2">
            {topStats.map(({ row, s }, i) => {
              const move = baseMoveFor(row.species);
              const env = envOf(row.origin);
              const bestKey = strongestOf(row, s as any);
              return (
                <div key={row.id} className="bg-slate-800 rounded-2xl px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-black text-lg truncate">
                      {MEDALS[i]} {row.nickname}
                    </span>
                    <span className="shrink-0 text-emerald-300 font-black">LV.{row.level ?? 1}</span>
                  </div>
                  <p className="text-sm text-slate-300 mt-0.5">
                    {row.species ?? '곤충'} · {move.kind === 'attack' ? '⚔️ 공격형' : '🛡️ 수비형'} ({move.name}) ·{' '}
                    {env ? `${env.emoji} ${env.label}` : '출신지 ?'}
                  </p>
                  <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                    {KEYS.map((k) => (
                      <div key={k} className={`rounded-lg py-1 ${k === bestKey ? 'bg-amber-400/25 ring-1 ring-amber-300' : 'bg-slate-900'}`}>
                        <p className="text-[0.7rem] text-slate-400">
                          {LABEL[k].emoji}
                          {LABEL[k].label}
                        </p>
                        <p className="font-black text-sm">{Math.round(s[k] ?? 0)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-amber-200">
                    ⭐ 제일 센 것: {LABEL[bestKey].emoji} {LABEL[bestKey].label}
                  </p>
                </div>
              );
            })}
          </section>

          <p className="text-center text-sm font-bold text-amber-200">🆙 {LEVELUP_HEADLINE}</p>
        </>
      )}

      <div className="grid grid-cols-3 gap-2 mt-2">
        <button onClick={() => router.push('/card')} className="bg-slate-700 font-bold py-3 rounded-xl">
          🃏 내 카드
        </button>
        <button onClick={() => router.push('/ranking')} className="bg-amber-400 text-slate-900 font-bold py-3 rounded-xl">
          🏆 랭킹
        </button>
        <button onClick={() => router.push('/battle')} className="bg-emerald-500 text-slate-900 font-bold py-3 rounded-xl">
          ⚔️ 배틀
        </button>
      </div>
    </main>
  );
}
