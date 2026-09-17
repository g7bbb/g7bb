'use client';

import { useState } from 'react';
import { BODY_PARTS } from '@/lib/insect-stats';
import { ENVIRONMENTS } from '@/lib/environments';

interface Slide {
  emoji: string;
  title: string;
  description: string;
  visual?: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    emoji: '🖍️',
    title: '종이에 곤충을 그려요',
    description: '내가 만들고 싶은 곤충을 마음대로 그려보세요.\n잘 못 그려도 괜찮아요!',
  },
  {
    emoji: '✏️',
    title: '곤충 이름을 정해요',
    description: '장수풍뎅이? 사슴벌레?\n어떤 곤충인지 적어주세요.',
    visual: (
      <div className="bg-slate-800 rounded-xl px-4 py-3 text-slate-300 w-full text-left">
        예: 장수풍뎅이
      </div>
    ),
  },
  {
    emoji: '🏞️',
    title: '사는 곳과 나이를 골라요',
    description: '어디에서 살던 곤충인지,\n얼마나 자란 곤충인지 골라주세요.',
    visual: (
      <div className="grid grid-cols-3 gap-2 w-full">
        {ENVIRONMENTS.map((e) => (
          <div key={e.key} className="bg-slate-800 rounded-xl py-2 text-xs font-semibold">
            {e.emoji} {e.label}
          </div>
        ))}
      </div>
    ),
  },
  {
    emoji: '💪',
    title: '몸의 힘을 나눠줘요',
    description: '7군데에 1~5점씩 점수를 주세요.\n높은 점수를 준 곳이 더 크고 멋지게 그려져요!',
    visual: (
      <div className="flex flex-col gap-2 w-full">
        {BODY_PARTS.slice(0, 3).map((part, i) => (
          <div key={part.key} className="bg-slate-800 rounded-xl px-3 py-2 text-left">
            <div className="text-xs mb-1">{part.label}</div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <div
                  key={v}
                  className={`flex-1 h-4 rounded ${
                    v <= 5 - i ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    emoji: '📸',
    title: '사진을 찍으면 변신!',
    description: '내가 그린 그림을 사진으로 찍으면\n진짜 같은 곤충으로 변신해요.',
  },
  {
    emoji: '⚔️',
    title: '이제 배틀하러 가요!',
    description: '만든 곤충으로 친구들과 배틀하고\n랭킹에 도전해보세요.',
  },
];

export default function HowTo({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col">
      <div className="flex justify-end p-4">
        <button onClick={onClose} className="text-slate-400 text-sm px-3 py-1">
          건너뛰기 ✕
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
        <div key={`emoji-${index}`} className="text-7xl animate-pop">
          {slide.emoji}
        </div>
        <h2 key={`title-${index}`} className="text-2xl font-bold animate-slide-up">
          {slide.title}
        </h2>
        <p key={`desc-${index}`} className="text-slate-300 whitespace-pre-line animate-slide-up">
          {slide.description}
        </p>
        {slide.visual && (
          <div key={`visual-${index}`} className="w-full max-w-xs animate-slide-up">
            {slide.visual}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 px-8 pb-10">
        <div className="flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === index ? 'w-6 bg-emerald-400' : 'w-2 bg-slate-700'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {index > 0 && (
            <button
              onClick={() => setIndex(index - 1)}
              className="flex-1 bg-slate-800 text-slate-200 font-bold py-4 rounded-2xl text-lg"
            >
              이전
            </button>
          )}
          <button
            onClick={() => (isLast ? onClose() : setIndex(index + 1))}
            className="flex-[2] bg-emerald-500 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            {isLast ? '곤충 만들러 가기! 🐛' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
