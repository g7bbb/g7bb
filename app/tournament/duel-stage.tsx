'use client';

import { useEffect, useRef, useState } from 'react';
import { Insect } from '@/lib/types';
import {
  CHANCE_COUNT,
  CHANCE_LEN,
  CLASH_LEN,
  ROUND_LEN,
  T_COUNT,
  T_RESOLVE,
  T_ROUND0,
  T_VS,
  chanceAt,
  chanceSlots,
  serverNow,
} from '@/lib/tournament';
import { judgeTiming, movesFor, TIMING_TIERS } from '@/lib/special-moves';
import { levelTier, frameShines } from '@/lib/card';
import { ENVIRONMENTS } from '@/lib/environments';
import { attackSoundFor, audioContext, playPerfect, playSound, playTap, specialSoundFor, unlockAudio } from '@/lib/sfx';
import { setBgmTrack, startBgm } from '@/lib/bgm';

// ⚔️ 토너먼트 한 판 화면 — 큰 화면(screen)·아이 태블릿(me='a'|'b')이 같이 쓴다.
// 시간표(lib/tournament.ts)를 **서버 시각**으로 따라가서 두 기기가 같은 순간에 같은 장면을 본다.
//   대기(그림자 카드) → "G7BB 배틀!! 시작!!" → 3·2·1 → VS →
//   [치고받기 → ⚡ 필살기 타이밍(각자 자기 기기에서) → 판정] × 3번 → 결과 계산 → 마지막 일격 · 승리 · 왜 이겼을까
// 11/25 Jin: "기술 최소 3번, 기술칸은 같은 줄에 왼쪽·가운데·오른쪽" → 3칸 줄, 기회마다 칸이 섞여서 뜬다 (chanceSlots)

export interface DuelOutcome {
  winner: 'a' | 'b';
  tiersA: string[];
  tiersB: string[];
  left: number;
  reason: string;
}

type Phase = 'wait' | 'title' | 'count' | 'vs' | 'clash' | 'chance' | 'judge' | 'resolve' | 'result';
type Tiers = (string | null)[];

export function tierText(key: string | undefined | null): string {
  if (key === 'miss' || !key) return '😴 못 눌렀어';
  const t = TIMING_TIERS.find((x) => x.key === key);
  if (!t) return '';
  return t.key === 'ok' ? '😣 아깝다!' : `${t.emoji} ${t.label}`;
}

