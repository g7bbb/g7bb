'use client';

import { createPortal } from 'react-dom';
import { auraClass, CardTierStyle, FRAME_WORD, LEVEL_FRAME } from '@/lib/card';

// ✨ 레벨을 달성해 카드 테두리가 반짝이기 시작할 때 (10/4 Jin:
//    "레벨을 달성한 뒤 카드 뒤에 반짝이는 게 달성되면 알려줘. '이제 더 강해졌어!' 하면서 카드를 크게 확대해서")
// 카드가 작게 나타났다가 쾅 커지고, 뒤에 햇살이 돌고, 테두리에 빛이 흐른다. 아무 데나 누르면 닫힘.
// 햇살·반짝이·금빛 제목은 보너스 스테이지 CSS 를 같이 쓴다 (app/globals.css).

const NEXT: Partial<Record<CardTierStyle['key'], string>> = {
  silver: `LV.${LEVEL_FRAME.gold} 이 되면 🥇 금색!`,
  gold: `LV.${LEVEL_FRAME.diamond} 이 되면 💎 다이아몬드!`,
};

export default function FrameUpPopup({
  tier,
  level,
  name,
  image,
  onClose,
}: {
  tier: CardTierStyle;
  level: number;
  name: string;
  image?: string | null;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  const next = NEXT[tier.key];
  return createPortal(
    <div
      className="bonus-backdrop fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center"
      onClick={onClose}
      role="dialog"
      aria-label="이제 더 강해졌어!"
      style={{ wordBreak: 'keep-all' }}
    >
      <div className="bonus-rays" />
      {['12%,18%', '82%,14%', '8%,70%', '88%,64%', '24%,88%', '74%,86%', '50%,8%'].map((p, i) => (
        <span
          key={p}
          className="bonus-sparkle absolute text-3xl"
          style={{ left: p.split(',')[0], top: p.split(',')[1], animationDelay: `${i * 0.25}s` }}
        >
          ✨
        </span>
      ))}

      <p className="bonus-title relative text-[2.4rem] font-black leading-tight">이제 더 강해졌어!</p>

      {/* 카드 — 작게 나타났다가 크게 확대 */}
      <div
        className={`frameup-card holo-frame ${auraClass(tier)} relative w-[68vw] max-w-[19rem]`}
        style={{
          background: tier.frame,
          padding: 7,
          borderRadius: '1.1rem',
          ['--frameup-glow' as any]: tier.key === 'gold' ? 'rgba(251,191,36,0.9)' : tier.key === 'silver' ? 'rgba(226,232,240,0.9)' : 'rgba(165,243,252,0.95)',
        }}
      >
        <div className="relative overflow-hidden bg-slate-800" style={{ borderRadius: '0.8rem' }}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={name} className="block w-full aspect-[4/5] object-cover" />
          ) : (
            <div className="w-full aspect-[4/5] flex items-center justify-center text-7xl">🐛</div>
          )}
          <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-0.5 text-lg font-black text-white">LV.{level}</span>
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 text-left text-xl font-black text-white truncate">
            {name}
          </span>
        </div>
      </div>

      <div className="relative flex flex-col gap-1">
        <p className="text-xl font-black text-white">
          LV.{level} 달성! 카드 테두리가 <span className="text-amber-300">{FRAME_WORD[tier.key]}</span>
          {tier.key === 'silver' || tier.key === 'gold' ? '으로' : '로'} 반짝여!
        </p>
        {next && <p className="text-base font-bold text-sky-200">다음 목표: {next}</p>}
        <p className="mt-2 text-sm text-slate-300">👆 아무 데나 누르면 닫혀</p>
      </div>
    </div>,
    document.body
  );
}
