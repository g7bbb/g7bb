'use client';

import { useEffect, useRef, useState } from 'react';

// 🕸️ 밸런스 도형 (2026-10-02 Jin: "1~5점 메길 때 클릭할 때마다 모양이 달라지는 밸런스 도형").
//
// 오각형 꼭짓점 5개 = HP · 공격 · 수비 · 지능 · 회피.
// ⚠️ 그냥 능력치 값으로 그리면 1점 바꿔도 4% 남짓이라 **모양이 거의 안 변한다**(실측: 전부 1점 ↔ 5점도 ±17%).
// 그래서 **"보통 곤충"(전부 3점) 대비 얼마나 센지**로 그린다 — 점선이 보통, 바깥이면 더 셈, 안쪽이면 약함.
// 회피력은 0 ~ 2.4배까지 크게 흔들려서 따로 덜 키운다 (안 그러면 회피만 튀어나간다).

type Key = 'hp' | 'atk' | 'def' | 'int' | 'eva';
export type RadarStats = Record<Key, number>;

const AXES: { key: Key; label: string; emoji: string }[] = [
  { key: 'atk', label: '공격', emoji: '⚔️' },
  { key: 'def', label: '수비', emoji: '🛡️' },
  { key: 'eva', label: '회피', emoji: '💨' },
  { key: 'int', label: '지능', emoji: '🧠' },
  { key: 'hp', label: 'HP', emoji: '💚' },
];

const BASE_R = 0.55; // 보통(점선)의 반지름
const GAIN: Record<Key, number> = { hp: 2.4, atk: 2.4, def: 2.4, int: 2.4, eva: 0.5 };

function radius(key: Key, value: number, base: number): number {
  const ratio = Math.max(0.05, value / Math.max(1, base));
  return Math.max(0.1, Math.min(1, BASE_R + Math.log(ratio) * GAIN[key]));
}

const W = 320;
const H = 300;
const CX = W / 2;
const CY = 158;
const R = 98;

function point(i: number, r: number): [number, number] {
  const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
  return [CX + Math.cos(a) * R * r, CY + Math.sin(a) * R * r];
}
const poly = (rs: number[]) => rs.map((r, i) => point(i, r).map((n) => n.toFixed(1)).join(',')).join(' ');

export default function StatRadar({ stats, base }: { stats: RadarStats; base: RadarStats }) {
  const target = AXES.map((a) => radius(a.key, stats[a.key], base[a.key]));
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  // 눌렀을 때 오르고 내린 칸에 ▲▼ 를 잠깐 띄운다
  const prev = useRef(stats);
  const [delta, setDelta] = useState<Partial<Record<Key, number>>>({});

  const key = target.map((n) => n.toFixed(3)).join('|');
  useEffect(() => {
    // 부드럽게 바뀌기 (0.3초)
    const from = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 300);
      const e = 1 - (1 - t) * (1 - t);
      const next = from.map((f, i) => f + (target[i] - f) * e);
      shownRef.current = next;
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const d: Partial<Record<Key, number>> = {};
    AXES.forEach(({ key: k }) => {
      const diff = Math.round(stats[k]) - Math.round(prev.current[k]);
      if (diff) d[k] = diff;
    });
    prev.current = stats;
    if (!Object.keys(d).length) return;
    setDelta(d);
    const id = window.setTimeout(() => setDelta({}), 1400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.hp, stats.atk, stats.def, stats.int, stats.eva]);

  return (
    <div className="bg-slate-900/95 backdrop-blur rounded-2xl border border-slate-700 px-2 pt-1 pb-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[15rem] mx-auto block" role="img" aria-label="능력치 밸런스 도형">
        <defs>
          <filter id="radar-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* 바탕: 회색 띠 4겹 */}
        {[1, 0.75, 0.5, 0.25].map((r, i) => (
          <polygon key={r} points={poly(AXES.map(() => r))} fill={i % 2 ? '#334155' : '#1e293b'} />
        ))}
        {AXES.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#475569" strokeWidth="1" />;
        })}
        {/* 보통 곤충 (전부 3점) */}
        <polygon points={poly(AXES.map(() => BASE_R))} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />
        {/* 내 곤충 */}
        <polygon points={poly(shown)} fill="rgba(52,211,153,0.28)" stroke="#34d399" strokeWidth="3" strokeLinejoin="round" filter="url(#radar-glow)" />
        {shown.map((r, i) => {
          const [x, y] = point(i, r);
          return <circle key={i} cx={x} cy={y} r="4" fill="#a7f3d0" />;
        })}
        {/* 이름 + 값 */}
        {AXES.map((a, i) => {
          const [x, y] = point(i, 1.32);
          const d = delta[a.key];
          return (
            <g key={a.key}>
              <text x={x} y={y - 4} textAnchor="middle" fontSize="15" fontWeight="800" fill="#e2e8f0">
                {a.emoji} {a.label}
              </text>
              <text x={x} y={y + 14} textAnchor="middle" fontSize="15" fontWeight="900" fill={d ? (d > 0 ? '#4ade80' : '#f87171') : '#fcd34d'}>
                {Math.round(stats[a.key])}
                {d ? ` ${d > 0 ? '▲' : '▼'}${Math.abs(d)}` : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-center text-xs text-slate-400 -mt-1">
        점선 = 보통 곤충 (전부 3점) · 바깥으로 갈수록 더 세!
      </p>
    </div>
  );
}
