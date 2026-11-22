'use client';

import { useEffect, useState } from 'react';
import {
  SHOW_AI_MS,
  SHOW_BATTLE_MS,
  SHOW_COMPARE,
  SHOW_COMPARE_MS,
  SHOW_EDU_MS,
  SHOW_EDU_STEPS,
  SHOW_EDU_TAGLINE,
  SHOW_FLASH_MS,
  SHOW_PROMPT_IMAGE,
  SHOW_PROMPT_MS,
  SHOW_PROMPT_TEXT,
  SHOW_SKETCH_MS,
  SHOW_SPEED,
  ShowPair,
} from '@/lib/transform-show';
import { BattleScene } from '@/app/attract/attract-show';
import { BRAND } from '@/lib/brand';

// 🪄 변신 쇼 (lib/transform-show.ts) — 화면 가득.
// 짝마다: 왼쪽 스케치 → 가운데 🪄 → 오른쪽이 번쩍하며 AI 곤충 (한 화면에 나란히, 11/21 Jin "모니터가 커서")
// 짝을 다 보여준 뒤: 1번 vs 2번 곤충 배틀 (홍보 영상 배틀 장면 그대로).
// loop 면 끝없이, 아니면 한 바퀴 돌고 onDone.

type Step = 'sketch' | 'flash' | 'ai';
export type ShowScene = 'prompt' | 'compare' | 'edu' | 'pairs';

/**
 * 화면 틀: 보통은 화면 가득(모니터 /live·/show). embedded 면 태블릿 대기화면(app/attract) 안에 —
 * 위 "AI를 재미있게 배우는 G7BB!"·아래 "화면을 눌러서 시작!" 자리를 비워 둔다 (11/21 Jin).
 */
function wrapCls(embedded?: boolean) {
  return embedded ? 'absolute inset-0 pt-[10vmin] pb-[11vmin] flex flex-col' : 'fixed inset-0 z-[90] bg-slate-950 flex flex-col';
}
type Slot = { kind: 'pair'; i: number } | { kind: 'battle' } | { kind: 'prompt' } | { kind: 'compare' } | { kind: 'edu' };

