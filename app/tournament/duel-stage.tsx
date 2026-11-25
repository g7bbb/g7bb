'use client';

import { useEffect, useRef, useState } from 'react';
import { Insect } from '@/lib/types';
import { CHANCE_LEN, T_CHANCE, T_COUNT, T_RESOLVE, T_VS, serverNow } from '@/lib/tournament';
import { judgeTiming, movesFor, TIMING_TIERS } from '@/lib/special-moves';
import { levelTier, frameShines } from '@/lib/card';
import { ENVIRONMENTS } from '@/lib/environments';
import { playPerfect, playSound, playTap } from '@/lib/sfx';

// ⚔️ 토너먼트 한 판 화면 — 큰 화면(screen)·아이 태블릿(me='a'|'b')이 같이 쓴다.
// 시간표(lib/tournament.ts T_*)를 **서버 시각**으로 따라가서 두 기기가 같은 순간에 같은 장면을 본다.
//   대기(그림자 카드) → "G7BB 배틀!! 시작!!" → 3·2·1 → VS → ⚡ 필살기 타이밍(각자 자기 기기에서) → 결과 계산 → 결과 연출

export interface DuelOutcome {
  winner: 'a' | 'b';
  tierA: string;
  tierB: string;
}

type Phase = 'wait' | 'title' | 'count' | 'vs' | 'chance' | 'resolve' | 'result';

export function tierText(key: string | undefined): string {
  if (key === 'miss' || !key) return '😴 못 눌렀어';
  const t = TIMING_TIERS.find((x) => x.key === key);
  return t ? `${t.emoji} ${t.label}` : '';
}

