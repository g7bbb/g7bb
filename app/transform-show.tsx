'use client';

import { useEffect, useState } from 'react';
import { SHOW_AI_MS, SHOW_BATTLE_MS, SHOW_FLASH_MS, SHOW_SKETCH_MS, SHOW_SPEED, ShowPair } from '@/lib/transform-show';
import { BattleScene } from '@/app/attract/attract-show';

// 🪄 변신 쇼 (lib/transform-show.ts) — 화면 가득.
// 짝마다: 왼쪽 스케치 → 가운데 🪄 → 오른쪽이 번쩍하며 AI 곤충 (한 화면에 나란히, 11/21 Jin "모니터가 커서")
// 짝을 다 보여준 뒤: 1번 vs 2번 곤충 배틀 (홍보 영상 배틀 장면 그대로).
// loop 면 끝없이, 아니면 한 바퀴 돌고 onDone.

type Step = 'sketch' | 'flash' | 'ai';
type Slot = { kind: 'pair'; i: number } | { kind: 'battle' };

export default function TransformShow({ pairs, loop = false, onDone }: { pairs: ShowPair[]; loop?: boolean; onDone?: () => void }) {
  const slots: Slot[] = [...pairs.map((_, i) => ({ kind: 'pair' as const, i })), ...(pairs.length >= 2 ? [{ kind: 'battle' as const }] : [])];
  const [n, setN] = useState(0);
  const [step, setStep] = useState<Step>('sketch');
  const slot = slots[n % Math.max(1, slots.length)];

  useEffect(() => {
    if (!slots.length) return;
    const next = () => {
      if (!loop && n + 1 >= slots.length) onDone?.();
      else {
        setN((v) => v + 1);
        setStep('sketch');
      }
    };
    if (slot.kind === 'battle') {
      const t = window.setTimeout(next, SHOW_BATTLE_MS);
      return () => window.clearTimeout(t);
    }
    const ts = [
      window.setTimeout(() => setStep('flash'), SHOW_SKETCH_MS),
      window.setTimeout(() => setStep('ai'), SHOW_SKETCH_MS + SHOW_FLASH_MS),
      window.setTimeout(next, SHOW_SKETCH_MS + SHOW_FLASH_MS + SHOW_AI_MS),
    ];
    return () => ts.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, slots.length]);

  if (!slots.length) return null;

  if (slot.kind === 'battle') {
    const card = (p: ShowPair, k: number) => ({ id: `show-${k}`, nickname: p.name ?? p.species, species: p.species, level: 3, src: p.ai });
    return (
      <div key={`b-${n}`} className="fixed inset-0 z-[90] bg-slate-950 flex flex-col items-center justify-center overflow-hidden" style={{ wordBreak: 'keep-all' }}>
        <div className="attract-rays" />
        <p className="relative z-10 mb-[4vmin] text-[6vmin] font-black text-amber-300 drop-shadow">⚔️ 바뀐 이미지로 배틀!!</p>
        <div className="relative z-10 w-full">
          <BattleScene a={card(pairs[0], 0)} b={card(pairs[1], 1)} speed={SHOW_SPEED} />
        </div>
        <p className="relative z-10 mt-[16vmin] text-[3vmin] font-bold text-slate-300">📷 종이에 그리고 QR 을 찍으면 너도 변신!</p>
      </div>
    );
  }

  const pair = pairs[slot.i];
  const ratio = pair.ratio ?? 1;
  // 가로 모니터: 나란히(한 칸 폭 43vw, 높이 60vh 안) / 세로 모니터: 위아래(폭 88vw, 높이 34vh 안)
  const box = { aspectRatio: String(ratio) } as React.CSSProperties;
  const boxCls = 'relative w-[min(43vw,calc(60vh*var(--r)))] portrait:w-[min(88vw,calc(28vh*var(--r)))]';

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950 flex flex-col items-center justify-center overflow-hidden" style={{ wordBreak: 'keep-all' }}>
      {step === 'ai' && <div className="bonus-rays" />}
      <p className="relative z-10 mb-[3vmin] text-[5.5vmin] font-black text-amber-300 drop-shadow text-center px-4">🖍️ 내가 그린 그림이 멋지게 변합니다!</p>

      <div className="relative z-10 flex flex-row portrait:flex-col items-center justify-center gap-[3vmin]" style={{ ['--r' as any]: ratio }}>
        {/* 왼쪽: 스케치 (흰 종이) */}
        <div className="flex flex-col items-center gap-[1.2vmin]">
          <div key={`s-${n}`} className={`${boxCls} rounded-[2vmin] bg-white p-[1.2vmin] shadow-2xl rotate-[-1.5deg] animate-pop`} style={box}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pair.sketch} alt="아이가 그린 그림" className="w-full h-full object-contain show-sketch-wobble" />
          </div>
          <p className="text-[3vmin] font-black text-slate-200">🖍️ 내가 그린 그림</p>
        </div>

        {/* 가운데 화살표 */}
        <p className={`text-[8vmin] leading-none transition-transform duration-500 portrait:rotate-90 ${step === 'sketch' ? 'opacity-40' : 'opacity-100 scale-125'}`}>🪄</p>

        {/* 오른쪽: AI 곤충 */}
        <div className="flex flex-col items-center gap-[1.2vmin]">
          <div className={`${boxCls}`} style={box}>
            <div className={`absolute inset-0 rounded-[2vmin] border-[0.5vmin] border-dashed border-slate-600 flex items-center justify-center transition-opacity duration-300 ${step === 'sketch' ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-[10vmin] text-slate-600 font-black">?</span>
            </div>
            <div
              key={`a-${n}`}
              className={`absolute inset-0 rounded-[2vmin] overflow-hidden transition-all duration-700 ${step === 'ai' ? 'opacity-100 scale-100 aura-gold' : 'opacity-0 scale-75'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pair.ai} alt="AI 가 만든 곤충" className="w-full h-full object-cover" />
            </div>
            {step === 'flash' && <div className="absolute -inset-[20vmin] show-flash rounded-full" />}
            {step === 'flash' &&
              ['6%,10%', '84%,6%', '90%,72%', '8%,82%', '48%,-8%', '46%,98%'].map((xy, k) => {
                const [x, y] = xy.split(',');
                return (
                  <span key={k} className="absolute bonus-sparkle text-[6vmin]" style={{ left: x, top: y }}>
                    ✦
                  </span>
                );
              })}
          </div>
          <p className={`text-[3vmin] font-black transition-colors ${step === 'ai' ? 'text-amber-300' : 'text-slate-500'}`}>✨ AI 곤충으로 변신!</p>
        </div>
      </div>

      <p className="relative z-10 mt-[4vmin] text-[3vmin] font-bold text-slate-300">📷 종이에 그리고 QR 을 찍으면 너도 변신!</p>
    </div>
  );
}
