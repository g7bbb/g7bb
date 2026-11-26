'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import DuelStage, { DuelOutcome } from '@/app/tournament/duel-stage';
import { getCurrentPlayer, signOut } from '@/lib/session';
import { isArenaDevice } from '@/lib/arena';
import QrScanner from '@/app/start/qr-scanner';
import {
  Tournament,
  Match,
  champion,
  findMatch,
  upcomingMatches,
  loadInsect,
  loadTournament,
  readSignals,
  matchLabel,
  signalFor,
  syncClock,
  winsOf,
  writeSignal,
} from '@/lib/tournament';
import { insectImageSrc } from '@/lib/bots';
import { unlockAudio } from '@/lib/sfx';
import { Insect, Player } from '@/lib/types';
import { BrandMark } from '@/app/brand-logo';

// ⚔️ (체험용) 토너먼트 대결 — 아이 태블릿·폰 (2026-11-25 Jin)
// 종이 QR 로 들어오면(토너먼트 중엔 /start 가 여기로 보냄) 내 차례인지 보고:
//   내 차례 → 대기 화면(내 카드 + 상대는 그림자) → 상대가 들어오면 카드가 쾅 → "G7BB 배틀!! 시작!!" 3·2·1 → 필살기 타이밍 → 결과
//   아니면 → "내 차례를 기다려줘" / 탈락 / 우승.
// 신호(들어왔어요·타이밍)는 **내 줄에만** 쓴다 (lib/tournament.ts writeSignal). 진행·승패는 직원 화면이 정한다.
// 🔒 11/25 Jin: 배틀은 **배틀 태블릿 2대**(/arena 로 켠 기기)에서만. 아이 폰은 응원 화면만.
//    배틀 태블릿: QR 찍기 → 내 카드가 태블릿·큰 화면에 뜸 → 상대가 들어오면 HERE COMES → 배틀 → 내 경기가 끝나면 저절로 로그아웃 → 다음 친구 QR.

const POLL_MS = 1000;

