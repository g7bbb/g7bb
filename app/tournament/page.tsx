'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AdminGate from '@/app/admin/admin-gate';
import DuelStage, { DuelOutcome } from './duel-stage';
import {
  CHANCE_LEN,
  T_CHANCE,
  T_RESOLVE,
  WAIT_TIER_MS,
  RESULT_LEN,
  Tournament,
  Match,
  champion,
  computeDuel,
  findMatch,
  loadInsect,
  loadTodayInsects,
  loadTournament,
  makeTournament,
  newSeed,
  readSignals,
  recordGame,
  roundName,
  roundSizes,
  saveTournament,
  serverNow,
  signalFor,
  syncClock,
  winsOf,
} from '@/lib/tournament';
import { insectImageSrc } from '@/lib/bots';
import { Insect } from '@/lib/types';
import { BrandMark } from '@/app/brand-logo';

// ⚔️ (체험용) 수액 쟁탈 토너먼트 — 직원 노트북 + 큰 화면 (2026-11-25 Jin)
// 이 화면이 진행의 주인이다: 대진표를 만들고, 두 선수가 들어오면 시작 시각을 정하고, 승패를 계산해 적는다.
// 아이들은 각자 태블릿·폰의 /duel 에서 들어온다 (종이 QR 로 들어가면 토너먼트 중엔 자동으로 그리로 감).

const POLL_MS = 1000;

export default function TournamentPage() {
  return (
    <AdminGate title="배틀 토너먼트">
      <Admin />
    </AdminGate>
  );
}

