'use client';

import { createPortal } from 'react-dom';

// ✏️ "어떻게 생겼어?" 칸 도우미 (2026-10-03 Jin: "아이들이 설명칸에 상세히 쓰니까 이미지가 엄청 자세히 멋지게 나와.
//    팝업으로 조금 더 자세히 써달라고 얘기해줘 — 번개 효과, 불 효과 등등")
//
// 처음 칸을 누를 때 한 번 저절로 뜨고, "💡 예시 보기" 로 다시 열 수 있다. 예시를 누르면 칸 뒤에 붙는다.
// 예시에 큰턱·뿔 같은 몸 부위는 일부러 안 넣었다 — 나비에 큰턱을 붙이면 "고른 곤충 모습" 규칙과 부딪힌다.

export const LOOK_MAX = 200;

export const LOOK_EXAMPLES = [
  '⚡ 몸에서 파란 번개가 파지직 튀어',
  '🔥 날개에서 불꽃이 활활 타올라',
  '❄️ 얼음 갑옷을 입었어',
  '💧 물방울이 사방으로 튀어',
  '🌈 날개가 무지개빛으로 반짝여',
  '✨ 반짝이 가루가 흩날려',
  '💎 등껍질이 보석처럼 빛나',
  '🤖 로봇 갑옷을 입었어',
  '🌙 밤하늘 별빛 아래에 있어',
  '🌋 뒤에서 화산이 폭발해',
  '🌸 꽃잎이 바람에 날려',
  '💨 회오리바람이 휘몰아쳐',
];

/** 예시 하나를 칸 뒤에 붙인다 (이모지는 빼고, 넘치면 안 붙임) */
export function appendLook(current: string, example: string): string {
  const text = example.replace(/^\S+\s/, '');
  if (current.includes(text)) return current;
  const next = current.trim() ? `${current.trim()}, ${text}` : text;
  return next.length <= LOOK_MAX ? next : current;
}

export default function LookTips({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 px-4" onClick={onClose}>
      <div
        className="animate-pop w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl border-2 border-amber-300 bg-slate-900 p-5 flex flex-col gap-3 shadow-[0_0_40px_rgba(251,191,36,0.35)]"
        style={{ wordBreak: 'keep-all' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-2xl font-black text-amber-300 text-center">💡 자세히 쓸수록 더 멋져져!</p>
        <p className="text-base text-slate-200 text-center">
          AI는 네가 쓴 걸 보고 그림을 그려.
          <br />
          <b className="text-white">어떤 효과를, 어디에, 어떻게</b> 넣을지 자세히 써줘!
        </p>
        <div className="rounded-2xl bg-slate-800 px-4 py-3 text-sm">
          <p className="text-slate-400">이렇게 쓰면 좋아 👇</p>
          <p className="mt-1 font-bold text-emerald-300">
            &quot;날개 끝에서 파란 번개가 파지직 튀고, 등껍질은 금색으로 반짝이고, 뒤에는 불꽃이 활활 타올라!&quot;
          </p>
          <p className="mt-2 text-slate-500 line-through">&quot;멋있게&quot;</p>
          <p className="text-xs text-slate-400">↑ 이렇게 짧게 쓰면 AI가 뭘 그릴지 몰라</p>
        </div>
        <p className="text-sm font-bold text-sky-300">👆 눌러서 넣어봐! (여러 개 골라도 돼)</p>
        <div className="flex flex-wrap gap-2">
          {LOOK_EXAMPLES.map((ex) => {
            const on = value.includes(ex.replace(/^\S+\s/, ''));
            return (
              <button
                key={ex}
                type="button"
                onClick={() => onChange(appendLook(value, ex))}
                className={`rounded-full px-3 py-2 text-sm font-bold border ${
                  on ? 'bg-amber-300 text-slate-900 border-amber-300' : 'bg-slate-800 border-slate-600'
                }`}
              >
                {ex}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 text-center">
          지금 {value.length}/{LOOK_MAX}자 · 고른 다음에 칸에서 고쳐 써도 돼!
        </p>
        {/* 작은 폰에서도 닫는 버튼이 항상 보이게 아래에 붙인다 */}
        <div className="sticky -bottom-5 -mx-5 -mb-5 px-5 pt-2 pb-5 bg-slate-900">
          <button type="button" onClick={onClose} className="w-full bg-amber-400 text-slate-900 font-black py-3.5 rounded-2xl text-lg">
            좋아, 써볼게! ✏️
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
