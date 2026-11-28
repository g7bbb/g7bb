'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimingTier } from '@/lib/special-moves';
import { playTap } from '@/lib/sfx';
import {
  RHYTHM_FALL_MS,
  RHYTHM_GOOD_MS,
  RHYTHM_LANES,
  RHYTHM_NOTES,
  SAP_MIN_GAP_MS,
  SAP_MS,
  SAP_READY_MS,
  SAP_TAPS,
  makeRhythmChart,
  rhythmEndMs,
  rhythmHitScore,
  rhythmTier,
  sapTier,
} from '@/lib/chance-games';

// 🎮 필살기 미니게임 ②③ (2026-11-28 Jin, 부산). 규칙·숫자는 lib/chance-games.ts.
// ① 타이밍 고리는 app/battle/page.tsx 에 원래 있던 그대로.
//
// 그림은 CSS 가 그리고(음표 떨어지기·시간 막대) JS 는 "언제 눌렀나" 만 본다 — 고리와 같은 이유(폰에서 버벅이면 게임이 안 됨).
// 시간은 화면에 실제로 그려진 뒤(requestAnimationFrame 두 번)부터 잰다 — 이것도 고리와 같은 이유.

function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

// ── 🎵 리듬 게이지 ─────────────────────────────────────────
/** 판정선 높이 (위에서 %). globals.css 의 `rhythm-fall`(-10% → 105%, 1.25배 시간) 과 짝 — 0.8 지점이 82%. */
const RHYTHM_LINE_PCT = 82;
const LANE_COLORS = ['from-sky-300 to-sky-500', 'from-amber-200 to-amber-400', 'from-pink-300 to-pink-500'];

