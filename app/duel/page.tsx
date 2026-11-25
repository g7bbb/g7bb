'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import DuelStage, { DuelOutcome } from '@/app/tournament/duel-stage';
import { getCurrentPlayer } from '@/lib/session';
import {
  Tournament,
  Match,
  champion,
  findMatch,
  loadInsect,
  loadTournament,
  readSignals,
  roundName,
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

const POLL_MS = 1000;

export default function DuelPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [t, setT] = useState<Tournament | null>(null);
  const [oppJoined, setOppJoined] = useState(false);
  const [ins, setIns] = useState<{ a: Insect | null; b: Insect | null }>({ a: null, b: null });
  const [tapped, setTapped] = useState(false);
  const joinedKey = useRef('');
  /** 방금 판 결과를 보여주는 중이면 다음 판 입장 신호를 잠깐 미룬다 */
  const holdRef = useRef(false);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    void syncClock();
    void getCurrentPlayer().then((p) => {
      playerRef.current = p;
      setPlayer(p);
      setReady(true);
    });
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
      if (me < 0 || !m || (m.a !== me && m.b !== me) || m.seed === undefined) {
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
      setOppJoined(!!signalFor(sigs.get(opp.pid), tt, m));
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
  const outcome: DuelOutcome | null = game ? { winner: game.winner, tierA: game.tierA, tierB: game.tierB } : null;
  // 결과를 다 보고 나면 대기 화면으로 (그동안은 다음 경기에 "들어왔어요" 를 안 보낸다 — 이긴 기쁨을 누릴 시간)
  const hasOutcome = !!outcome;
  useEffect(() => {
    if (!hasOutcome) return;
    const id = window.setTimeout(() => {
      setFrozen(null);
      setGameIdx(null);
    }, 10000);
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

  async function press(tierKey: string) {
    const p = playerRef.current;
    if (!p || !t || !frozen) return;
    await writeSignal(p.id, { tid: t.id, mid: frozen.mid, g: frozen.g, joinedAt: Date.now(), tier: tierKey }).catch(() => {});
  }

  if (!ready) return <p className="p-10 text-center text-slate-400">불러오는 중…</p>;
  if (!player)
    return (
      <Center>
        <p className="text-[6vmin] font-black">📷 종이 QR 을 먼저 찍어줘!</p>
        <Link href="/" className="rounded-2xl bg-amber-400 px-6 py-3 font-black text-slate-900">
          처음 화면으로
        </Link>
      </Center>
    );

  // 소리는 터치해야 켜진다 — 처음 한 번 눌러서 시작
  if (!tapped)
    return (
      <Center>
        <BrandMark size={56} />
        <p className="text-[5vmin] font-black">⚔️ G7BB 배틀 토너먼트</p>
        <button
          onClick={() => {
            unlockAudio();
            setTapped(true);
          }}
          className="btn-sparkle rounded-3xl bg-amber-400 px-10 py-6 text-[5vmin] font-black text-slate-900"
        >
          👆 대결장 들어가기
        </button>
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
  if (me < 0)
    return (
      <Center>
        <p className="text-[5vmin] font-black">이번 토너먼트 선수가 아니야 🙂</p>
        <p className="text-[3vmin] text-slate-300">큰 화면으로 친구들 배틀을 응원해줘!</p>
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
          label={`${roundName(t, stageMatch.round)}${stageMatch.bestOf === 3 ? ` · 3판 2선승 (${winsOf(stageMatch).a} : ${winsOf(stageMatch).b})` : ''}`}
        />
      </main>
    );
  }

  // 내 차례가 아닐 때
  const champ = t.status === 'done' ? champion(t) : null;
  const out = myMatches.some((m) => m.winner && (m.winner === 'a' ? m.b === me : m.a === me));
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
      ) : (
        <>
          <p className="text-[6vmin] font-black">⏳ 내 차례를 기다려줘!</p>
          <p className="text-[3.4vmin] text-slate-300">큰 화면에 내 이름이 나오면 이 화면에서 바로 대결이 시작돼.</p>
          {cur && cur.a !== null && cur.b !== null && (
            <p className="text-[3vmin] font-bold text-amber-200">
              지금 경기: {t.entrants[cur.a].nick} vs {t.entrants[cur.b].nick}
            </p>
          )}
        </>
      )}
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
