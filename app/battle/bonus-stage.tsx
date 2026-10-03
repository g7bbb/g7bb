'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BonusKey, bonusInfo } from '@/lib/bonus-stage';
import { playSound, playPerfect } from '@/lib/sfx';

// 🎁 보너스 스테이지 화면 (lib/bonus-stage.ts). 보물상자 3개 중 하나를 누르면 열리면서 상품이 나온다.
// 그림 파일 없이 SVG·CSS 로 그린다 (Claude 컨테이너에서 AI 그림을 못 만들어서). 그림을 받으면 Chest 만 바꾸면 된다.

const SPARKLES = [
  { left: '8%', top: '14%', d: '0s', s: 1.2 },
  { left: '86%', top: '10%', d: '0.4s', s: 1 },
  { left: '14%', top: '62%', d: '0.9s', s: 0.8 },
  { left: '90%', top: '55%', d: '0.2s', s: 1.3 },
  { left: '50%', top: '4%', d: '1.2s', s: 0.9 },
  { left: '30%', top: '88%', d: '0.6s', s: 1 },
  { left: '72%', top: '84%', d: '1.5s', s: 1.1 },
  { left: '4%', top: '36%', d: '1.8s', s: 0.7 },
];

function Chest({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 100 92" className="w-full h-auto drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]" aria-hidden>
      <defs>
        <linearGradient id="bs-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b45309" />
          <stop offset="1" stopColor="#5b2a07" />
        </linearGradient>
        <linearGradient id="bs-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="0.45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id="bs-glow" cx="0.5" cy="1" r="0.8">
          <stop offset="0" stopColor="#fffbeb" />
          <stop offset="0.5" stopColor="#fde047" stopOpacity="0.8" />
          <stop offset="1" stopColor="#fde047" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 열리면 안에서 빛이 솟는다 */}
      {open && <ellipse cx="50" cy="40" rx="46" ry="40" fill="url(#bs-glow)" className="bonus-chest-light" />}
      {/* 몸통 */}
      <rect x="10" y="44" width="80" height="42" rx="5" fill="url(#bs-wood)" stroke="#3b1a04" strokeWidth="2" />
      <rect x="10" y="44" width="80" height="6" fill="url(#bs-gold)" />
      <rect x="10" y="80" width="80" height="6" rx="2" fill="url(#bs-gold)" />
      <rect x="20" y="44" width="8" height="42" fill="url(#bs-gold)" />
      <rect x="72" y="44" width="8" height="42" fill="url(#bs-gold)" />
      {/* 뚜껑 */}
      <g className={open ? 'bonus-lid bonus-lid-open' : 'bonus-lid'}>
        <path d="M10 46 L10 30 Q10 10 50 10 Q90 10 90 30 L90 46 Z" fill="url(#bs-wood)" stroke="#3b1a04" strokeWidth="2" />
        <path d="M20 46 L20 15 Q24 12 28 12 L28 46 Z" fill="url(#bs-gold)" />
        <path d="M72 12 Q76 12 80 15 L80 46 L72 46 Z" fill="url(#bs-gold)" />
        <rect x="8" y="40" width="84" height="7" rx="2" fill="url(#bs-gold)" />
        {/* 자물쇠 */}
        <rect x="42" y="36" width="16" height="18" rx="3" fill="url(#bs-gold)" stroke="#92400e" strokeWidth="1.5" />
        <circle cx="50" cy="43" r="2.6" fill="#451a03" />
        <rect x="49" y="44" width="2" height="6" fill="#451a03" />
      </g>
    </svg>
  );
}

export default function BonusStage({
  onClaim,
  onClose,
}: {
  onClaim: () => Promise<{ key: BonusKey; ok: boolean }>;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<{ key: BonusKey; ok: boolean } | null>(null);

  async function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    playSound('next');
    // 상자가 덜컹거리는 동안 저장 — 둘 다 끝나야 열린다
    const [got] = await Promise.all([onClaim(), new Promise((r) => setTimeout(r, 1300))]);
    setResult(got);
    try {
      playPerfect();
    } catch {
      // 소리는 없어도 된다
    }
    playSound('levelUp', 250);
  }

  const info = result ? bonusInfo(result.key) : null;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 bonus-backdrop overflow-hidden">
      {/* 뒤에서 도는 금빛 햇살 */}
      <div className="bonus-rays" aria-hidden />
      {SPARKLES.map((sp, i) => (
        <span
          key={i}
          aria-hidden
          className="bonus-sparkle absolute text-amber-200"
          style={{ left: sp.left, top: sp.top, animationDelay: sp.d, fontSize: `${sp.s * 1.6}rem` }}
        >
          ✦
        </span>
      ))}

      <div className="relative w-full max-w-sm flex flex-col items-center gap-3 text-center" style={{ wordBreak: 'keep-all' }}>
        <p className="text-[2.4rem] leading-tight font-black">
          <span className="mr-1">🎁</span>
          <span className="bonus-title">보너스 스테이지!</span>
        </p>

        {!info ? (
          <>
            <p className="text-lg font-black text-amber-100">
              {picked === null ? '보물상자 3개 중 하나를 골라봐!' : '두근두근… 열린다!'}
            </p>
            <p className="text-sm text-amber-200/80">레벨 업 · HP · 수비력 중 하나가 들어 있어</p>
            <div className="grid grid-cols-3 gap-3 w-full mt-2">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(i)}
                  disabled={picked !== null}
                  className={`relative rounded-2xl p-1.5 transition-opacity ${
                    picked === null ? 'bonus-chest-bob' : picked === i ? 'bonus-chest-shake' : 'opacity-25'
                  }`}
                  style={{ animationDelay: picked === null ? `${i * 0.25}s` : undefined }}
                  aria-label={`보물상자 ${i + 1}`}
                >
                  <span className="absolute inset-2 rounded-full bg-amber-300/30 blur-xl" aria-hidden />
                  <Chest open={false} />
                  <span className="block mt-1 text-sm font-black text-amber-100">{i + 1}번</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="bonus-reveal w-full flex flex-col items-center gap-3">
            <div className="w-28 -mb-6">
              <Chest open />
            </div>
            <div
              className="relative z-10 w-36 h-36 rounded-full flex items-center justify-center text-[4.5rem] border-4"
              style={{ borderColor: info.color, background: `radial-gradient(circle, ${info.color}55 0%, #0f172a 70%)`, boxShadow: `0 0 50px ${info.color}, inset 0 0 30px ${info.color}88` }}
            >
              {info.emoji}
            </div>
            <p className="text-[2.6rem] font-black leading-tight" style={{ color: info.color, textShadow: `0 0 18px ${info.color}` }}>
              {info.title}
            </p>
            <p className="text-lg font-bold text-white">{info.desc}</p>
            {!result!.ok && (
              <p className="text-sm text-amber-300">⚠️ 저장이 잘 안 됐어. 선생님께 말해줘!</p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 text-slate-900 font-black py-4 rounded-2xl text-lg shadow-[0_0_30px_rgba(251,191,36,0.7)]"
            >
              ⬆️ 랭킹 도전 계속!
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