export function RhythmGame({ emoji, onDone }: { emoji: string; onDone: (tier: TimingTier | null) => void }) {
  const chart = useMemo(() => makeRhythmChart(), []);
  const start = useRef(0);
  const ready = useRef(false);
  const done = useRef(false);
  const anyPress = useRef(false);
  const scores = useRef<number[]>(chart.map(() => -1));
  const [hits, setHits] = useState<Record<number, number>>({});
  const [gauge, setGauge] = useState(0);
  const [flash, setFlash] = useState<{ lane: number; id: number } | null>(null);
  const [pops, setPops] = useState<{ id: number; lane: number; score: number }[]>([]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  function finish() {
    if (done.current) return;
    done.current = true;
    const total = scores.current.reduce((s, v) => s + Math.max(0, v), 0) / RHYTHM_NOTES;
    // 한 번도 안 눌렀으면 필살기를 안 쓴 것 (고리를 안 누른 것과 같게). 눌렀으면 다 놓쳐도 필살기는 나간다.
    onDoneRef.current(anyPress.current ? rhythmTier(total) : null);
  }

  useEffect(() => {
    let timer = 0;
    void afterPaint().then(() => {
      start.current = performance.now();
      ready.current = true;
      timer = window.setTimeout(finish, rhythmEndMs(chart));
    });
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function press(lane: number) {
    if (!ready.current || done.current) return;
    const t = performance.now() - start.current;
    anyPress.current = true;
    setFlash({ lane, id: t });
    // 이 줄에서 아직 안 친 음표 중 판정선에 제일 가까운 것
    let best = -1;
    let bestOff = Infinity;
    chart.forEach((n, i) => {
      if (n.lane !== lane || scores.current[i] >= 0) return;
      const off = Math.abs(t - n.at);
      if (off <= RHYTHM_GOOD_MS && off < bestOff) {
        best = i;
        bestOff = off;
      }
    });
    if (best < 0) return; // 엉뚱한 때 눌러도 벌점 없음 (아이용)
    const score = rhythmHitScore(bestOff);
    scores.current[best] = score;
    setHits((h) => ({ ...h, [best]: score }));
    setGauge(scores.current.reduce((s, v) => s + Math.max(0, v), 0) / RHYTHM_NOTES);
    setPops((p) => [...p.slice(-4), { id: t, lane, score }]);
    playTap(score === 1 ? 1300 : 850);
    if (scores.current.every((v) => v >= 0)) window.setTimeout(finish, 350);
  }

  return (
    <div className="w-full select-none">
      <div className="relative h-64 rounded-2xl overflow-hidden bg-slate-900/90 border border-white/10 grid grid-cols-3">
        {Array.from({ length: RHYTHM_LANES }, (_, lane) => (
          <button
            key={lane}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              press(lane);
            }}
            className={`relative h-full touch-manipulation ${lane > 0 ? 'border-l border-white/10' : ''} ${
              flash?.lane === lane ? 'bg-white/10' : ''
            }`}
            aria-label={`${lane + 1}번 줄`}
          >
            {/* 판정선 위의 과녁 */}
            <span
              className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[72%] h-8 rounded-full border-2 border-white/70 bg-white/5"
              style={{ top: `${RHYTHM_LINE_PCT}%` }}
            />
            {pops
              .filter((p) => p.lane === lane)
              .map((p) => (
                <span
                  key={p.id}
                  className={`absolute left-1/2 -translate-x-1/2 animate-pop text-lg font-black whitespace-nowrap ${
                    p.score === 1 ? 'text-amber-300' : 'text-sky-300'
                  }`}
                  style={{ top: `${RHYTHM_LINE_PCT - 22}%` }}
                >
                  {p.score === 1 ? '✨딱!' : '👍'}
                </span>
              ))}
          </button>
        ))}
        {/* 판정선 */}
        <span
          className="pointer-events-none absolute inset-x-0 h-1 bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.9)]"
          style={{ top: `${RHYTHM_LINE_PCT}%` }}
        />
        {/* 내려오는 음표 — CSS 가 그린다. 시작부터 n.at 에 판정선에 닿는다. */}
        {chart.map((n, i) => (
          <span
            key={i}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-[22%] h-8 rounded-full bg-gradient-to-b ${LANE_COLORS[n.lane]} shadow-lg flex items-center justify-center text-lg rhythm-note ${
              hits[i] !== undefined ? 'opacity-0 transition-opacity duration-150' : ''
            }`}
            style={{
              left: `${(n.lane + 0.5) * (100 / RHYTHM_LANES)}%`,
              animationDuration: `${RHYTHM_FALL_MS * 1.25}ms`,
              animationDelay: `${n.at - RHYTHM_FALL_MS}ms`,
            }}
          >
            {emoji}
          </span>
        ))}
      </div>
      {/* 게이지 — 가득 차면 필살기가 세진다 */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs font-black text-amber-300 shrink-0">⚡ 게이지</span>
        <div className="relative flex-1 h-3 rounded-full bg-slate-700 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-300 to-rose-400 transition-all duration-200" style={{ width: `${Math.round(gauge * 100)}%` }} />
          {[30, 58, 82].map((m) => (
            <span key={m} className="absolute top-0 bottom-0 w-px bg-white/60" style={{ left: `${m}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 🍯 수액 연타 ───────────────────────────────────────────
export function SapGame({ attack, onDone }: { attack: boolean; onDone: (tier: TimingTier | null) => void }) {
  const [phase, setPhase] = useState<'ready' | 'go' | 'end'>('ready');
  const [taps, setTaps] = useState(0);
  const tapsRef = useRef(0);
  const last = useRef(0);
  const goRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t1 = window.setTimeout(() => {
      void afterPaint().then(() => {
        goRef.current = true;
        setPhase('go');
      });
    }, SAP_READY_MS);
    const t2 = window.setTimeout(() => {
      goRef.current = false;
      setPhase('end');
      onDoneRef.current(tapsRef.current > 0 ? sapTier(tapsRef.current) : null); // 한 번도 안 누르면 필살기를 안 쓴 것
    }, SAP_READY_MS + SAP_MS + 60);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  function press() {
    if (!goRef.current) return;
    const now = performance.now();
    if (now - last.current < SAP_MIN_GAP_MS) return;
    last.current = now;
    tapsRef.current += 1;
    setTaps(tapsRef.current);
    playTap(500 + Math.min(tapsRef.current, 30) * 25);
  }

  const power = Math.min(1, taps / SAP_TAPS.perfect);
  // 보여주기용 HP: 공격이면 상대 HP 가 깎이고, 수비면 내 HP 가 찬다 (진짜 승패는 등급으로 계산)
  const hp = attack ? Math.round(100 - power * 60) : Math.round(40 + power * 60);
  const marks = [SAP_TAPS.good, SAP_TAPS.great, SAP_TAPS.perfect].map((v) => Math.round((v / SAP_TAPS.perfect) * 100));

  return (
    <div className="w-full select-none">
      {/* 시간 막대 */}
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        {phase !== 'ready' && <div className="h-full bg-emerald-400 sap-timer" style={{ animationDuration: `${SAP_MS}ms` }} />}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`text-xs font-black shrink-0 ${attack ? 'text-rose-300' : 'text-emerald-300'}`}>
          {attack ? '💥 상대 HP' : '💚 내 HP'}
        </span>
        <div className="flex-1 h-3 rounded-full bg-slate-700 overflow-hidden">
          <div className={`h-full transition-all duration-150 ${attack ? 'bg-rose-500' : 'bg-emerald-400'}`} style={{ width: `${hp}%` }} />
        </div>
      </div>

      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          press();
        }}
        className="relative mx-auto mt-3 flex h-48 w-48 items-center justify-center rounded-full touch-manipulation"
        aria-label="수액 연타"
      >
        <span
          key={taps}
          className={`absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fde68a,#f59e0b_55%,#92400e)] shadow-[0_0_40px_rgba(245,158,11,0.7)] ${
            taps > 0 ? 'sap-bump' : 'animate-pulse'
          }`}
        />
        <span className="relative text-7xl drop-shadow-lg">🍯</span>
        {phase === 'go' && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-0.5 text-2xl font-black text-white tabular-nums">
            {taps}
          </span>
        )}
      </button>

      <p className="mt-2 text-center text-base font-black">
        {phase === 'ready' ? (
          <span className="text-slate-200 animate-pulse">준비… 🍯</span>
        ) : phase === 'go' ? (
          <span className="text-amber-300">마구마구 눌러!!</span>
        ) : (
          <span className="text-slate-300">끝!</span>
        )}
      </p>
      {/* 파워 막대 — 굿·퍼펙트 눈금 */}
      <div className="relative mt-1 h-3 rounded-full bg-slate-700 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-300 to-orange-500 transition-all duration-150" style={{ width: `${power * 100}%` }} />
        {marks.map((m) => (
          <span key={m} className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: `${Math.min(99.5, m)}%` }} />
        ))}
      </div>
      <p className="mt-0.5 flex justify-between text-[0.625rem] text-slate-400">
        <span>천천히</span>
        <span>👍 굿</span>
        <span>✨ 퍼펙트</span>
      </p>
    </div>
  );
}
