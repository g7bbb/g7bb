'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminGate from '@/app/admin/admin-gate';
import StatRadar from '@/app/upload/stat-radar';
import { loadTodayInsects, TodayInsect, loadInsect } from '@/lib/tournament';
import { loadInsectImages } from '@/lib/image-cache';
import { calculateStats, defaultBodyParts, statsForInsect } from '@/lib/insect-stats';
import { defaultMutations } from '@/lib/mutations';
import { ENVIRONMENTS } from '@/lib/environments';
import { ORIGIN_EFFECTS } from '@/lib/origins';
import { movesFor } from '@/lib/special-moves';
import { levelTier, auraClass, frameShines } from '@/lib/card';
import { BrandMark } from '@/app/brand-logo';
import { Insect } from '@/lib/types';

// 📺 (체험용) 오늘 만든 곤충 다같이 보기 — 큰 화면 (2026-11-25 Jin)
// "모두 생성하면 큰 화면으로 다같이 곤충들의 특성을 보는 시간. 아이들이 왜 그렇게 했는지 설명"
//
// - 위: 오늘 곤충 전부 작은 카드 → 누르면(또는 ← → 키) 한 마리를 크게.
// - 크게 보기: 그림 · 이름 · 아이 · 종류 · 출신지(효과) · 필살기 · 능력치 도형 · **아이가 쓴 프롬프트 두 칸**.
//   프롬프트는 11/25 부터 저장 (insects.stats.prompt) — 그 전에 만든 곤충은 비어 있다.
// - ?test=1 이면 테스트 번호(900~) 곤충도 (리허설용).

export default function TogetherPage() {
  return (
    <AdminGate title="오늘 곤충 다같이 보기">
      <Together />
    </AdminGate>
  );
}