export default function TransformShow({
  pairs,
  loop = false,
  onDone,
  only,
  embedded,
}: {
  pairs: ShowPair[];
  loop?: boolean;
  onDone?: () => void;
  /** 미리보기용: 이 장면만 (/show?scene=prompt · compare · edu) */
  only?: ShowScene;
  /** 태블릿 대기화면 안에 넣을 때 (위·아래 글자 자리 비움, 배경 투명) */
  embedded?: boolean;
}) {
  const slots: Slot[] = only === 'pairs'
    ? pairs.map((_, i) => ({ kind: 'pair' as const, i }))
    : only
    ? [{ kind: only }]
    : [
        ...pairs.map((_, i) => ({ kind: 'pair' as const, i })),
        ...(pairs.length >= 2 ? [{ kind: 'battle' as const }] : []),
        { kind: 'prompt' as const },
        { kind: 'compare' as const },
        { kind: 'edu' as const },
      ];
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
    if (slot.kind !== 'pair') {
      const ms =
        slot.kind === 'battle' ? SHOW_BATTLE_MS : slot.kind === 'prompt' ? SHOW_PROMPT_MS : slot.kind === 'compare' ? SHOW_COMPARE_MS : SHOW_EDU_MS;
      const t = window.setTimeout(next, ms);
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

  if (slot.kind === 'prompt') return <PromptScene key={`p-${n}`} embedded={embedded} />;
  if (slot.kind === 'compare') return <CompareScene key={`c-${n}`} embedded={embedded} />;
  if (slot.kind === 'edu') return <EduScene key={`e-${n}`} embedded={embedded} />;

  const pair = pairs[slot.i];
  const ratio = pair.ratio ?? 1;
  // 가로 모니터: 나란히(한 칸 폭 43vw, 높이 60vh 안) / 세로 모니터: 위아래(폭 88vw, 높이 34vh 안)
  const box = { aspectRatio: String(ratio) } as React.CSSProperties;
  const boxCls = embedded
    ? 'relative w-[min(42vw,calc(48vh*var(--r)))] portrait:w-[min(86vw,calc(24vh*var(--r)))]'
    : 'relative w-[min(43vw,calc(60vh*var(--r)))] portrait:w-[min(88vw,calc(28vh*var(--r)))]';

  return (
    <div className={`${wrapCls(embedded)} items-center justify-center overflow-hidden`} style={{ wordBreak: 'keep-all' }}>
      {step === 'ai' && <div className="bonus-rays" />}
      <p className={`relative z-10 ${embedded ? 'mb-[2vmin] text-[4.6vmin]' : 'mb-[3vmin] text-[5.5vmin]'} font-black text-amber-300 drop-shadow text-center px-4`}>🖍️ 내가 그린 그림이 멋지게 변합니다!</p>

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

      {/* 대기화면 안에서는 아래 "화면을 눌러서 시작!" 버튼이 같은 말을 해서 뺀다 */}
      {!embedded && <p className="relative z-10 mt-[4vmin] text-[3vmin] font-bold text-slate-300">📷 종이에 그리고 QR 을 찍으면 너도 변신!</p>}
    </div>
  );
}

/**
 * ✍️ "곤충 생성하는 과정에서 AI 프롬프트 쓰는 연습을 해볼 수 있어요!" (10초, 11/21 Jin 문구)
 * 생김새 칸에 글자가 한 자씩 써지고(0.8~5.2초) → ✨ 그 글로 만든 그림이 뜬다(6초~).
 */
function PromptScene({ embedded }: { embedded?: boolean }) {
  const [shown, setShown] = useState(0);
  const [img, setImg] = useState(false);
  useEffect(() => {
    const chars = Array.from(SHOW_PROMPT_TEXT);
    const per = 4400 / chars.length;
    const ts = chars.map((_, i) => window.setTimeout(() => setShown(i + 1), 800 + i * per));
    ts.push(window.setTimeout(() => setImg(true), 6000));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, []);
  const typed = Array.from(SHOW_PROMPT_TEXT).slice(0, shown).join('');
  return (
    <div className={`${wrapCls(embedded)} items-center justify-center overflow-hidden px-[4vw]`} style={{ wordBreak: 'keep-all' }}>
      {img && <div className="bonus-rays" />}
      <p className="relative z-10 text-center text-[5.2vmin] font-black text-amber-300 leading-snug drop-shadow animate-pop">
        곤충 생성하는 과정에서
        <br />
        <span className="text-white">AI 프롬프트 쓰는 연습</span>을 해볼 수 있어요!
      </p>
      <div className="relative z-10 mt-[4vmin] flex flex-row portrait:flex-col items-center gap-[3vmin]">
        {/* 앱의 "어떻게 생겼어?" 칸 모양 그대로 */}
        <div className="w-[min(46vw,80vh)] portrait:w-[86vw] rounded-[2vmin] border-[0.4vmin] border-amber-300/70 bg-amber-400/10 p-[2.4vmin]">
          <p className="text-[2.6vmin] font-black text-amber-200">✏️ 어떻게 생겼어? 어떤 효과를 넣을까?</p>
          <div className="mt-[1.5vmin] min-h-[14vmin] rounded-[1.4vmin] bg-slate-900 px-[2vmin] py-[1.6vmin] text-[3.6vmin] font-bold text-white leading-snug">
            {typed}
            <span className="show-caret">|</span>
          </div>
        </div>
        <p className={`text-[7vmin] leading-none portrait:rotate-90 transition-opacity ${img ? 'opacity-100' : 'opacity-30'}`}>➡️</p>
        <div className="relative w-[min(30vw,40vh)] portrait:w-[60vw] aspect-[4/3]">
          <div className={`absolute inset-0 rounded-[2vmin] border-[0.5vmin] border-dashed border-slate-600 flex items-center justify-center transition-opacity ${img ? 'opacity-0' : 'opacity-100'}`}>
            <span className="text-[9vmin] text-slate-600 font-black">?</span>
          </div>
          <div className={`absolute inset-0 rounded-[2vmin] overflow-hidden transition-all duration-700 ${img ? 'opacity-100 scale-100 aura-gold' : 'opacity-0 scale-75'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SHOW_PROMPT_IMAGE} alt="글로 만든 곤충" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 👩‍👧 "곤충본부 AI 창작 교실" 3단계 (8초, 보호자용 존댓말).
 * 제목 → 0.9초부터 한 단계씩(1.1초 간격) → 4.6초에 맺음 문구 → 8초까지 그대로.
 */
function EduScene({ embedded }: { embedded?: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const at = [900, 2000, 3100, 4600];
    const ts = at.map((ms, i) => window.setTimeout(() => setShown(i + 1), ms));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, []);
  const steps = SHOW_EDU_STEPS;
  return (
    <div className={`${wrapCls(embedded)} items-center justify-center overflow-hidden px-[4vw]`} style={{ wordBreak: 'keep-all' }}>
      {shown > steps.length && <div className="attract-rays" />}
      <div className="relative z-10 flex items-center gap-[2vmin] animate-pop">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.mark.white} alt="" aria-hidden style={{ height: '9vmin', width: 'auto' }} />
        <p className="text-[6.4vmin] font-black text-white drop-shadow">
          곤충본부 <span className="text-amber-300">AI 창작 교실</span>
        </p>
      </div>
      <div className="relative z-10 mt-[5vmin] grid grid-cols-3 portrait:grid-cols-1 gap-[3vmin] w-full max-w-[150vmin]">
        {steps.map((st, i) => (
          <div
            key={st.title}
            className={`rounded-[2.4vmin] border-[0.4vmin] border-amber-300/60 bg-slate-900/90 px-[3vmin] py-[3.4vmin] portrait:py-[2.6vmin] flex flex-col portrait:flex-row items-center portrait:items-start gap-[1.6vmin] portrait:gap-[3vmin] transition-all duration-500 ${
              shown > i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[4vmin]'
            }`}
          >
            <p className="text-[9vmin] portrait:text-[8vmin] leading-none">{st.icon}</p>
            <div className="text-center portrait:text-left">
              <p className="text-[2.8vmin] font-black text-amber-300">{i + 1}단계</p>
              <p className="mt-[0.6vmin] text-[4.2vmin] font-black text-white leading-tight">{st.title}</p>
              <p className="mt-[1vmin] text-[2.8vmin] font-bold text-slate-300 leading-snug">{st.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <p
        className={`relative z-10 mt-[5vmin] text-center text-[4.4vmin] font-black text-amber-200 drop-shadow transition-all duration-700 ${
          shown > steps.length ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
        }`}
      >
        {/* 세로 모니터는 쉼표에서 줄바꿈 ("놀이로 / 연습해요" 로 갈라지지 않게) */}
        “{SHOW_EDU_TAGLINE.split(', ')[0]},<br className="hidden portrait:block" /> {SHOW_EDU_TAGLINE.split(', ').slice(1).join(', ')}”
      </p>
    </div>
  );
}

/** 글자를 한 자씩 쳐 주는 시계 (from~to ms 동안) */
function useTyping(text: string, from: number, to: number) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const chars = Array.from(text);
    const per = (to - from) / chars.length;
    const ts = chars.map((_, i) => window.setTimeout(() => setShown(i + 1), from + i * per));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, [text, from, to]);
  return Array.from(text).slice(0, shown).join('');
}

/**
 * 🆚 "어떻게 말하느냐에 따라 AI 그림이 달라져요" (9초, 보호자용 존댓말)
 * 왼쪽(추상적) 글 0.5~1.3초 → 그림 1.8초 / 오른쪽(자세히) 글 2.6~5.4초 → 그림 5.9초 → 7초 맺음 문구.
 */
function CompareScene({ embedded }: { embedded?: boolean }) {
  const { vague, detailed } = SHOW_COMPARE;
  const vagueText = useTyping(vague.text, 500, 1300);
  const detailText = useTyping(detailed.text, 2600, 5400);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ts = [1800, 5900, 7000].map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, []);

  // 대기화면 안에서는 위·아래 글자 자리만큼 그림을 줄인다
  const wCls = embedded
    ? 'w-[min(42vw,calc(28vh*var(--r)))] portrait:w-[min(86vw,calc(14vh*var(--r)))]'
    : 'w-[min(42vw,calc(38vh*var(--r)))] portrait:w-[min(86vw,calc(17vh*var(--r)))]';
  const col = (
    kind: 'vague' | 'detailed',
    text: string,
    typing: boolean,
    show: boolean,
    item: { image: string; ratio: number },
  ) => {
    const good = kind === 'detailed';
    return (
      <div className={`flex flex-col items-center gap-[1.6vmin] portrait:gap-[1.2vmin] transition-opacity duration-500 ${good && step < 1 ? 'opacity-30' : 'opacity-100'}`}>
        <p className={`rounded-full px-[2.4vmin] py-[0.8vmin] text-[3vmin] font-black ${good ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>
          {good ? '🤩 자세하게 쓰면' : '😕 대충 쓰면'}
        </p>
        <div
          className={`${embedded ? 'w-[44vw] min-h-[9vmin]' : 'w-[min(42vw,calc(38vh*var(--r)))] min-h-[11vmin]'} portrait:w-[86vw] portrait:min-h-0 rounded-[1.6vmin] border-[0.3vmin] px-[2vmin] py-[1.4vmin] portrait:py-[1vmin] text-[2.9vmin] portrait:text-[2.7vmin] font-bold leading-snug ${
            good ? 'border-amber-300/70 bg-slate-900 text-white' : 'border-slate-600 bg-slate-900 text-slate-300'
          }`}
          style={{ ['--r' as any]: item.ratio }}
        >
          ✏️ {text}
          {typing && <span className="show-caret">|</span>}
        </div>
        <div
          className={`relative ${wCls}`}
          style={{ ['--r' as any]: item.ratio, aspectRatio: String(item.ratio) }}
        >
          <div className={`absolute inset-0 rounded-[2vmin] border-[0.5vmin] border-dashed border-slate-600 flex items-center justify-center transition-opacity ${show ? 'opacity-0' : 'opacity-100'}`}>
            <span className="text-[9vmin] text-slate-600 font-black">?</span>
          </div>
          <div
            className={`absolute inset-0 rounded-[2vmin] overflow-hidden transition-all duration-700 ${
              show ? `opacity-100 scale-100 ${good ? 'aura-gold' : ''}` : 'opacity-0 scale-75'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image} alt={good ? '자세한 설명으로 만든 곤충' : '대충 쓴 설명으로 만든 곤충'} className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`${wrapCls(embedded)} items-center justify-center overflow-hidden px-[3vw]`} style={{ wordBreak: 'keep-all' }}>
      {step >= 2 && <div className="bonus-rays" />}
      <p className={`relative z-10 text-center ${embedded ? 'text-[4.2vmin]' : 'text-[5.2vmin] portrait:text-[4.6vmin]'} font-black text-white leading-snug drop-shadow animate-pop`}>
        어떻게 말하느냐에 따라 <span className="text-amber-300">AI 그림이 달라져요!</span>
      </p>
      <div className={`relative z-10 ${embedded ? 'mt-[1.6vmin] gap-[2.4vmin] portrait:gap-[1.6vmin]' : 'mt-[3vmin] gap-[4vmin] portrait:gap-[2.4vmin]'} flex flex-row portrait:flex-col items-start portrait:items-center justify-center`}>
        {col('vague', vagueText, vagueText.length < Array.from(vague.text).length, step >= 1, vague)}
        {col('detailed', detailText, step >= 1 && detailText.length < Array.from(detailed.text).length, step >= 2, detailed)}
      </div>
      <p
        className={`relative z-10 ${embedded ? 'mt-[1.6vmin] text-[3.4vmin]' : 'mt-[3vmin] text-[4vmin] portrait:text-[3.6vmin]'} text-center font-black text-amber-200 drop-shadow transition-all duration-700 ${
          step >= 3 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
        }`}
      >
        구체적으로 말할수록 AI가 내 상상에 가까워져요
      </p>
    </div>
  );
}
