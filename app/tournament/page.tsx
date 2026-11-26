'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AdminGate from '@/app/admin/admin-gate';
import DuelStage, { DuelOutcome } from './duel-stage';
import {
  CHANCE_COUNT,
  T_LAST_CHANCE_END,
  T_RESOLVE,
  WAIT_TIER_MS,
  RESULT_LEN,
  Tournament,
  Match,
  champion,
  duelVerdict,
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
  matchLabel,
  showRevived,
  saveTournament,
  serverNow,
  signalFor,
  syncClock,
  winsOf,
} from '@/lib/tournament';
import { insectImageSrc } from '@/lib/bots';
import { loadInsectImages } from '@/lib/image-cache';
import { Insect } from '@/lib/types';
import { BrandMark } from '@/app/brand-logo';

// ⚔️ (체험용) 수액 쟁탈 토너먼트 — 직원 노트북 + 큰 화면 (2026-11-25 Jin)
// 이 화면이 진행의 주인이다: 대진표를 만들고, 두 선수가 들어오면 시작 시각을 정하고, 승패를 계산해 적는다.
// 아이들은 **배틀 태블릿 2대**(/arena 로 켠 기기)의 /duel 에서 자기 종이 QR 을 찍고 들어온다. 아이 폰은 응원 화면만.

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
  /** 두 선수가 지금까지 누른 판정 (큰 화면 기술칸에 보여주기) */
  const [live, setLive] = useState<{ a: (string | null)[]; b: (string | null)[] }>({ a: [null, null, null], b: [null, null, null] });
  const [ins, setIns] = useState<{ a: Insect | null; b: Insect | null }>({ a: null, b: null });
  /** 방금 끝난 판을 큰 화면에 보여주는 동안 (다음 경기로 바로 넘어가지 않게) */
  const [show, setShow] = useState<{ mid: string; startAt: number; outcome: DuelOutcome; a: Insect; b: Insect; until: number } | null>(null);
  const resolving = useRef<string>('');
  // 🧪 리허설: 테스트 번호(900~) 곤충도 참가 — 오늘 안 만들었어도 마지막 곤충 (주소 ?test=1 이면 처음부터 켜짐)
  const [rehearsal, setRehearsal] = useState(false);
  /** 📋 대진표 크게 보기 (11/25 Jin: 곤충을 다같이 본 뒤 "토너먼트 표 보기" → 누가 누구랑 하는지 → 왼쪽부터 1경기) */
  const [view, setView] = useState<'reveal' | 'stage'>('stage');
  const makeOnce = useRef(false);

  const save = useCallback(async (next: Tournament | null) => {
    tRef.current = next;
    setT(next);
    await saveTournament(next);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const test = q.get('test') === '1';
    setRehearsal(test);
    void syncClock();
    void loadTournament().then((x) => {
      tRef.current = x;
      setT(x);
      setLoaded(true);
      // "다같이 보기" 에서 🏆 토너먼트 표 보기 로 왔으면 바로 섞어서 대진표 (새로고침해도 다시 안 섞이게 주소에서 뺀다)
      if (q.get('make') === '1' && !makeOnce.current) {
        makeOnce.current = true;
        window.history.replaceState(null, '', test ? '/tournament?test=1' : '/tournament');
        void start(test);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const la = sa?.tiers ?? [null, null, null];
      const lb = sb?.tiers ?? [null, null, null];
      setLive((prev) => (prev.a.join(',') === la.join(',') && prev.b.join(',') === lb.join(',') ? prev : { a: la, b: lb }));
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
        if (e < T_LAST_CHANCE_END + 300 || resolving.current === key) return;
        const full = (x?: (string | null)[]) => !!x && x.length >= CHANCE_COUNT && x.slice(0, CHANCE_COUNT).every(Boolean);
        const both = full(sa?.tiers) && full(sb?.tiers);
        if (!both && e < T_RESOLVE + WAIT_TIER_MS) return;
        resolving.current = key;
        await finishGame(tt, m, fillTiers(sa?.tiers, 'miss'), fillTiers(sb?.tiers, 'miss'), false);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishGame(tt: Tournament, m: Match, tiersA: string[], tiersB: string[], auto: boolean) {
    const [a, b] = await Promise.all([loadInsect(tt.entrants[m.a!].iid), loadInsect(tt.entrants[m.b!].iid)]);
    if (!a || !b || m.seed === undefined) return;
    const v = duelVerdict(a, b, m.seed, tiersA, tiersB);
    const startAt = m.startAt ?? serverNow() - T_RESOLVE;
    const outcome: DuelOutcome = { winner: v.winner, tiersA, tiersB, left: v.left, reason: v.reason };
    setShow({ mid: m.id, startAt, outcome, a, b, until: Date.now() + Math.max(0, startAt + T_RESOLVE - serverNow()) + RESULT_LEN });
    await save(recordGame(tt, m.id, { seed: m.seed, winner: v.winner, tiersA, tiersB, left: v.left, reason: v.reason, auto }));
  }

  // 다음 라운드가 새로 짜이면 (결과를 다 보여준 뒤) 대진표를 크게 다시 보여준다
  // (패자부활전 경기가 새로 생겨도 — 1라운드가 끝나면 "🔥 패자부활전!" 을 크게)
  const roundCount = t ? t.rounds.flat().length : 0;
  const seenRounds = useRef(0);
  const seenId = useRef('');
  useEffect(() => {
    if (show || !t) return;
    if (seenId.current !== t.id) {
      seenId.current = t.id;
      seenRounds.current = roundCount;
      return;
    }
    if (seenRounds.current && roundCount > seenRounds.current && t.status === 'running') setView('reveal');
    seenRounds.current = roundCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundCount, show, t?.id]);

  // 결과를 다 보여주면 다음 경기로
  useEffect(() => {
    if (!show) return;
    const id = window.setTimeout(() => setShow(null), Math.max(0, show.until - Date.now()));
    return () => window.clearTimeout(id);
  }, [show]);

  async function start(includeTest: boolean = rehearsal) {
    setBusy(true);
    setMsg('');
    try {
      const list = await loadTodayInsects(includeTest);
      if (list.length < 2) {
        setMsg(
          includeTest
            ? '곤충이 2마리 이상 있어야 해요.'
            : '오늘 만든 곤충이 2마리 이상 있어야 해요. (951·952 같은 테스트 번호로 연습할 땐 위 "🧪 리허설" 을 켜세요)'
        );
        return;
      }
      if (tRef.current?.status === 'running' && !window.confirm('진행 중인 토너먼트가 있어요. 새로 섞을까요?')) return;
      await save(makeTournament(list));
      setShow(null);
      setView('reveal');
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
    await finishGame(tt, m, fillTiers(sa?.tiers, 'good'), fillTiers(sb?.tiers, 'good'), true);
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
        <button onClick={() => void start()} disabled={busy} className="rounded-full bg-emerald-500 px-4 py-1.5 text-[2.2vmin] font-black text-slate-900 disabled:opacity-50">
          {t ? '🔀 새로 섞어 시작' : '⚔️ 배틀 토너먼트 시작!'}
        </button>
        <button
          onClick={() => setRehearsal((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-[1.8vmin] font-bold border ${rehearsal ? 'bg-sky-500 text-slate-900 border-sky-300' : 'bg-slate-800 text-slate-300 border-slate-600'}`}
          title="테스트 번호(900~) 곤충도 참가"
        >
          🧪 리허설 {rehearsal ? '켜짐' : '꺼짐'}
        </button>
        {t && (
          <button
            onClick={() => setView(view === 'reveal' ? 'stage' : 'reveal')}
            className="rounded-full bg-slate-700 px-4 py-1.5 text-[2vmin] font-bold"
          >
            {view === 'reveal' ? '⚔️ 경기 화면' : '📋 대진표 크게'}
          </button>
        )}
        {t?.status === 'running' && cur && !show && view === 'stage' && (
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

      {t && view === 'reveal' && <Reveal t={t} onGo={() => setView('stage')} />}

      {t && view === 'stage' && (
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
                liveTiers={live}
                label={`${matchLabel(t, stageMatch)}${stageMatch.bestOf === 3 ? ` · 3판 2선승 (${winsOf(stageMatch).a} : ${winsOf(stageMatch).b})` : ''} — 👦 ${t.entrants[stageMatch.a].kid} vs 👦 ${t.entrants[stageMatch.b].kid}`}
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

/** 📋 대진표 크게 — 1라운드 경기를 왼쪽부터 1경기·2경기… 카드로 (곤충 그림 + 아이 이름) */
function Reveal({ t, onGo }: { t: Tournament; onGo: () => void }) {
  const [imgs, setImgs] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void loadInsectImages(t.entrants.map((e) => e.iid)).then(setImgs).catch(() => undefined);
  }, [t.id, t.entrants]);
  const r = Math.min(t.rounds.length - 1, Math.max(0, t.rounds.findIndex((round) => round.some((m) => !m.winner))));
  const round = t.rounds[r < 0 ? t.rounds.length - 1 : r] ?? [];
  const first = round.find((m) => m.id === t.current);
  const person = (idx: number | null, m?: Match) => {
    if (idx === null) return <div className="flex-1 flex items-center justify-center text-[2.6vmin] font-black text-emerald-300">🎉 부전승!</div>;
    const e = t.entrants[idx];
    const src = imgs.get(e.iid);
    const rev = m ? showRevived(t, m, idx) : false;
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center gap-[0.6vmin]">
        <div className={`relative w-full aspect-[4/5] overflow-hidden rounded-[1.2vmin] bg-slate-800 border-2 ${rev ? 'border-orange-400' : 'border-slate-600'}`}>
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="w-full h-full object-cover" />
          )}
          {rev && <span className="absolute left-1 top-1 rounded-md bg-orange-500 px-1.5 text-[1.8vmin] font-black text-white">🔥 부활</span>}
        </div>
        <p className="w-full truncate text-center text-[2.2vmin] font-black">{e.nick}</p>
        <p className="w-full truncate text-center text-[2vmin] font-bold text-amber-200">👦 {e.kid}</p>
      </div>
    );
  };
  const roundIdx = r < 0 ? 0 : r;
  const revivedHere = round
    .flatMap((m) => [m.a, m.b].map((idx) => ({ idx, m })))
    .filter(({ idx, m }) => !m.revival && showRevived(t, m, idx));
  const waiting = roundIdx === 0 && t.waiting !== null && t.waiting !== undefined ? t.waiting : null;
  return (
    <section className="flex flex-col items-center gap-[2.4vmin]">
      <p className="attract-gold text-[6vmin] font-black animate-vs-slam">
        {first?.revival ? '🔥 패자부활전!' : `${roundName(t, roundIdx).startsWith('🏆') ? '' : '🏆 '}${roundName(t, roundIdx)} 대진표!`}
      </p>
      {first?.revival && first.b !== null && (
        <p className="text-[3.4vmin] font-black text-orange-300 text-center">한끗 차이로 아깝게 진 👦 {t.entrants[first.b].kid} 에게 한 번 더 기회!</p>
      )}
      {revivedHere.map(({ idx }) => (
        <p key={idx} className="text-[3.4vmin] font-black text-orange-300 text-center animate-pop">
          🔥 패자부활! 한끗 차이로 아깝게 진 👦 {t.entrants[idx!].kid} 가 다시 올라왔어!
        </p>
      ))}
      <div className="flex flex-wrap justify-center gap-[2vmin] w-full">
        {round.map((m, i) => (
          <div
            key={m.id}
            className={`animate-pop ${round.length > 4 ? 'w-[min(22vw,32vh)]' : 'w-[min(30vw,40vh)]'} rounded-[2vmin] border-4 p-[1.2vmin] ${
              m.id === t.current
                ? m.revival
                  ? 'border-orange-400 bg-orange-500/15 shadow-[0_0_28px_rgba(251,146,60,0.7)]'
                  : 'border-amber-300 bg-amber-400/15 shadow-[0_0_24px_rgba(251,191,36,0.6)]'
                : m.winner
                  ? 'border-slate-700 bg-slate-900/60 opacity-60'
                  : 'border-slate-600 bg-slate-900'
            }`}
            style={{ animationDelay: `${i * 0.35}s`, animationFillMode: 'both' }}
          >
            <p className={`text-center text-[3vmin] font-black ${m.revival ? 'text-orange-300' : 'text-amber-300'}`}>
              {m.revival ? '🔥 패자부활전' : round.filter((x) => !x.revival).length === 1 ? roundName(t, m.round).replace('🏆 결승', '🏆 결승전') : `${m.slot + 1}경기`}{' '}
              {m.id === t.current ? '👈 지금!' : m.b === null ? '' : m.winner ? '✅ 끝' : ''}
            </p>
            <div className="mt-[0.8vmin] flex items-center gap-[1vmin]">
              {person(m.a, m)}
              <span className="text-[3.4vmin] font-black text-amber-300">VS</span>
              {person(m.b, m)}
            </div>
          </div>
        ))}
        {waiting !== null && (
          <div className="animate-pop w-[min(22vw,32vh)] rounded-[2vmin] border-4 border-dashed border-orange-400/70 bg-slate-900 p-[1.2vmin]" style={{ animationDelay: `${round.length * 0.35}s`, animationFillMode: 'both' }}>
            <p className="text-center text-[3vmin] font-black text-orange-300">🔥 패자부활전 대기</p>
            <div className="mt-[0.8vmin] flex items-center gap-[1vmin]">
              {person(waiting)}
              <span className="text-[3.4vmin] font-black text-orange-300">VS</span>
              <div className="flex-1 text-center text-[2.2vmin] font-black text-slate-300">❓ 제일 아깝게 진 친구</div>
            </div>
            <p className="mt-[0.6vmin] text-center text-[2vmin] font-bold text-slate-300">1라운드가 다 끝나면 붙어!</p>
          </div>
        )}
      </div>
      {first && first.a !== null && first.b !== null ? (
        // 경기가 많아 화면이 길어져도 시작 버튼은 늘 보이게 (아래에 붙음)
        <div className="sticky bottom-0 z-20 w-full flex flex-col items-center gap-[1.2vmin] bg-slate-950/90 py-[1.4vmin] backdrop-blur">
          <p className="text-[3.4vmin] font-black text-center">
            ⚔️ {matchLabel(t, first)} 👦 {t.entrants[first.a].kid} · 👦 {t.entrants[first.b].kid} — 배틀 태블릿 앞에 앉아서 내 QR 을 찍어줘!
          </p>
          <button onClick={onGo} className="btn-sparkle rounded-3xl bg-amber-400 px-[5vmin] py-[2vmin] text-[4vmin] font-black text-slate-900">
            ⚔️ {matchLabel(t, first)} 시작!
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** 3칸 다 채우기 (안 온 칸은 fill) */
function fillTiers(x: (string | null)[] | undefined, fill: string): string[] {
  return Array.from({ length: CHANCE_COUNT }, (_, i) => x?.[i] ?? fill);
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
                    <span className={`truncate max-w-[14vmin] ${e ? '' : 'text-slate-500 font-normal'}`}>
                      {e ? `${showRevived(t, m, idx) ? '🔥' : ''}${e.nick}` : '(부전승)'}
                    </span>
                    {m.bestOf === 3 && <span>{side === 'a' ? w.a : w.b}</span>}
                  </div>
                );
              };
              const live = m.id === currentId;
              return (
                <div key={m.id} className={`rounded-lg border ${m.revival ? 'border-dashed border-orange-400/80 ' : ''}${live ? 'border-amber-300 bg-amber-400/15 shadow-[0_0_14px_rgba(251,191,36,0.5)]' : 'border-slate-700 bg-slate-900'}`}>
                  {m.revival && <p className="px-[0.8vmin] pt-[0.3vmin] text-[1.5vmin] font-black text-orange-300">🔥 패자부활전</p>}
                  {row('a')}
                  <div className="h-px bg-slate-700" />
                  {row('b')}
                </div>
              );
            })}
            {r === 0 && t.waiting !== null && t.waiting !== undefined && (
              <div className="rounded-lg border border-dashed border-orange-400/80 bg-slate-900 px-[0.8vmin] py-[0.4vmin] text-[1.8vmin] font-bold">
                <p className="text-[1.5vmin] font-black text-orange-300">🔥 패자부활전 대기</p>
                <p className="truncate max-w-[14vmin]">{t.entrants[t.waiting].nick}</p>
              </div>
            )}
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