function Together() {
  const [list, setList] = useState<TodayInsect[]>([]);
  const [imgs, setImgs] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<number | null>(null);
  const [detail, setDetail] = useState<Insect | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const test = new URLSearchParams(window.location.search).get('test') === '1';
    const rows = await loadTodayInsects(test).catch(() => [] as TodayInsect[]);
    setList(rows);
    setLoading(false);
    for (let i = 0; i < rows.length; i += 8) {
      const got = await loadInsectImages(rows.slice(i, i + 8).map((r) => r.iid));
      setImgs((prev) => {
        const next = new Map(prev);
        got.forEach((v, k) => next.set(k, v));
        return next;
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 크게 볼 곤충의 자세한 정보 (능력치·프롬프트)
  useEffect(() => {
    setDetail(null);
    if (pick === null || !list[pick]) return;
    let alive = true;
    void loadInsect(list[pick].iid).then((d) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [pick, list]);

  // ← → 키로 넘기기, Esc 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!list.length) return;
      if (e.key === 'ArrowRight') setPick((p) => ((p ?? -1) + 1) % list.length);
      if (e.key === 'ArrowLeft') setPick((p) => ((p ?? 0) - 1 + list.length) % list.length);
      if (e.key === 'Escape') setPick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list.length]);

  const cur = pick !== null ? list[pick] : null;

  return (
    <main className="min-h-screen bg-slate-950 text-white px-[3vw] py-[2.4vmin]" style={{ wordBreak: 'keep-all' }}>
      <header className="flex flex-wrap items-center justify-center gap-[1.4vmin]">
        <BrandMark size={40} />
        <h1 className="text-[4.2vmin] font-black">
          🐞 오늘 우리가 만든 <span className="text-amber-300">AI 곤충</span>
        </h1>
        <span className="rounded-full bg-amber-400 px-[1.6vmin] py-[0.3vmin] text-[2.8vmin] font-black text-slate-900">{list.length}마리</span>
        <button onClick={() => void load()} className="rounded-full border border-white/30 px-3 py-1 text-[2vmin] font-bold">
          🔄 새로고침
        </button>
      </header>
      <p className="mt-[1vmin] text-center text-[2.4vmin] font-bold text-slate-300">카드를 누르면 크게 봐! (← → 키로 넘기기)</p>

      {loading ? (
        <p className="mt-[10vmin] text-center text-[3vmin] text-slate-400">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="mt-[10vmin] text-center text-[3vmin] text-slate-400">아직 오늘 만든 곤충이 없어.</p>
      ) : (
        <div className="mt-[2.4vmin] grid gap-[1.6vmin]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(22vw, 200px), 1fr))' }}>
          {list.map((c, i) => {
            const tier = levelTier(c.level);
            return (
              <button
                key={c.iid}
                onClick={() => setPick(i)}
                className={`relative rounded-[1.4vmin] p-[0.5vmin] text-left ${frameShines(tier) ? 'holo-frame' : ''}`}
                style={{ background: tier.frame }}
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-[1vmin] bg-slate-900">
                  {imgs.get(c.iid) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgs.get(c.iid)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-8">
                    <p className="truncate text-[2.4vmin] font-black leading-tight">{c.nick}</p>
                    <p className="truncate text-[1.8vmin] font-bold text-amber-200">👦 {c.kid}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {cur && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-[2vmin]" onClick={() => setPick(null)}>
          <div className="relative w-full max-w-[140vmin] px-[5vmin] grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] portrait:grid-cols-1 gap-[3vmin] items-center" onClick={(e) => e.stopPropagation()}>
            <Detail entry={cur} insect={detail} src={imgs.get(cur.iid)} />
            <button
              onClick={() => setPick((p) => ((p ?? 0) - 1 + list.length) % list.length)}
              className="fixed left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-2 py-4 text-[3.4vmin] z-10"
              aria-label="이전"
            >
              ◀
            </button>
            <button
              onClick={() => setPick((p) => ((p ?? -1) + 1) % list.length)}
              className="fixed right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/15 px-2 py-4 text-[3.4vmin] z-10"
              aria-label="다음"
            >
              ▶
            </button>
          </div>
          <p className="absolute bottom-[2vmin] inset-x-0 text-center text-[2vmin] text-slate-400">
            {(pick ?? 0) + 1} / {list.length} · 바깥을 누르면 닫혀
          </p>
        </div>
      )}
    </main>
  );
}

const STAT_ROWS: { key: 'hp' | 'atk' | 'def' | 'int' | 'eva'; label: string; max: number }[] = [
  { key: 'hp', label: '❤️ HP', max: 300 },
  { key: 'atk', label: '⚔️ 공격력', max: 100 },
  { key: 'def', label: '🛡️ 수비력', max: 100 },
  { key: 'int', label: '🧠 지능', max: 100 },
  { key: 'eva', label: '💨 회피력', max: 60 },
];

function Detail({ entry, insect, src }: { entry: TodayInsect; insect: Insect | null; src?: string }) {
  const tier = levelTier(entry.level);
  const env = ENVIRONMENTS.find((e) => e.key === (insect?.origin ?? entry.origin));
  const eff = env ? (ORIGIN_EFFECTS as any)[env.key] : null;
  const stats = insect ? statsForInsect(insect) : null;
  const base = insect ? calculateStats(defaultBodyParts(), 'yearling', defaultMutations(insect.species), insect.species, 'meteor') : null;
  const moves = movesFor(entry.species, entry.level);
  const prompt = ((insect?.stats as any)?.prompt ?? {}) as { look?: string; scene?: string };
  return (
    <>
      <div className={`rounded-[2.4vmin] p-[0.9vmin] ${frameShines(tier) ? 'holo-frame' : ''} ${auraClass(tier)}`} style={{ background: tier.frame }}>
        <div className="relative aspect-[4/5] overflow-hidden rounded-[1.8vmin] bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src && <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <span className="absolute left-[3%] top-[2.5%] rounded-md bg-black/60 px-2 py-0.5 text-[2.6vmin] font-black text-amber-200">LV.{entry.level}</span>
        </div>
      </div>
      <div className="flex flex-col gap-[1.6vmin]">
        <div>
          <p className="text-[5.6vmin] font-black leading-tight">🐞 {entry.nick}</p>
          <p className="text-[2.8vmin] font-bold text-amber-200">
            👦 {entry.kid} · {entry.species}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-[1.2vmin] text-[2.4vmin]">
          <div className="rounded-xl bg-slate-800/80 p-[1.4vmin]">
            <p className="font-black text-sky-300">출신지</p>
            <p className="font-black text-[3vmin]">
              {env?.emoji} {env?.label ?? '-'}
            </p>
            {eff?.story && <p className="text-slate-300 text-[2vmin]">{eff.story}</p>}
          </div>
          <div className="rounded-xl bg-slate-800/80 p-[1.4vmin]">
            <p className="font-black text-rose-300">필살기</p>
            {moves.map((m) => (
              <p key={m.key} className="font-black text-[2.6vmin]">
                {m.emoji} {m.name}
              </p>
            ))}
          </div>
        </div>
        {stats && base && (
          <div className="flex items-center gap-[2vmin]">
            <div className="w-[26vmin] shrink-0">
              <StatRadar stats={stats as any} base={base as any} />
            </div>
            <div className="flex-1 flex flex-col gap-[0.8vmin]">
              {STAT_ROWS.map((r) => (
                <div key={r.key} className="flex items-center gap-2 text-[2.2vmin] font-bold">
                  <span className="w-[14vmin] shrink-0">{r.label}</span>
                  <span className="flex-1 h-[1.6vmin] rounded-full bg-slate-700 overflow-hidden">
                    <span className="block h-full bg-gradient-to-r from-emerald-400 to-amber-300" style={{ width: `${Math.min(100, ((stats as any)[r.key] / r.max) * 100)}%` }} />
                  </span>
                  <span className="w-[7vmin] text-right">{Math.round((stats as any)[r.key])}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="rounded-xl border-2 border-amber-300/60 bg-amber-400/10 p-[1.6vmin]">
          <p className="text-[2.6vmin] font-black text-white">🤖 내가 쓴 AI 프롬프트</p>
          <p className="mt-[0.8vmin] text-[2.2vmin] font-black text-amber-300">① ✏️ 누구? (생김새·효과)</p>
          <p className="text-[2.8vmin] font-bold">{prompt.look || <span className="text-slate-500">(안 썼어)</span>}</p>
          <p className="mt-[0.8vmin] text-[2.2vmin] font-black text-sky-300">② 📍 어디서 무엇을? (장면·배경)</p>
          <p className="text-[2.8vmin] font-bold">{prompt.scene || <span className="text-slate-500">(안 썼어)</span>}</p>
        </div>
        <p className="text-[2.4vmin] font-black text-amber-200">🎤 {entry.kid}! 왜 이렇게 만들었는지 친구들한테 알려줄래?</p>
      </div>
    </>
  );
}
