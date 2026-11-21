'use client';

import { useEffect, useState } from 'react';
import { SHOW_AI_MS, SHOW_FLASH_MS, SHOW_SKETCH_MS, ShowPair } from '@/lib/transform-show';

// 🪄 스케치 → 번쩍 → AI 곤충 (lib/transform-show.ts). 화면 가득 덮는다.
// count 마리를 보여주고 onDone (loop 이면 끝없이 돈다). start 번째 짝부터.

type Step = 'sketch' | 'flash' | 'ai';

export default function TransformShow({
  pairs,
  start = 0,
  count,
  loop = false,
  onDone,
}: {
  pairs: ShowPair[];
  start?: number;
  count?: number;
  loop?: boolean;
  onDone?: () => void;
}) {
  const [n, setN] = useState(0);
  const [step, setStep] = useState<Step>('sketch');
  const total = count ?? pairs.length;

  useEffect(() => {
    if (!pairs.length) return;
    const ts = [
      window.setTimeout(() => setStep('flash'), SHOW_SKETCH_MS),
      window.setTimeout(() => setStep('ai'), SHOW_SKETCH_MS + SHOW_FLASH_MS),
      window.setTimeout(() => {
        if (!loop && n + 1 >= total) onDone?.();
        else {
          setN((v) => v + 1);
          setStep('sketch');
        }
      }, SHOW_SKETCH_MS + SHOW_FLASH_MS + SHOW_AI_MS),
    ];
    return () => ts.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, pairs.length]);

  if (!pairs.length) return null;
  const pair = pairs[(start + n) % pairs.length];

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950 flex flex-col items-center justify-center overflow-hidden" style={{ wordBreak: 'keep-all' }}>
      {step === 'ai' && <div className="bonus-rays" />}
      <p className="relative z-10 mb-[2vmin] text-[5vmin] font-black text-amber-300 drop-shadow">
        {step === 'sketch' ? '🖍️ 친구가 그린 그림이' : step === 'flash' ? '🪄 AI 변신!!' : '✨ 진짜 곤충이 됐어!'}
      </p>

      <div className="relative z-10 w-[min(70vmin,92vw)] aspect-square">
        {/* 스케치 — 흰 종이 느낌 */}
        <div
          key={`s-${n}`}
          className={`absolute inset-0 rounded-[3vmin] bg-white p-[2vmin] shadow-2xl transition-all duration-700 ${
            step === 'sketch' ? 'opacity-100 scale-100 rotate-[-2deg]' : 'opacity-0 scale-90 rotate-[4deg]'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pair.sketch} alt="아이가 그린 그림" className="w-full h-full object-contain show-sketch-wobble" />
        </div>
        {/* AI 곤충 */}
        <div
          key={`a-${n}`}
          className={`absolute inset-0 rounded-[3vmin] overflow-hidden transition-all duration-700 ${
            step === 'ai' ? 'opacity-100 scale-100 aura-gold' : 'opacity-0 scale-75'
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pair.ai} alt="AI 가 만든 곤충" className="w-full h-full object-cover" />
        </div>
        {/* 번쩍 */}
        {step === 'flash' && <div className="absolute -inset-[30vmin] show-flash rounded-full" />}
        {step === 'flash' &&
          ['8%,12%', '78%,8%', '88%,70%', '10%,80%', '50%,-6%', '48%,96%'].map((xy, k) => {
            const [x, y] = xy.split(',');
            return (
              <span key={k} className="absolute bonus-sparkle text-[7vmin]" style={{ left: x, top: y }}>
                ✦
              </span>
            );
          })}
      </div>

      <p className={`relative z-10 mt-[2.5vmin] text-[4.5vmin] font-black transition-opacity duration-500 ${step === 'ai' && pair.name ? 'opacity-100' : 'opacity-0'}`}>
        🐞 {pair.name ?? ''}
      </p>
      <p className="relative z-10 mt-[1vmin] text-[2.8vmin] font-bold text-slate-300">📷 종이에 그리고 QR 을 찍으면 너도 변신!</p>
    </div>
  );
}