function Admin() {
  const [t, setT] = useState<Tournament | null>(null);
  const tRef = useRef<Tournament | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [joined, setJoined] = useState<{ a: boolean; b: boolean }>({ a: false, b: false });
  const [ins, setIns] = useState<{ a: Insect | null; b: Insect | null }>({ a: null, b: null });
  /** 방금 끝난 판을 큰 화면에 보여주는 동안 (다음 경기로 바로 넘어가지 않게) */
  const [show, setShow] = useState<{ mid: string; startAt: number; outcome: DuelOutcome; a: Insect; b: Insect; until: number } | null>(null);
  const resolving = useRef<string>('');
  // 🧪 리허설: 테스트 번호(900~) 곤충도 참가 — 오늘 안 만들었어도 마지막 곤충 (주소 ?test=1 이면 처음부터 켜짐)
  const [rehearsal, setRehearsal] = useState(false);
  useEffect(() => {
    setRehearsal(new URLSearchParams(window.location.search).get('test') === '1');
  }, []);

  const save = useCallback(async (next: Tournament | null) => {
    tRef.current = next;
    setT(next);
    await saveTournament(next);
  }, []);

  useEffect(() => {
    void syncClock();
    void loadTournament().then((x) => {
      tRef.current = x;
      setT(x);
      setLoaded(true);
    });
  }, []);

  const cur = t ? findMatch(t, t.current) : null;

  // 지금 경기의 두 곤충 불러오기
  useEffect(() => {
    if (!t || !cur || cur.a === null || cur.b === null) {
      setIns({ a: null, b: null });
      return;
    }
    let alive = true;
    const ea = t.entrants[cur.a];
    const eb = t.entrants[cur.b];
    void Promise.all([loadInsect(ea.iid), loadInsect(eb.iid)]).then(([a, b]) => alive && setIns({ a, b }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, cur?.id]);

  // 판마다 씨앗 정하기 (아이 기기가 "이번 판" 을 알 수 있게)
  useEffect(() => {
    const tt = tRef.current;
    if (!tt || tt.status !== 'running') return;
    const m = findMatch(tt, tt.current);
    if (!m || m.seed !== undefined || show) return;
    const copy: Tournament = JSON.parse(JSON.stringify(tt));
    findMatch(copy, m.id)!.seed = newSeed();
    void save(copy);
  }, [t, show, save]);

  // 1초마다: 두 선수가 들어왔는지 → 시작 시각 / 타이밍 결과 모이면 → 승패 적기
  useEffect(() => {
    const id = window.setInterval(async () => {
      const tt = tRef.current;
      if (!tt || tt.status !== 'running') return;
      const m = findMatch(tt, tt.current);
      if (!m || m.a === null || m.b === null || m.seed === undefined) return;
      const pa = tt.entrants[m.a].pid;
      const pb = tt.entrants[m.b].pid;
      const sigs = await readSignals([pa, pb]).catch(() => new Map());
      const sa = signalFor(sigs.get(pa), tt, m);
      const sb = signalFor(sigs.get(pb), tt, m);
      setJoined({ a: !!sa, b: !!sb });
      if (!m.startAt && sa && sb) {
        const copy: Tournament = JSON.parse(JSON.stringify(tt));
        // 두 번째 선수가 들어온 뒤 "HERE COMES A NEW CHALLENGER!" (2.2초)를 보여줄 틈을 두고 시작
        findMatch(copy, m.id)!.startAt = serverNow() + 3000;
        await save(copy);
        return;
      }
      if (m.startAt) {
        const e = serverNow() - m.startAt;
        const key = `${m.id}:${m.games.length}`;
        if (e < T_CHANCE + CHANCE_LEN + 300 || resolving.current === key) return;
        const both = !!sa?.tier && !!sb?.tier;
        if (!both && e < T_RESOLVE + WAIT_TIER_MS) return;
        resolving.current = key;
        await finishGame(tt, m, sa?.tier ?? 'miss', sb?.tier ?? 'miss', false);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishGame(tt: Tournament, m: Match, tierA: string, tierB: string, auto: boolean) {
    const [a, b] = await Promise.all([loadInsect(tt.entrants[m.a!].iid), loadInsect(tt.entrants[m.b!].iid)]);
    if (!a || !b || m.seed === undefined) return;
    const res = computeDuel(a, b, m.seed, tierA, tierB);
    const winner = res.winner === 'A' ? 'a' : 'b';
    const startAt = m.startAt ?? serverNow() - T_RESOLVE;
    setShow({ mid: m.id, startAt, outcome: { winner, tierA, tierB }, a, b, until: Date.now() + Math.max(0, startAt + T_RESOLVE - serverNow()) + RESULT_LEN });
    await save(recordGame(tt, m.id, { seed: m.seed, winner, tierA, tierB, auto }));
  }

  // 결과를 다 보여주면 다음 경기로
  useEffect(() => {
    if (!show) return;
    const id = window.setTimeout(() => setShow(null), Math.max(0, show.until - Date.now()));
    return () => window.clearTimeout(id);
  }, [show]);

  async function start() {
    setBusy(true);
    setMsg('');
    try {
      const list = await loadTodayInsects(rehearsal);
      if (list.length < 2) {
        setMsg(
          rehearsal
            ? '곤충이 2마리 이상 있어야 해요.'
            : '오늘 만든 곤충이 2마리 이상 있어야 해요. (951·952 같은 테스트 번호로 연습할 땐 위 "🧪 리허설" 을 켜세요)'
        );
        return;
      }
      if (tRef.current?.status === 'running' && !window.confirm('진행 중인 토너먼트가 있어요. 새로 섞을까요?')) return;
      await save(makeTournament(list));
      setShow(null);
    } catch (e: any) {
      setMsg(e?.message || '시작하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function autoPlay() {
    const tt = tRef.current;
    const m = tt ? findMatch(tt, tt.current) : null;
    if (!tt || !m || m.seed === undefined) return;
    if (!window.confirm('컴퓨터가 대신 진행할까요? (못 온 선수는 "굿!" 으로 쳐요)')) return;
    resolving.current = `${m.id}:${m.games.length}`;
    const sigs = await readSignals([tt.entrants[m.a!].pid, tt.entrants[m.b!].pid]).catch(() => new Map());
    const sa = signalFor(sigs.get(tt.entrants[m.a!].pid), tt, m);
    const sb = signalFor(sigs.get(tt.entrants[m.b!].pid), tt, m);
    await finishGame(tt, m, sa?.tier ?? 'good', sb?.tier ?? 'good', true);
  }

  async function reset() {
    if (!window.confirm('토너먼트를 지울까요? (곤충·기록은 그대로)')) return;
    await save(null);
    setShow(null);
  }

  if (!loaded) return <p className="p-10 text-center text-slate-400">불러오는 중…</p>;

  const champ = t && t.status === 'done' && !show ? champion(t) : null;
  const stageMatch = show ? findMatch(t!, show.mid) : cur;
  const stageA = show ? show.a : ins.a;
  const stageB = show ? show.b : ins.b;

  return (
    <main className="min-h-screen bg-slate-950 text-white px-[2vw] py-[2vmin] flex flex-col gap-[2vmin]" style={{ wordBreak: 'keep-all' }}>
      <header className="flex flex-wrap items-center justify-center gap-[1.4vmin]">
        <BrandMark size={40} />
        <h1 className="text-[4.2vmin] font-black">
          ⚔️ 수액 쟁탈 <span className="text-amber-300">G7BB 배틀 토너먼트</span>
        </h1>
        <button onClick={start} disabled={busy} className="rounded-full bg-emerald-500 px-4 py-1.5 text-[2.2vmin] font-black text-slate-900 disabled:opacity-50">
          {t ? '🔀 새로 섞어 시작' : '⚔️ 배틀 토너먼트 시작!'}
        </button>
        <button
          onClick={() => setRehearsal((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-[1.8vmin] font-bold border ${rehearsal ? 'bg-sky-500 text-slate-900 border-sky-300' : 'bg-slate-800 text-slate-300 border-slate-600'}`}
          title="테스트 번호(900~) 곤충도 참가"
        >
          🧪 리허설 {rehearsal ? '켜짐' : '꺼짐'}
        </button>
        {t?.status === 'running' && cur && !show && (
          <button onClick={autoPlay} className="rounded-full bg-slate-700 px-4 py-1.5 text-[2vmin] font-bold">
            🤖 이 경기 자동 진행
          </button>
        )}
        {t && (
          <button onClick={reset} className="rounded-full bg-slate-800 px-3 py-1.5 text-[1.8vmin] text-slate-300">
            🗑️ 지우기
          </button>
        )}
      </header>
      {msg && <p className="text-center text-rose-300 font-bold">{msg}</p>}

      {!t && (
        <div className="flex-1 flex flex-col items-center justify-center gap-[2vmin] text-center">
          <p className="text-[6vmin] font-black">🌳 참나무 수액을 차지할 곤충은?!</p>
          <p className="text-[3vmin] text-slate-300">오늘 만든 곤충들을 무작위로 섞어서 대진표를 만들어요. 결승은 3판 2선승!</p>
        </div>
      )}

      {t && (
        <>
          {/* 지금 경기 */}
          {stageMatch && stageMatch.a !== null && stageMatch.b !== null && (
            <section className="rounded-[2vmin] bg-slate-900/80 border border-amber-400/30 py-[2vmin]">
              <DuelStage
                key={`${stageMatch.id}:${show ? show.startAt : stageMatch.games.length}`}
                a={stageA}
                b={stageB}
                srcA={stageA ? insectImageSrc(stageA) : undefined}
                srcB={stageB ? insectImageSrc(stageB) : undefined}
                joinedA={show ? true : joined.a}
                joinedB={show ? true : joined.b}
                startAt={show ? show.startAt : stageMatch.startAt}
                outcome={show ? show.outcome : null}
                label={`${roundName(t, stageMatch.round)}${stageMatch.bestOf === 3 ? ` · 3판 2선승 (${winsOf(stageMatch).a} : ${winsOf(stageMatch).b})` : ''} — 👦 ${t.entrants[stageMatch.a].kid} vs 👦 ${t.entrants[stageMatch.b].kid}`}
              />
            </section>
          )}

          {champ && (
            <section className="flex flex-col items-center gap-[1.4vmin] py-[3vmin]">
              <p className="attract-gold text-[9vmin] font-black">👑 우승! 🌳 수액은 내 거야!</p>
              <p className="text-[5vmin] font-black">
                🐞 {champ.nick} <span className="text-amber-200">(👦 {champ.kid})</span>
              </p>
            </section>
          )}

          <Bracket t={t} currentId={show ? show.mid : t.current} />
        </>
      )}
    </main>
  );
}

function Bracket({ t, currentId }: { t: Tournament; currentId: string | null }) {
  return (
    <section className="overflow-x-auto">
      <div className="flex gap-[1.6vmin] min-w-max justify-center">
        {t.rounds.map((round, r) => (
          <div key={r} className="flex flex-col justify-around gap-[1vmin] min-w-[16vmin]">
            <p className="text-center text-[2.2vmin] font-black text-amber-200">{roundName(t, r)}</p>
            {round.map((m) => {
              const w = winsOf(m);
              const row = (side: 'a' | 'b') => {
                const idx = side === 'a' ? m.a : m.b;
                const e = idx === null ? null : t.entrants[idx];
                const won = m.winner === side && !!e;
                const lost = !!e && m.winner && m.winner !== side;
                return (
                  <div
                    className={`flex items-center justify-between gap-1 px-[0.8vmin] py-[0.4vmin] text-[1.8vmin] font-bold ${won ? 'text-amber-300' : lost ? 'text-slate-500 line-through' : 'text-white'}`}
                  >
                    <span className={`truncate max-w-[14vmin] ${e ? '' : 'text-slate-500 font-normal'}`}>{e ? `${e.nick}` : '(부전승)'}</span>
                    {m.bestOf === 3 && <span>{side === 'a' ? w.a : w.b}</span>}
                  </div>
                );
              };
              const live = m.id === currentId;
              return (
                <div key={m.id} className={`rounded-lg border ${live ? 'border-amber-300 bg-amber-400/15 shadow-[0_0_14px_rgba(251,191,36,0.5)]' : 'border-slate-700 bg-slate-900'}`}>
                  {row('a')}
                  <div className="h-px bg-slate-700" />
                  {row('b')}
                </div>
              );
            })}
          </div>
        ))}
        {/* 아직 안 만든 라운드 자리 (앞 라운드가 끝나면 채워진다) */}
        {roundSizes(t)
          .slice(t.rounds.length)
          .map((n, k) => {
            const r = t.rounds.length + k;
            return (
              <div key={`f${r}`} className="flex flex-col justify-around gap-[1vmin] min-w-[16vmin] opacity-60">
                <p className="text-center text-[2.2vmin] font-black text-amber-200">{roundName(t, r)}</p>
                {Array.from({ length: n }, (_, i) => (
                  <div key={i} className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 px-[0.8vmin] py-[1.2vmin] text-center text-[1.8vmin] text-slate-500">
                    ?
                  </div>
                ))}
              </div>
            );
          })}
      </div>
    </section>
  );
}