export default function DuelPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [t, setT] = useState<Tournament | null>(null);
  const [oppJoined, setOppJoined] = useState(false);
  /** 상대가 지금까지 누른 판정 (신호에서) */
  const [oppTiers, setOppTiers] = useState<(string | null)[]>([null, null, null]);
  const [ins, setIns] = useState<{ a: Insect | null; b: Insect | null }>({ a: null, b: null });
  const [arena, setArena] = useState(false);
  const [scan, setScan] = useState(false);
  const joinedKey = useRef('');
  /** 방금 판 결과를 보여주는 중이면 다음 판 입장 신호를 잠깐 미룬다 */
  const holdRef = useRef(false);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    setArena(isArenaDevice());
    void syncClock();
    // 소리는 화면을 한 번 눌러야 켜진다 — 아무 데나 처음 누를 때
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    void getCurrentPlayer().then((p) => {
      playerRef.current = p;
      setPlayer(p);
      setReady(true);
    });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // 1초마다 대진표·상대 신호 확인
  useEffect(() => {
    const id = window.setInterval(async () => {
      const p = playerRef.current;
      const tt = await loadTournament();
      setT(tt);
      if (!p || !tt) return;
      const me = tt.entrants.findIndex((e) => e.pid === p.id);
      const m = findMatch(tt, tt.current);
      if (!isArenaDevice() || me < 0 || !m || (m.a !== me && m.b !== me) || m.seed === undefined) {
        setOppJoined(false);
        return;
      }
      const side = m.a === me ? 'a' : 'b';
      const opp = tt.entrants[side === 'a' ? m.b! : m.a!];
      // 이번 판에 들어왔다고 알리기 (한 번만)
      const key = `${tt.id}:${m.id}:${m.games.length}`;
      if (joinedKey.current !== key && !holdRef.current) {
        joinedKey.current = key;
        await writeSignal(p.id, { tid: tt.id, mid: m.id, g: m.games.length, joinedAt: Date.now() }).catch(() => {
          joinedKey.current = '';
        });
      }
      const sigs = await readSignals([opp.pid]).catch(() => new Map());
      const os = signalFor(sigs.get(opp.pid), tt, m);
      setOppJoined(!!os);
      const ot = os?.tiers ?? [null, null, null];
      setOppTiers((prev) => (prev.join(',') === ot.join(',') ? prev : ot));
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  const me = t && player ? t.entrants.findIndex((e) => e.pid === player.id) : -1;
  // 내가 나오는 경기: 지금 경기 → 아니면 방금 끝난 내 경기(결과 보여주기)
  const myMatches = t && me >= 0 ? t.rounds.flat().filter((m) => m.a === me || m.b === me) : [];
  const cur = t ? findMatch(t, t.current) : null;
  const live = cur && (cur.a === me || cur.b === me) ? cur : null;
  const last = [...myMatches].reverse().find((m) => m.games.length > 0) ?? null;
  const showMatch: Match | null = live ?? null;

  // 결과: 직원 화면이 적은 이번 판 결과
  const [gameIdx, setGameIdx] = useState<number | null>(null);
  const [frozen, setFrozen] = useState<{ startAt: number; mid: string; g: number } | null>(null);
  useEffect(() => {
    if (showMatch?.startAt) {
      setFrozen({ startAt: showMatch.startAt, mid: showMatch.id, g: showMatch.games.length });
      setGameIdx(showMatch.games.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMatch?.startAt]);
  const resultMatch = frozen && t ? findMatch(t, frozen.mid) : null;
  const game = resultMatch && gameIdx !== null ? resultMatch.games[gameIdx] : null;
  const outcome: DuelOutcome | null = game
    ? { winner: game.winner, tiersA: game.tiersA ?? [], tiersB: game.tiersB ?? [], left: game.left ?? 20, reason: game.reason ?? '' }
    : null;
  // 결과를 다 보고 나면 대기 화면으로 (그동안은 다음 경기에 "들어왔어요" 를 안 보낸다 — 이긴 기쁨을 누릴 시간)
  const hasOutcome = !!outcome;
  useEffect(() => {
    if (!hasOutcome) return;
    const id = window.setTimeout(() => {
      setFrozen(null);
      setGameIdx(null);
    }, 13000);
    return () => window.clearTimeout(id);
  }, [hasOutcome]);
  useEffect(() => {
    holdRef.current = hasOutcome;
  }, [hasOutcome]);

  // 두 곤충 불러오기 — 결과를 보여주는 동안엔 **보여주는 경기**의 곤충 (다음 경기 곤충이 섞이지 않게)
  const viewMatch = frozen && resultMatch ? resultMatch : showMatch ?? last;
  const viewKey = viewMatch ? viewMatch.id : '';
  useEffect(() => {
    const m = viewMatch;
    if (!t || !m || m.a === null || m.b === null) return;
    let alive = true;
    void Promise.all([loadInsect(t.entrants[m.a].iid), loadInsect(t.entrants[m.b].iid)]).then(([a, b]) => alive && setIns({ a, b }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, t?.id]);

  // 내 판정 3칸 — 누를 때마다 3칸 통째로 다시 쓴다 (쓰기는 한 번에 하나씩 차례로)
  const myTiersRef = useRef<{ key: string; tiers: (string | null)[] }>({ key: '', tiers: [null, null, null] });
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  function press(round: number, tierKey: string) {
    const p = playerRef.current;
    if (!p || !t || !frozen) return;
    const key = `${t.id}:${frozen.mid}:${frozen.g}`;
    if (myTiersRef.current.key !== key) myTiersRef.current = { key, tiers: [null, null, null] };
    const cur = myTiersRef.current.tiers[round];
    if (cur && cur !== 'miss') return; // 이미 누른 칸을 "못 누름" 으로 덮지 않게
    myTiersRef.current.tiers = myTiersRef.current.tiers.map((x, i) => (i === round ? tierKey : x));
    const sig = { tid: t.id, mid: frozen.mid, g: frozen.g, joinedAt: Date.now(), tiers: [...myTiersRef.current.tiers] };
    writeChain.current = writeChain.current.then(() => writeSignal(p.id, sig).catch(() => {}));
  }

  function leave() {
    signOut();
    playerRef.current = null;
    joinedKey.current = '';
    setPlayer(null);
    setFrozen(null);
    setGameIdx(null);
  }

  // 내 경기가 다 끝났으면(지금 경기도 다음 경기도 아님) 잠깐 보여주고 로그아웃 → 다음 친구 차례
  const upcoming = t ? upcomingMatches(t, 2) : [];
  const mineSoon = upcoming.some((m) => m.a === me || m.b === me);
  const idle = !!player && arena && !!t && !frozen && !mineSoon;
  const champIdle = !!t && t.status === 'done' && champion(t)?.pid === player?.id;
  useEffect(() => {
    if (!idle) return;
    const id = window.setTimeout(leave, champIdle ? 20000 : me < 0 ? 5000 : 9000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle, champIdle, me]);

  if (!ready) return <p className="p-10 text-center text-slate-400">불러오는 중…</p>;

  const curLine =
    t && cur && cur.a !== null && cur.b !== null ? (
      <p className="text-[3.4vmin] font-black text-amber-200">
        지금 경기: 👦 {t.entrants[cur.a].kid || t.entrants[cur.a].nick} vs 👦 {t.entrants[cur.b].kid || t.entrants[cur.b].nick}
      </p>
    ) : null;

  // 📱 아이 폰 (배틀 태블릿이 아님) — 응원만
  if (!arena)
    return (
      <Center>
        <BrandMark size={56} />
        <p className="text-[6vmin] font-black">⚔️ 배틀은 배틀 태블릿에서 해!</p>
        <p className="text-[3.4vmin] text-slate-300">내 차례가 되면 선생님이 불러줄게. 배틀 태블릿 앞에 앉아서 내 종이 QR 을 찍으면 돼!</p>
        {curLine}
        <p className="text-[3vmin] font-bold text-slate-300">그동안 큰 화면으로 친구들을 응원해줘 📣</p>
        <Link href="/" className="rounded-2xl bg-slate-700 px-6 py-3 font-black">
          처음 화면으로
        </Link>
      </Center>
    );

  // ⚔️ 배틀 태블릿 — 아직 아무도 안 찍었으면 QR 찍기
  if (!player)
    return (
      <Center>
        <BrandMark size={56} />
        <p className="text-[5vmin] font-black">⚔️ G7BB 배틀 태블릿</p>
        {!t || t.status !== 'running' ? (
          <p className="text-[3.6vmin] text-slate-300">⏳ 선생님이 토너먼트를 시작하면 여기서 배틀해!</p>
        ) : (
          <>
            {curLine}
            <p className="text-[3.4vmin] font-bold text-slate-200">이 두 친구, 자기 종이 QR 을 찍어줘!</p>
          </>
        )}
        <button
          onClick={() => {
            unlockAudio();
            setScan(true);
          }}
          className="btn-sparkle rounded-3xl bg-amber-400 px-10 py-6 text-[5vmin] font-black text-slate-900"
        >
          📷 내 QR 찍기
        </button>
        {scan && <QrScanner onClose={() => setScan(false)} />}
      </Center>
    );

  const playing = frozen && resultMatch && resultMatch.a !== null && resultMatch.b !== null;
  const stageMatch = playing ? resultMatch! : showMatch;

  if (!t)
    return (
      <Center>
        <p className="text-[5vmin] font-black">⏳ 아직 토너먼트가 시작 안 했어!</p>
        <p className="text-[3vmin] text-slate-300">선생님이 시작하면 저절로 대결장이 열려.</p>
      </Center>
    );

  if (stageMatch && (stageMatch.a === me || stageMatch.b === me)) {
    const sideNow: 'a' | 'b' = stageMatch.a === me ? 'a' : 'b';
    return (
      <main className="min-h-screen bg-slate-950 text-white px-[3vw] py-[3vmin] flex flex-col items-center justify-center">
        <DuelStage
          key={`${stageMatch.id}:${frozen ? frozen.startAt : stageMatch.games.length}`}
          a={ins.a}
          b={ins.b}
          srcA={ins.a ? insectImageSrc(ins.a) : undefined}
          srcB={ins.b ? insectImageSrc(ins.b) : undefined}
          joinedA={sideNow === 'a' ? true : oppJoined || !!frozen}
          joinedB={sideNow === 'b' ? true : oppJoined || !!frozen}
          startAt={frozen ? frozen.startAt : stageMatch.startAt}
          outcome={outcome}
          me={sideNow}
          onPress={press}
          liveTiers={sideNow === 'a' ? { a: [null, null, null], b: oppTiers } : { a: oppTiers, b: [null, null, null] }}
          label={`${matchLabel(t, stageMatch)}${stageMatch.bestOf === 3 ? ` · 3판 2선승 (${winsOf(stageMatch).a} : ${winsOf(stageMatch).b})` : ''}`}
        />
      </main>
    );
  }

  // 내 차례가 아닐 때
  const champ = t.status === 'done' ? champion(t) : null;
  // 졌어도 패자부활로 다시 올라오면(아직 안 끝난 경기가 있으면) 탈락이 아니다
  const stillIn = myMatches.some((m) => !m.winner) || t.waiting === me;
  const out = !stillIn && myMatches.some((m) => m.winner && (m.winner === 'a' ? m.b === me : m.a === me));
  return (
    <Center>
      <BrandMark size={48} />
      {champ && champ.pid === player.id ? (
        <p className="attract-gold text-[9vmin] font-black">👑 우승!! 수액은 네 거야!</p>
      ) : out ? (
        <>
          <p className="text-[6vmin] font-black">😊 수고했어!</p>
          <p className="text-[3.4vmin] text-slate-300">멋진 배틀이었어. 이제 큰 화면으로 친구들을 응원해줘!</p>
        </>
      ) : me < 0 ? (
        <>
          <p className="text-[5vmin] font-black">이번 토너먼트 선수가 아니야 🙂</p>
          <p className="text-[3vmin] text-slate-300">큰 화면으로 친구들 배틀을 응원해줘!</p>
        </>
      ) : t.waiting === me ? (
        <>
          <p className="text-[6vmin] font-black">🔥 너는 패자부활전 선수야!</p>
          <p className="text-[3.4vmin] text-slate-300">1라운드가 다 끝나면, 제일 아깝게 진 친구랑 붙어. 그때 다시 QR 을 찍어줘!</p>
        </>
      ) : mineSoon ? (
        <>
          <p className="text-[6vmin] font-black">🔥 곧 네 차례야!</p>
          <p className="text-[3.4vmin] text-slate-300">앞 경기가 끝나면 이 화면에서 바로 대결이 시작돼. 그대로 기다려줘!</p>
          {cur && cur.a !== null && cur.b !== null && (
            <p className="text-[3vmin] font-bold text-amber-200">
              지금 경기: {t.entrants[cur.a].nick} vs {t.entrants[cur.b].nick}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-[6vmin] font-black">⏳ 내 차례를 기다려줘!</p>
          <p className="text-[3.4vmin] text-slate-300">내 경기가 아직 멀었어. 내 차례가 되면 다시 QR 을 찍어줘!</p>
          {cur && cur.a !== null && cur.b !== null && (
            <p className="text-[3vmin] font-bold text-amber-200">
              지금 경기: {t.entrants[cur.a].nick} vs {t.entrants[cur.b].nick}
            </p>
          )}
        </>
      )}
      <button onClick={leave} className="mt-[2vmin] rounded-2xl bg-slate-700 px-6 py-3 text-[3vmin] font-black">
        👋 다음 친구 차례 (로그아웃)
      </button>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-[3vmin] px-6 text-center" style={{ wordBreak: 'keep-all' }}>
      {children}
    </main>
  );
}