export default function DuelStage({
  a,
  b,
  srcA,
  srcB,
  joinedA,
  joinedB,
  startAt,
  outcome,
  me,
  onPress,
  label,
}: {
  a: Insect | null;
  b: Insect | null;
  srcA?: string;
  srcB?: string;
  joinedA: boolean;
  joinedB: boolean;
  /** 서버 시각(ms). 없으면 아직 대기 */
  startAt?: number;
  outcome: DuelOutcome | null;
  /** 아이 기기면 내 쪽 */
  me?: 'a' | 'b';
  /** 필살기 버튼을 눌렀을 때 (아이 기기만) — 판정 key 를 넘긴다 */
  onPress?: (tierKey: string) => void;
  label?: string;
}) {
  const [phase, setPhase] = useState<Phase>('wait');
  // ⚡ 상대가 들어오는 순간 "HERE COMES A NEW CHALLENGER!" (11/25 Jin: 격투게임처럼 그림자 → 띠잉)
  const [challenger, setChallenger] = useState<'a' | 'b' | null>(null);
  const prevJoined = useRef({ a: joinedA, b: joinedB });
  useEffect(() => {
    const prev = prevJoined.current;
    const side: 'a' | 'b' | null = !prev.a && joinedA ? 'a' : !prev.b && joinedB ? 'b' : null;
    prevJoined.current = { a: joinedA, b: joinedB };
    if (!side || (startAt && serverNow() >= startAt)) return;
    setChallenger(side);
    try {
      playSound('next');
    } catch {
      // 소리는 없어도 된다
    }
    const id = window.setTimeout(() => setChallenger(null), 2200);
    return () => window.clearTimeout(id);
  }, [joinedA, joinedB, startAt]);
  const [count, setCount] = useState(3);
  const [myTier, setMyTier] = useState<string | null>(null);
  const [resultStep, setResultStep] = useState(0);
  const phaseRef = useRef<Phase>('wait');
  const chanceAt = useRef(0);

  // 시간표 따라가기 (화면 한 장마다 확인, 바뀔 때만 다시 그림)
  useEffect(() => {
    setMyTier(null);
    if (!startAt) {
      phaseRef.current = 'wait';
      setPhase('wait');
      return;
    }
    chanceAt.current = startAt + T_CHANCE;
    let raf = 0;
    const tick = () => {
      const e = serverNow() - startAt;
      // 시작 시각 전(도전자 등장 연출 중)은 아직 대기 화면
      const p: Phase = e < 0 ? 'wait' : e < T_COUNT ? 'title' : e < T_VS ? 'count' : e < T_CHANCE ? 'vs' : e < T_CHANCE + CHANCE_LEN ? 'chance' : 'resolve';
      if (p === 'count') setCount(Math.max(1, 3 - Math.floor((e - T_COUNT) / 1000)));
      if (p !== phaseRef.current && phaseRef.current !== 'result') {
        phaseRef.current = p;
        setPhase(p);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startAt]);

  // 결과가 오면 (그리고 계산 시간이 지났으면) 결과 연출
  useEffect(() => {
    if (!outcome || !startAt) return;
    const wait = Math.max(0, startAt + T_RESOLVE - serverNow());
    const ts = [
      window.setTimeout(() => {
        phaseRef.current = 'result';
        setPhase('result');
        setResultStep(0);
      }, wait),
      window.setTimeout(() => setResultStep(1), wait + 700),
      window.setTimeout(() => setResultStep(2), wait + 1400),
      window.setTimeout(() => setResultStep(3), wait + 2200),
    ];
    return () => ts.forEach((t) => window.clearTimeout(t));
    // ⚠️ outcome 객체는 1초마다 새로 만들어져서(아이 기기 폴링) 값으로 비교한다 — 객체로 비교하면 연출이 계속 처음으로 돌아간다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome?.winner, outcome?.tierA, outcome?.tierB, startAt]);

  function press() {
    if (phase !== 'chance' || myTier || !onPress) return;
    const tier = judgeTiming(serverNow() - chanceAt.current);
    setMyTier(tier.key);
    if (tier.key === 'perfect') playPerfect();
    else playTap(tier.key === 'ok' ? 500 : 800);
    onPress(tier.key);
  }

  // HP 바 (결과 연출)
  const loser = outcome ? (outcome.winner === 'a' ? 'b' : 'a') : null;
  const hp = (side: 'a' | 'b') => {
    if (phase !== 'result') return 100;
    if (resultStep < 1) return 100;
    if (resultStep < 3) return side === 'a' ? (resultStep >= 2 ? 62 : 80) : resultStep >= 1 ? 66 : 100;
    return side === loser ? 0 : 38;
  };
  const lunge = (side: 'a' | 'b') =>
    phase === 'result' && ((resultStep === 1 && side === 'a') || (resultStep === 2 && side === 'b') || (resultStep === 3 && side === outcome?.winner));
  const hurt = (side: 'a' | 'b') =>
    phase === 'result' && ((resultStep === 1 && side === 'b') || (resultStep === 2 && side === 'a') || (resultStep === 3 && side === loser));

  const card = (side: 'a' | 'b') => {
    const ins = side === 'a' ? a : b;
    const src = side === 'a' ? srcA : srcB;
    const joined = side === 'a' ? joinedA : joinedB;
    const tier = levelTier(ins?.level ?? 1);
    const env = ENVIRONMENTS.find((e) => e.key === ins?.origin);
    const isMe = me === side;
    const shift = side === 'a' ? 'translateX(18%)' : 'translateX(-18%)';
    return (
      <div
        className={`relative flex flex-col items-center gap-[1vmin] transition-transform duration-200 ${hurt(side) ? 'animate-shake' : ''}`}
        style={{ transform: lunge(side) ? `${shift} scale(1.08)` : undefined, zIndex: lunge(side) ? 5 : 1 }}
      >
        <p className={`text-[2.8vmin] font-black ${isMe ? 'text-amber-300' : 'text-slate-300'}`}>{isMe ? '⭐ 나' : side === 'a' ? '🔴 왼쪽' : '🔵 오른쪽'}</p>
        <div
          className={`relative ${me ? 'w-[min(38vw,46vh)]' : 'w-[min(26vw,34vh)]'} aspect-[4/5] rounded-[2vmin] p-[0.7vmin] ${joined && frameShines(tier) ? 'holo-frame' : ''} ${
            phase === 'vs' || challenger === side ? 'animate-vs-slam' : ''
          } ${challenger === side ? 'challenger-flash' : ''}`}
          style={{ background: joined ? tier.frame : '#1e293b' }}
        >
          <div className="relative w-full h-full overflow-hidden rounded-[1.5vmin] bg-slate-900">
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${joined ? '' : 'duel-shadow'}`}
              />
            )}
            {!joined && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[1vmin] text-center">
                <span className="text-[10vmin] font-black text-slate-500 animate-pulse">?</span>
                <span className="px-2 text-[2.4vmin] font-black text-slate-300">⏳ 접속 기다리는 중…</span>
              </div>
            )}
            {joined && (
              <>
                <span className="absolute left-[4%] top-[3%] rounded-md bg-black/60 px-2 py-0.5 text-[2.2vmin] font-black text-amber-200">LV.{ins?.level ?? 1}</span>
                {env && <span className="absolute right-[4%] top-[3%] text-[3.4vmin]">{env.emoji}</span>}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-[5%] pb-[3%] pt-[18%]">
                  <p className="truncate text-[3.2vmin] font-black leading-tight">{ins?.nickname}</p>
                  <p className="truncate text-[2vmin] font-bold text-slate-300">{ins?.species}</p>
                </div>
              </>
            )}
            {hurt(side) && <span className="absolute inset-0 flex items-center justify-center text-[12vmin] animate-impact-pop">💥</span>}
          </div>
        </div>
        {joined && <p className="text-[2.4vmin] font-black text-emerald-300 animate-pop">✅ 접속 완료!</p>}
        {/* HP */}
        <div className={`${me ? 'w-[min(38vw,46vh)]' : 'w-[min(26vw,34vh)]'} h-[2vmin] rounded-full bg-slate-800 overflow-hidden border border-black/50`}>
          <div
            className={`h-full transition-all duration-500 ${side === 'a' ? 'bg-rose-500' : 'bg-sky-500'}`}
            style={{ width: `${hp(side)}%` }}
          />
        </div>
        {phase === 'result' && resultStep >= 3 && outcome && (
          <p className="text-[2.6vmin] font-black">{tierText(side === 'a' ? outcome.tierA : outcome.tierB)}</p>
        )}
      </div>
    );
  };

  const winnerIns = outcome ? (outcome.winner === 'a' ? a : b) : null;
  const myMove = me ? movesFor((me === 'a' ? a : b)?.species, (me === 'a' ? a : b)?.level ?? 1)[0] : null;

  return (
    <div className="relative w-full flex flex-col items-center gap-[2vmin]" style={{ wordBreak: 'keep-all' }}>
      {label && <p className="text-[3vmin] font-black text-amber-200">{label}</p>}
      <div className="relative flex items-start justify-center gap-[3vw]">
        {card('a')}
        <p className={`self-center text-[9vmin] font-black text-amber-300 ${phase === 'vs' ? 'animate-vs-slam' : ''}`}>VS</p>
        {card('b')}
      </div>

      {phase === 'wait' && (
        <p className="text-[3.2vmin] font-black text-slate-200">
          {joinedA && joinedB ? '🔥 둘 다 들어왔어! 곧 시작해!' : '📷 두 선수가 자기 QR 로 들어오면 시작해!'}
        </p>
      )}

      {/* ⚡ 필살기 타이밍 — 아이 기기는 버튼, 큰 화면은 안내 */}
      {phase === 'chance' && me && (
        <button
          onPointerDown={press}
          className="relative w-[min(80vw,60vh)] h-[min(34vw,26vh)] rounded-[3vmin] bg-slate-900 border-4 border-amber-300 overflow-hidden"
        >
          <span className="absolute top-[6%] inset-x-0 text-center text-[3vmin] font-black text-amber-200">
            ⚡ {myMove?.emoji} {myMove?.name} — 고리가 겹칠 때 눌러!
          </span>
          {!myTier && (
            <>
              <span className="absolute left-1/2 top-[58%] w-24 h-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-amber-300 animate-timing-target" />
              <span
                key={startAt}
                className="absolute left-1/2 top-[58%] w-24 h-24 rounded-full border-4 border-white animate-timing-ring"
                style={{ animationDuration: `${CHANCE_LEN}ms`, animationDelay: `${Math.min(0, chanceAt.current - serverNow())}ms` }}
              />
            </>
          )}
          {myTier && (
            <span className="absolute inset-x-0 top-[45%] text-center text-[6vmin] font-black text-amber-300 animate-judge-pop">{tierText(myTier)}</span>
          )}
        </button>
      )}
      {phase === 'chance' && !me && (
        <p className="text-[5vmin] font-black text-amber-300 animate-pulse">⚡ 필살기 타이밍!! 두 선수 각자 눌러!</p>
      )}
      {phase === 'resolve' && !outcome && <p className="text-[3.6vmin] font-black text-slate-200">🤔 누가 이겼을까…</p>}

      {challenger && phase === 'wait' && (
        <div className="fixed inset-x-0 top-[10%] z-40 flex flex-col items-center pointer-events-none challenger-banner">
          <p className="text-[7.5vmin] font-black italic text-white tracking-tight drop-shadow-[0_0_18px_rgba(239,68,68,0.95)] text-center leading-none">
            HERE COMES A<br />NEW CHALLENGER!
          </p>
          <p className="mt-[1.4vmin] text-[4vmin] font-black text-amber-300 drop-shadow">⚡ 새로운 도전자 등장!! ⚡</p>
        </div>
      )}
      {/* 덮개: 시작 문구 · 카운트다운 */}
      {(phase === 'title' || phase === 'count') && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 pointer-events-none">
          {phase === 'title' ? (
            <p key="t" className="attract-gold text-[12vmin] font-black animate-vs-slam text-center leading-tight">
              G7BB 배틀!!
              <br />
              시작!!
            </p>
          ) : (
            <p key={count} className="text-[30vmin] font-black text-white animate-vs-slam drop-shadow-[0_0_30px_rgba(251,191,36,0.9)]">
              {count}
            </p>
          )}
        </div>
      )}

      {phase === 'result' && resultStep >= 3 && winnerIns && (
        <div className="flex flex-col items-center animate-pop">
          <p className="attract-gold text-[8vmin] font-black">🏆 {winnerIns.nickname} 승리!</p>
          {me && <p className="text-[4vmin] font-black">{outcome?.winner === me ? '🎉 이겼어!! 수액에 한 발 더 가까이!' : '😢 아쉽다! 그래도 멋진 배틀이었어!'}</p>}
        </div>
      )}
    </div>
  );
}

