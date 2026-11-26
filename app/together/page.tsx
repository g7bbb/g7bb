'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AdminGate from '@/app/admin/admin-gate';
import StatRadar from '@/app/upload/stat-radar';
import { loadTodayInsects, loadTodayWaiting, TodayInsect, loadInsect } from '@/lib/tournament';
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
// - 11/26 Jin: 만드는 동안 **대기 화면**으로 켜둔다 — 5초마다 새 곤충이 쑥 나타나고, 아직 못 만든 친구 자리는 그림자(👥 인원 ±).
// - ▶️ 발표 시작: 한 마리씩 크게 저절로 넘어감 → 아이가 설명할 때 직원이 ⏸ (또는 스페이스바) → 다시 누르면 다음 곤충부터 재생.

export default function TogetherPage() {
  return (
    <AdminGate title="오늘 곤충 다같이 보기">
      <Together />
    </AdminGate>
  );
}

const SLIDE_MS = 8000;
const EXPECTED_KEY = 'g7bb-together-expected';

function Together() {
  const [list, setList] = useState<TodayInsect[]>([]);
  const [waiting, setWaiting] = useState<{ pid: string; kid: string }[]>([]);
  const [imgs, setImgs] = useState<Map<string, string>>(new Map());
  const imgsRef = useRef<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<number | null>(null);
  const [detail, setDetail] = useState<Insect | null>(null);
  // 🧪 리허설: 테스트 번호(900~) 곤충도 (오늘 안 만들었어도 마지막 곤충)
  const [rehearsal, setRehearsal] = useState(false);
  const rehearsalRef = useRef(false);
  // 👥 오늘 올 인원 (그림자 칸 수) — 이 기기에 기억
  const [expected, setExpected] = useState(15);
  // ▶️ 발표 자동 넘기기 / ⏸ 멈춤
  const [auto, setAuto] = useState(false);
  const [paused, setPaused] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const test = rehearsalRef.current;
    const rows = await loadTodayInsects(test).catch(() => [] as TodayInsect[]);
    // 바뀐 게 없으면 그대로 (5초마다 다시 그리면 깜빡인다)
    setList((prev) => (prev.map((r) => r.iid).join() === rows.map((r) => r.iid).join() ? prev : rows));
    const have = new Set(rows.map((r) => r.pid));
    const w = await loadTodayWaiting(test, have);
    setWaiting((prev) => (prev.map((r) => r.pid).join() === w.map((r) => r.pid).join() ? prev : w));
    setLoading(false);
    const need = rows.filter((r) => !imgsRef.current.has(r.iid));
    for (let i = 0; i < need.length; i += 8) {
      const got = await loadInsectImages(need.slice(i, i + 8).map((r) => r.iid));
      const next = new Map(imgsRef.current);
      got.forEach((v, k) => next.set(k, v));
      imgsRef.current = next;
      setImgs(next);
    }
  }, []);

  useEffect(() => {
    // 주소에 ?test=1 이면 리허설 켜고 시작
    if (new URLSearchParams(window.location.search).get('test') === '1') {
      rehearsalRef.current = true;
      setRehearsal(true);
    }
    try {
      const n = Number(window.localStorage.getItem(EXPECTED_KEY));
      if (n > 0 && n < 100) setExpected(n);
    } catch {
      // 기억 못 해도 괜찮다
    }
    void load();
    // 만드는 동안 새 곤충이 저절로 나타나게 5초마다
    const id = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  function changeExpected(d: number) {
    setExpected((n) => {
      const v = Math.min(40, Math.max(1, n + d));
      try {
        window.localStorage.setItem(EXPECTED_KEY, String(v));
      } catch {
        // 괜찮다
      }
      return v;
    });
  }

  // 크게 볼 곤충의 자세한 정보 (능력치·프롬프트)
  const pickId = pick !== null ? list[pick]?.iid : undefined;
  useEffect(() => {
    setDetail(null);
    if (!pickId) return;
    let alive = true;
    void loadInsect(pickId).then((d) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [pickId]);

  // ▶️ 자동 넘기기 — 마지막 곤충에서 멈춘다 (거기서 🏆 토너먼트 표 보기)
  useEffect(() => {
    if (!auto || paused || pick === null) return;
    if (pick >= list.length - 1) {
      setAuto(false);
      return;
    }
    const id = window.setTimeout(() => setPick((p) => (p === null ? 0 : Math.min(list.length - 1, p + 1))), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [auto, paused, pick, list.length]);

  function startShow() {
    if (!list.length) return;
    setPick(0);
    setPaused(false);
    setAuto(true);
  }
  /** ⏸ / ▶️ — 다시 누르면 다음 곤충부터 재생 */
  function togglePause() {
    if (pick === null) return;
    if (!auto) {
      // 손으로 보던 중이면 여기서부터 자동 재생
      setAuto(true);
      setPaused(false);
      setPick((p) => (p === null ? 0 : Math.min(list.length - 1, p + 1)));
      return;
    }
    if (paused) {
      setPaused(false);
      setPick((p) => (p === null ? 0 : Math.min(list.length - 1, p + 1)));
    } else setPaused(true);
  }
  const toggleRef = useRef(togglePause);
  toggleRef.current = togglePause;

  // ← → 키로 넘기기, Esc 로 닫기, 스페이스바 = ⏸/▶️
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!list.length) return;
      if (e.key === 'ArrowRight') setPick((p) => ((p ?? -1) + 1) % list.length);
      if (e.key === 'ArrowLeft') setPick((p) => ((p ?? 0) - 1 + list.length) % list.length);
      if (e.key === 'Escape') {
        setPick(null);
        setAuto(false);
      }
      if (e.key === ' ') {
        e.preventDefault();
        toggleRef.current();
      }
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
        <span className="rounded-full bg-amber-400 px-[1.6vmin] py-[0.3vmin] text-[2.8vmin] font-black text-slate-900">
          {list.length} / {Math.max(expected, list.length)}마리
        </span>
        <span className="flex items-center gap-1 rounded-full border border-white/30 px-2 py-0.5 text-[2vmin] font-bold" title="오늘 올 인원 (그림자 칸 수)">
          <button onClick={() => changeExpected(-1)} className="px-1.5">−</button>👥 {expected}명<button onClick={() => changeExpected(1)} className="px-1.5">＋</button>
        </span>
        <button
          onClick={startShow}
          disabled={!list.length}
          className="rounded-full bg-emerald-500 px-4 py-1.5 text-[2.2vmin] font-black text-slate-900 disabled:opacity-40"
        >
          ▶️ 발표 시작
        </button>
        <button
          onClick={() => {
            rehearsalRef.current = !rehearsal;
            setRehearsal(!rehearsal);
            void load();
          }}
          className={`rounded-full border px-3 py-1 text-[2vmin] font-bold ${rehearsal ? 'bg-sky-500 text-slate-900 border-sky-300' : 'border-white/30 text-slate-300'}`}
        >
          🧪 리허설 {rehearsal ? '켜짐' : '꺼짐'}
        </button>
        <a
          href={`/tournament?make=1${rehearsal ? '&test=1' : ''}`}
          className="btn-sparkle rounded-full bg-amber-400 px-4 py-1.5 text-[2.4vmin] font-black text-slate-900"
        >
          🏆 토너먼트 표 보기
        </a>
      </header>
      <p className="mt-[1vmin] text-center text-[2.4vmin] font-bold text-slate-300">
        {list.length < Math.max(expected, list.length) ? '🐞 곤충을 다 만들면 여기에 쑥 나타나! ' : ''}카드를 누르면 크게 봐! (← → 키 · 스페이스바 ⏸)
      </p>

      {loading ? (
        <p className="mt-[10vmin] text-center text-[3vmin] text-slate-400">불러오는 중…</p>
      ) : (
        <div className="mt-[2.4vmin] grid gap-[1.6vmin]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(22vw, 200px), 1fr))' }}>
          {list.map((c, i) => {
            const tier = levelTier(c.level);
            return (
              <button
                key={c.iid}
                onClick={() => {
                  setAuto(false);
                  setPick(i);
                }}
                className={`animate-pop relative rounded-[1.4vmin] p-[0.5vmin] text-left ${frameShines(tier) ? 'holo-frame' : ''}`}
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
          {/* 아직 못 만든 친구 자리 — 그림자 (QR 로 들어온 친구는 이름, 나머지는 ?) */}
          {Array.from({ length: Math.max(0, Math.max(expected, list.length + waiting.length) - list.length) }, (_, k) => {
            const w = waiting[k];
            return (
              <div key={w ? w.pid : `s${k}`} className="relative rounded-[1.4vmin] p-[0.5vmin] bg-slate-800/60 border border-dashed border-slate-600">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[1vmin] bg-black flex flex-col items-center justify-center gap-[1vmin]">
                  <span className="text-[9vmin] font-black text-slate-700 animate-pulse">?</span>
                  <p className="px-2 text-center text-[2vmin] font-bold text-slate-400">{w ? `👦 ${w.kid}` : '🐛'} 만드는 중…</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cur && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-[2vmin]"
          onClick={() => {
            setPick(null);
            setAuto(false);
          }}
        >
          {auto && paused && (
            <p className="absolute bottom-[11vmin] left-[2vmin] rounded-full bg-rose-500 px-[3vmin] py-[1vmin] text-[2.8vmin] font-black animate-pulse z-20 whitespace-nowrap">
              🎤 발표 중! {cur.kid}
            </p>
          )}
          {auto && !paused && (
            <div className="absolute top-0 inset-x-0 h-[0.8vmin] bg-white/10 z-20">
              <div key={`${pick}`} className="h-full bg-emerald-400 together-progress" style={{ animationDuration: `${SLIDE_MS}ms` }} />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePause();
            }}
            className={`absolute bottom-[2vmin] left-[2vmin] z-20 rounded-full px-[3vmin] py-[1.4vmin] text-[3vmin] font-black ${
              auto && !paused ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-slate-900'
            }`}
          >
            {auto && !paused ? '⏸ 멈추기 (발표)' : '▶️ 다음 곤충 재생'}
          </button>
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
          {pick === list.length - 1 ? (
            <a
              href={`/tournament?make=1${rehearsal ? '&test=1' : ''}`}
              onClick={(e) => e.stopPropagation()}
              className="btn-sparkle absolute bottom-[2vmin] left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-[4vmin] py-[1.4vmin] text-[3vmin] font-black text-slate-900 whitespace-nowrap"
            >
              🏆 다 봤어! 토너먼트 표 보기 →
            </a>
          ) : auto ? null : (
            <p className="absolute bottom-[2vmin] inset-x-0 text-center text-[2vmin] text-slate-400">
              {(pick ?? 0) + 1} / {list.length} · 바깥을 누르면 닫혀
            </p>
          )}
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
        <p className="text-[2.4vmin] font-black text-amber-200">🎤 {entry.kid}! 왜 이렇게 만들었는지, 어떤 곳에서 오래 살아남을지 친구들한테 알려줄래?</p>
      </div>
    </>
  );
}