/** 필살기에 맞았을 때 깎이는 HP (보여주기용 — 승패는 duelVerdict 가 정한다) */
function specialDmg(key: string | null | undefined): number {
  if (!key || key === 'miss') return 0;
  return key === 'perfect' ? 14 : key === 'great' ? 11 : key === 'good' ? 9 : 6;
}
const CLASH_DMG = 9;
const SLOT_POS = ['왼쪽', '가운데', '오른쪽'];

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
  liveTiers,
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
  /** 필살기 버튼을 눌렀을 때 (아이 기기만) — 몇 번째 기회인지와 판정 key ('miss' = 못 누름) */
  onPress?: (round: number, tierKey: string) => void;
  /** 지금까지 알려진 두 선수의 판정 (신호에서 읽은 것). 아이 기기는 내 쪽을 이 화면이 직접 채운다 */
  liveTiers?: { a: Tiers; b: Tiers };
  label?: string;
}) {
  const [phase, setPhase] = useState<Phase>('wait');
  const [ri, setRi] = useState(0);
  const [clashStep, setClashStep] = useState(0);
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
  const [myTiers, setMyTiers] = useState<Tiers>([null, null, null]);
  const myTiersRef = useRef<Tiers>([null, null, null]);
  const [resultStep, setResultStep] = useState(0);
  const phaseRef = useRef<string>('wait');
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const slots = startAt ? chanceSlots(startAt) : [0, 1, 2];

  // 시간표 따라가기 (화면 한 장마다 확인, 바뀔 때만 다시 그림)
  useEffect(() => {
    myTiersRef.current = [null, null, null];
    setMyTiers([null, null, null]);
    if (!startAt) {
      phaseRef.current = 'wait';
      setPhase('wait');
      return;
    }
    let raf = 0;
    const tick = () => {
      const e = serverNow() - startAt;
      let p: Phase;
      let i = 0;
      let cs = 0;
      if (e < 0) p = 'wait';
      else if (e < T_COUNT) p = 'title';
      else if (e < T_VS) p = 'count';
      else if (e < T_ROUND0) p = 'vs';
      else {
        i = Math.floor((e - T_ROUND0) / ROUND_LEN);
        if (i >= CHANCE_COUNT) {
          p = 'resolve';
          i = CHANCE_COUNT - 1;
        } else {
          const within = e - T_ROUND0 - i * ROUND_LEN;
          p = within < CLASH_LEN ? 'clash' : within < CLASH_LEN + CHANCE_LEN ? 'chance' : 'judge';
          cs = within < 250 ? 0 : within < 850 ? 1 : within < 1450 ? 2 : 0;
        }
      }
      // 고리가 끝났는데 안 눌렀으면 "못 눌렀음" 으로 알린다 (아이 기기만) — 직원 화면이 기다리지 않게
      if (me && e >= T_ROUND0) {
        const done = p === 'resolve' ? CHANCE_COUNT : p === 'judge' ? i + 1 : i;
        for (let k = 0; k < done; k++) {
          if (!myTiersRef.current[k]) {
            myTiersRef.current = myTiersRef.current.map((x, j) => (j === k ? 'miss' : x));
            setMyTiers(myTiersRef.current);
            onPressRef.current?.(k, 'miss');
          }
        }
      }
      if (p === 'count') setCount(Math.max(1, 3 - Math.floor((e - T_COUNT) / 1000)));
      const key = `${p}:${i}:${cs}`;
      if (key !== phaseRef.current && phaseRef.current !== 'result') {
        phaseRef.current = key;
        setPhase(p);
        setRi(i);
        setClashStep(cs);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt]);

  // 결과가 오면 (그리고 계산 시간이 지났으면) 결과 연출
  const outKey = outcome ? `${outcome.winner}:${outcome.tiersA.join(',')}:${outcome.tiersB.join(',')}:${outcome.left}` : '';
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
      window.setTimeout(() => setResultStep(3), wait + 2300),
      window.setTimeout(() => setResultStep(4), wait + 3600),
    ];
    return () => ts.forEach((t) => window.clearTimeout(t));
    // ⚠️ outcome 객체는 1초마다 새로 만들어져서(아이 기기 폴링) 값으로 비교한다 — 객체로 비교하면 연출이 계속 처음으로 돌아간다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outKey, startAt]);


  function press() {
    if (phase !== 'chance' || !startAt || myTiersRef.current[ri] || !onPress) return;
    const tier = judgeTiming(serverNow() - (startAt + chanceAt(ri)));
    myTiersRef.current = myTiersRef.current.map((x, j) => (j === ri ? tier.key : x));
    setMyTiers(myTiersRef.current);
    if (tier.key === 'perfect') playPerfect();
    else playTap(tier.key === 'ok' ? 500 : 800);
    const mv = myMoves.length ? myMoves[ri % myMoves.length] : null;
    if (mv) playSound(specialSoundFor(mv), 250);
    onPress(ri, tier.key);
  }

  // 지금까지 알려진 판정 (결과가 오면 결과 것이 진짜)
  const tiersOf = (side: 'a' | 'b'): Tiers => {
    if (outcome) return side === 'a' ? outcome.tiersA : outcome.tiersB;
    if (me === side) return myTiers;
    return (side === 'a' ? liveTiers?.a : liveTiers?.b) ?? [null, null, null];
  };
  /** 판정이 끝난(고리가 지나간) 기회 수 */
  const roundsJudged = phase === 'judge' ? ri + 1 : phase === 'resolve' || phase === 'result' ? CHANCE_COUNT : phase === 'clash' || phase === 'chance' ? ri : 0;
  const clashesDone =
    phase === 'clash' ? ri + (clashStep === 0 ? 0 : 1) : phase === 'chance' || phase === 'judge' ? ri + 1 : phase === 'resolve' || phase === 'result' ? CHANCE_COUNT : 0;

  // 🔊 소리 (11/26 Jin "배틀할 때 소리가 안 나") — 큰 화면이 주인: 배틀 음악·치고받기·양쪽 필살기·승리.
  //    아이 태블릿은 겹치면 시끄러워서 **내 것만** (내 필살기 · 이겼다/졌다).
  const screen = !me;
  const speciesOf = (side: 'a' | 'b') => (side === 'a' ? a : b)?.species;
  useEffect(() => {
    if (!screen) return;
    if (phase === 'title') {
      startBgm();
      setBgmTrack('battle');
      playSound('next');
    }
    if (phase === 'clash' && clashStep > 0) {
      const attacker: 'a' | 'b' = clashStep === 1 ? (ri % 2 === 0 ? 'a' : 'b') : ri % 2 === 0 ? 'b' : 'a';
      playSound(attackSoundFor(speciesOf(attacker)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, clashStep, ri, screen]);
  // 큰 화면: 판정이 알려지는 대로 그 기술 소리 (두 선수 따로)
  const playedSp = useRef(new Set<string>());
  const tA = tiersOf('a')[ri];
  const tB = tiersOf('b')[ri];
  useEffect(() => {
    if (!screen || (phase !== 'judge' && phase !== 'chance')) return;
    (['a', 'b'] as const).forEach((side, k) => {
      const t = side === 'a' ? tA : tB;
      const key = `${startAt}:${ri}:${side}`;
      if (!t || t === 'miss' || playedSp.current.has(key)) return;
      playedSp.current.add(key);
      const ins = side === 'a' ? a : b;
      const moves = movesFor(ins?.species, ins?.level ?? 1);
      const mv = moves[ri % moves.length];
      if (mv) playSound(specialSoundFor(mv), k * 250);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tA, tB, phase, ri, screen, startAt]);
  // 결과: 마지막 치고받기 → 승리 (큰 화면) / 이겼다·졌다 (아이)
  useEffect(() => {
    if (phase !== 'result' || !outcome) return;
    if (screen && (resultStep === 1 || resultStep === 2)) playSound(attackSoundFor(speciesOf(resultStep === 1 ? 'a' : 'b')));
    if (resultStep === 3) {
      if (screen) {
        playSound(attackSoundFor(speciesOf(outcome.winner)));
        playSound('win', 450);
      } else if (me) playSound(outcome.winner === me ? 'win' : 'lose', 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, resultStep, screen]);
  // 🔊 소리 잠금 — 태블릿·노트북은 화면을 한 번 눌러야 소리가 난다 (QR 찍고 넘어오면 다시 잠김)
  const [soundLocked, setSoundLocked] = useState(false);
  useEffect(() => {
    const check = () => setSoundLocked(audioContext()?.state !== 'running');
    check();
    const id = window.setInterval(check, 1000);
    const unlock = () => {
      unlockAudio(['next', 'win', 'lose', 'spAttack', 'spDefense', 'hitJaw', 'hitHorn', 'hitWing', 'hitMantis']);
      if (screen) startBgm();
      window.setTimeout(check, 200);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [screen]);

  // HP — 치고받을 때마다 조금씩, 상대 필살기에 맞을 때마다 더 (결과 때 진 쪽 0, 이긴 쪽 남은 HP)
  const loser = outcome ? (outcome.winner === 'a' ? 'b' : 'a') : null;
  const hpBefore = (side: 'a' | 'b') => {
    const foe = tiersOf(side === 'a' ? 'b' : 'a');
    let hp = 100 - clashesDone * CLASH_DMG;
    for (let k = 0; k < roundsJudged; k++) hp -= specialDmg(foe[k]);
    return Math.max(8, hp);
  };
  const hp = (side: 'a' | 'b') => {
    const base = hpBefore(side);
    if (phase !== 'result' || !outcome) return base;
    if (resultStep < 3) return Math.max(6, base - (resultStep >= 1 && side === 'b' ? 5 : 0) - (resultStep >= 2 && side === 'a' ? 5 : 0));
    return side === loser ? 0 : Math.min(base, outcome.left);
  };
  const lunge = (side: 'a' | 'b') =>
    (phase === 'clash' && ((clashStep === 1 && side === (ri % 2 === 0 ? 'a' : 'b')) || (clashStep === 2 && side === (ri % 2 === 0 ? 'b' : 'a')))) ||
    (phase === 'result' && ((resultStep === 1 && side === 'a') || (resultStep === 2 && side === 'b') || (resultStep === 3 && side === outcome?.winner)));
  const hurt = (side: 'a' | 'b') =>
    (phase === 'clash' && ((clashStep === 1 && side === (ri % 2 === 0 ? 'b' : 'a')) || (clashStep === 2 && side === (ri % 2 === 0 ? 'a' : 'b')))) ||
    (phase === 'result' && ((resultStep === 1 && side === 'b') || (resultStep === 2 && side === 'a') || (resultStep === 3 && side === loser)));

  const cardW = me ? 'w-[min(34vw,36vh)]' : 'w-[min(22vw,28vh)]';
  const card = (side: 'a' | 'b') => {
    const ins = side === 'a' ? a : b;
    const src = side === 'a' ? srcA : srcB;
    const joined = side === 'a' ? joinedA : joinedB;
    const tier = levelTier(ins?.level ?? 1);
    const env = ENVIRONMENTS.find((e) => e.key === ins?.origin);
    const isMe = me === side;
    const shift = side === 'a' ? 'translateX(22%)' : 'translateX(-22%)';
    const judged = phase === 'judge' ? tiersOf(side)[ri] : null;
    const isWinner = phase === 'result' && resultStep >= 3 && outcome?.winner === side;
    return (
      <div
        className={`relative flex flex-col items-center gap-[0.8vmin] transition-transform duration-200 ${hurt(side) ? 'animate-shake' : ''}`}
        style={{ transform: lunge(side) ? `${shift} scale(1.08)` : undefined, zIndex: lunge(side) ? 5 : 1 }}
      >
        <p className={`text-[2.6vmin] font-black ${isMe ? 'text-amber-300' : 'text-slate-300'}`}>{isMe ? '⭐ 나' : side === 'a' ? '🔴 왼쪽' : '🔵 오른쪽'}</p>
        <div
          className={`relative ${cardW} aspect-[4/5] rounded-[2vmin] p-[0.7vmin] ${joined && frameShines(tier) ? 'holo-frame' : ''} ${
            phase === 'vs' || challenger === side ? 'animate-vs-slam' : ''
          } ${challenger === side ? 'challenger-flash' : ''} ${isWinner ? 'aura-gold' : ''}`}
          style={{ background: joined ? tier.frame : '#1e293b' }}
        >
          <div className="relative w-full h-full overflow-hidden rounded-[1.5vmin] bg-slate-900">
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${joined ? '' : 'duel-shadow'} ${
                  phase === 'result' && resultStep >= 3 && loser === side ? 'grayscale opacity-60' : ''
                }`}
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
                {env && (
                  <span className="absolute right-[4%] top-[3%] rounded-md bg-black/60 px-1.5 py-0.5 text-[2vmin] font-black">
                    {env.emoji} {env.label}
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-[5%] pb-[3%] pt-[18%]">
                  <p className="truncate text-[3vmin] font-black leading-tight">{ins?.nickname}</p>
                  <p className="truncate text-[1.9vmin] font-bold text-slate-300">{ins?.species}</p>
                </div>
              </>
            )}
            {hurt(side) && <span className="absolute inset-0 flex items-center justify-center text-[12vmin] animate-impact-pop">💥</span>}
            {judged && (
              <div className="absolute inset-0 flex items-center justify-center px-1">
                <span key={`${ri}:${judged}`} className="rounded-xl bg-black/60 px-2 py-1 text-center text-[3.6vmin] font-black text-amber-300 animate-pop">
                  {tierText(judged)}
                </span>
              </div>
            )}
          </div>
        </div>
        {joined && phase === 'wait' && <p className="text-[2.4vmin] font-black text-emerald-300 animate-pop">✅ 접속 완료!</p>}
        {/* HP */}
        <div className={`${cardW} relative h-[2.4vmin] rounded-full bg-slate-800 overflow-hidden border border-black/50`}>
          <div className={`h-full transition-all duration-500 ${side === 'a' ? 'bg-rose-500' : 'bg-sky-500'}`} style={{ width: `${hp(side)}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-[1.7vmin] font-black text-white drop-shadow">HP {hp(side)}%</span>
        </div>
      </div>
    );
  };

  const winnerIns = outcome ? (outcome.winner === 'a' ? a : b) : null;
  const myIns = me ? (me === 'a' ? a : b) : null;
  const myMoves = myIns ? movesFor(myIns.species, myIns.level ?? 1) : [];
  const showRow = phase === 'clash' || phase === 'chance' || phase === 'judge' || phase === 'resolve';

  // ⚡ 기술칸 3개 (같은 줄 · 왼쪽 가운데 오른쪽) — i 번째 기회는 slots[i] 칸에 뜬다
  const slotBox = (col: number) => {
    const i = slots.indexOf(col);
    const active = phase === 'chance' && ri === i;
    const done = i < roundsJudged;
    const move = myMoves.length ? myMoves[i % myMoves.length] : null;
    const base = 'relative flex-1 min-w-0 h-[min(26vw,22vh)] rounded-[2.4vmin] border-4 overflow-hidden';
    if (active && me) {
      return (
        <button key={col} onPointerDown={press} className={`${base} bg-slate-900 border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.6)]`}>
          <span className="absolute top-[5%] inset-x-0 px-1 text-center text-[2.3vmin] font-black text-amber-200 leading-tight">
            ⚡ {i + 1}번째 · {move?.emoji} {move?.name}
          </span>
          {!myTiers[i] ? (
            <>
              <span className="absolute left-1/2 top-[60%] w-20 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-amber-300 animate-timing-target" />
              <span
                key={`${startAt}:${i}`}
                className="absolute left-1/2 top-[60%] w-20 h-20 rounded-full border-4 border-white animate-timing-ring"
                style={{ animationDuration: `${CHANCE_LEN}ms`, animationDelay: `${Math.min(0, (startAt ?? 0) + chanceAt(i) - serverNow())}ms` }}
              />
            </>
          ) : (
            <span className="absolute inset-x-0 top-[30%] bottom-0 flex items-center justify-center px-1 text-center">
              <span className="text-[3.6vmin] font-black text-amber-300 animate-pop">{tierText(myTiers[i])}</span>
            </span>
          )}
        </button>
      );
    }
    if (active) {
      return (
        <div key={col} className={`${base} bg-amber-400/15 border-amber-300 flex flex-col items-center justify-center gap-[0.6vmin] animate-pulse`}>
          <p className="text-[3.2vmin] font-black text-amber-300">⚡ {i + 1}번째 필살기!</p>
          <p className="text-[2.2vmin] font-bold text-slate-200">두 선수 각자 눌러!</p>
        </div>
      );
    }
    return (
      <div key={col} className={`${base} ${done ? 'bg-slate-900 border-slate-600' : 'bg-slate-900/40 border-dashed border-slate-700'} flex flex-col items-center justify-center gap-[0.4vmin] px-1 text-center`}>
        {done ? (
          me ? (
            <p className="text-[3vmin] font-black text-amber-200">{tierText(tiersOf(me)[i])}</p>
          ) : (
            <>
              <p className="text-[2.2vmin] font-black text-rose-300">🔴 {tierText(tiersOf('a')[i])}</p>
              <p className="text-[2.2vmin] font-black text-sky-300">🔵 {tierText(tiersOf('b')[i])}</p>
            </>
          )
        ) : (
          <p className="text-[2.6vmin] font-black text-slate-600">⚡ {i + 1}</p>
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full flex flex-col items-center gap-[1.6vmin]" style={{ wordBreak: 'keep-all' }}>
      {label && <p className="text-[2.8vmin] font-black text-amber-200">{label}</p>}
      <div className="relative flex items-start justify-center gap-[3vw]">
        {card('a')}
        <p className={`self-center text-[8vmin] font-black text-amber-300 ${phase === 'vs' ? 'animate-vs-slam' : ''}`}>VS</p>
        {card('b')}
      </div>

      {phase === 'wait' && (
        <p className="text-[3.2vmin] font-black text-slate-200">
          {joinedA && joinedB ? '🔥 둘 다 들어왔어! 곧 시작해!' : '📷 두 선수가 자기 QR 로 들어오면 시작해!'}
        </p>
      )}
      {phase === 'vs' && <p className="text-[3.4vmin] font-black text-amber-200 animate-pop">⚡ 필살기 기회가 3번! 칸이 뜨면 고리가 겹칠 때 눌러!</p>}

      {/* ⚡ 기술칸 줄 */}
      {showRow && (
        <div className={`flex gap-[2vmin] ${me ? 'w-[min(94vw,120vh)]' : 'w-[min(80vw,110vh)]'}`}>
          {[0, 1, 2].map((col) => slotBox(col))}
        </div>
      )}
      {phase === 'clash' && <p className="text-[2.8vmin] font-black text-slate-200">⚔️ 치고받는 중… 다음 칸은 {SLOT_POS[slots[ri]]}!</p>}
      {phase === 'resolve' && !outcome && <p className="text-[3.6vmin] font-black text-slate-200">🤔 누가 이겼을까…</p>}

      {soundLocked && (
        <p className="fixed bottom-[2vmin] left-1/2 -translate-x-1/2 z-50 rounded-full bg-amber-400 px-[3vmin] py-[1vmin] text-[2.6vmin] font-black text-slate-900 animate-pulse whitespace-nowrap pointer-events-none">
          🔊 화면을 한 번 눌러줘! (소리 켜기)
        </p>
      )}
      {challenger && phase === 'wait' && (
        <div className="fixed inset-x-0 top-[10%] z-40 mx-auto w-fit flex flex-col items-center pointer-events-none challenger-banner rounded-3xl bg-black/75 px-[4vmin] py-[2vmin]">
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

      {phase === 'result' && resultStep >= 3 && winnerIns && outcome && (
        <div className="flex flex-col items-center gap-[1vmin] animate-pop text-center px-4">
          <p className="attract-gold text-[7vmin] font-black leading-tight">🏆 {winnerIns.nickname} 승리!</p>
          <p className="text-[3vmin] font-black text-emerald-300">❤️ HP {Math.min(hpBefore(outcome.winner), outcome.left)}% 남기고 이겼어!</p>
          {me && <p className="text-[3.6vmin] font-black">{outcome.winner === me ? '🎉 이겼어!! 수액에 한 발 더 가까이!' : '😢 아쉽다! 그래도 멋진 배틀이었어!'}</p>}
          {resultStep >= 4 && (
            <div className="mt-[0.6vmin] rounded-2xl border-2 border-amber-300/70 bg-amber-400/10 px-[3vmin] py-[1.4vmin] animate-pop max-w-[90vw]">
              <p className="text-[2.4vmin] font-black text-amber-200">🧐 왜 이겼을까?</p>
              <p className="text-[3.2vmin] font-black text-white">{outcome.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
