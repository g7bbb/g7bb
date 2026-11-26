'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/app/brand-logo';

// 🎬 (체험용) 게임 설명 — 큰 화면에서 직원이 한 장씩 넘기며 설명 (11/26 Jin)
// "게임 설명을 끝까지 한번 해주는 버튼. 긴 영상 아니어도 되고, 멈춘 화면이 있으면 직원이 설명하면 돼"
// → 저절로 넘어가지 않는다. 직원이 → / 스페이스바 / 화면 오른쪽 클릭으로 넘긴다. 움직이는 건 타이밍 고리 시범 정도만.

type Slide = { title: string; body: React.ReactNode; say?: string };

const ORIGIN_RING = [
  { emoji: '💧', name: '물근처', why: '시원한 물로 더위를 식혀!' },
  { emoji: '🌡️', name: '기온상승', why: '뜨거운 열기로 산 얼음을 녹여!' },
  { emoji: '⛰️', name: '고지대', why: '높은 곳에서 내려다보며 공격!' },
  { emoji: '🏞️', name: '저지대', why: '단단한 땅이 물을 막아!' },
];

function Step({ n, children, hot }: { n: string; children: React.ReactNode; hot?: boolean }) {
  return (
    <div className={`flex items-center gap-[1.6vmin] rounded-[2vmin] px-[2.4vmin] py-[1.6vmin] ${hot ? 'bg-amber-400/20 border-2 border-amber-300' : 'bg-slate-800/80'}`}>
      <span className="flex-none w-[6vmin] h-[6vmin] rounded-full bg-amber-400 text-slate-900 flex items-center justify-center text-[3.4vmin] font-black">{n}</span>
      <span className="text-[3.4vmin] font-bold leading-snug">{children}</span>
    </div>
  );
}

/** 타이밍 고리 시범 — 4초마다 반복, 2초에 딱 겹칠 때 "지금!" */
function RingDemo() {
  return (
    <div className="relative w-[44vmin] h-[30vmin] rounded-[3vmin] bg-slate-900 border-4 border-amber-300">
      <span className="absolute top-[6%] inset-x-0 text-center text-[2.8vmin] font-black text-amber-200">⚡ 1번째 · 🦌 큰턱공격!</span>
      <span className="absolute left-1/2 top-[60%] w-[10vmin] h-[10vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-amber-300 animate-timing-target" />
      <span
        className="absolute left-1/2 top-[60%] w-[10vmin] h-[10vmin] rounded-full border-4 border-white animate-timing-ring"
        style={{ animationDuration: '4000ms', animationIterationCount: 'infinite' }}
      />
      <span className="howto-now absolute left-1/2 top-[60%] -translate-x-1/2 -translate-y-1/2 text-[5vmin] font-black text-amber-300 drop-shadow-[0_0_10px_rgba(0,0,0,0.9)]">
        지금!
      </span>
    </div>
  );
}

/** 기술칸 3개 — 불이 왼쪽 · 가운데 · 오른쪽 섞여서 켜지는 시범 */
function SlotDemo() {
  const [on, setOn] = useState(0);
  useEffect(() => {
    const order = [2, 0, 1];
    let k = 0;
    const id = window.setInterval(() => {
      k = (k + 1) % order.length;
      setOn(order[k]);
    }, 1400);
    setOn(order[0]);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex gap-[2vmin] w-[min(80vw,110vmin)]">
      {[0, 1, 2].map((c) => (
        <div
          key={c}
          className={`flex-1 h-[16vmin] rounded-[2vmin] border-4 flex items-center justify-center text-[3vmin] font-black transition-all duration-300 ${
            on === c ? 'bg-amber-400/20 border-amber-300 text-amber-200 shadow-[0_0_24px_rgba(251,191,36,0.6)] scale-105' : 'border-dashed border-slate-700 text-slate-600'
          }`}
        >
          {on === c ? '⚡ 여기!' : ['왼쪽', '가운데', '오른쪽'][c]}
        </div>
      ))}
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    title: '🐞 오늘은 이렇게 해!',
    body: (
      <div className="flex flex-col gap-[1.6vmin] w-[min(86vw,110vmin)]">
        <Step n="1">✏️ 종이에 나만의 곤충 그리기</Step>
        <Step n="2">📱 종이 QR 찍고 → 🤖 AI 로 곤충 만들기</Step>
        <Step n="3">📺 큰 화면에서 다같이 보고, 내 곤충 소개하기</Step>
        <Step n="4" hot>⚔️ 토너먼트! 🌳 참나무 수액을 차지하는 곤충은?</Step>
      </div>
    ),
    say: '오늘 순서를 먼저 알려줘요.',
  },
  {
    title: '🤖 AI 곤충 만들기',
    body: (
      <div className="flex flex-col items-center gap-[2vmin]">
        <div className="flex items-center gap-[2vmin]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/show/sketch-1.jpg" alt="" className="w-[26vmin] h-[26vmin] object-cover rounded-[2vmin] border-4 border-slate-600" />
          <span className="text-[7vmin]">➡️</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/show/ai-1.jpg" alt="" className="w-[26vmin] h-[26vmin] object-cover rounded-[2vmin] border-4 border-amber-300" />
        </div>
        <div className="flex flex-col gap-[1.2vmin] w-[min(86vw,110vmin)]">
          <Step n="1">곤충 종류 · 출신지 · 몸의 힘(1~5점) 고르기</Step>
          <Step n="2" hot>✏️ 누구? (생김새·효과) / 📍 어디서 무엇을? — 자세히 쓸수록 멋져!</Step>
          <Step n="3">📷 그림 사진 찍기 → 변신! (오늘은 딱 한 번만 만들어!)</Step>
        </div>
      </div>
    ),
    say: '프롬프트를 자세히 쓸수록 그림이 멋지게 나와요. 한 번만 만들 수 있으니 천천히!',
  },
  {
    title: '🌍 출신지 상성 — 가위바위보!',
    body: (
      <div className="flex flex-col items-center gap-[2vmin]">
        <div className="flex flex-wrap items-center justify-center gap-[1vmin]">
          {ORIGIN_RING.map((o, i) => (
            <div key={o.name} className="flex items-center gap-[1vmin]">
              <div className="rounded-[2vmin] bg-slate-800 px-[2vmin] py-[1.4vmin] text-center">
                <p className="text-[6vmin] leading-none">{o.emoji}</p>
                <p className="text-[3vmin] font-black">{o.name}</p>
              </div>
              <span className="text-[4vmin] font-black text-amber-300">{i < ORIGIN_RING.length - 1 ? '이김 ➡️' : '이김 ➡️ 💧'}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-[1vmin] w-[min(86vw,110vmin)] text-[2.6vmin] font-bold text-slate-200">
          {ORIGIN_RING.map((o) => (
            <p key={o.name} className="rounded-xl bg-slate-900 px-[1.6vmin] py-[1vmin]">
              {o.emoji} {o.name}: {o.why}
            </p>
          ))}
        </div>
        <p className="text-[3.2vmin] font-black text-emerald-300">☄️ 운석충돌 = 상성 없음 (대신 몸이 튼튼해!)</p>
        <p className="text-[3.6vmin] font-black text-amber-200">상성에서 이기면 훨씬 유리해! 하지만 무조건은 아니야 😉</p>
      </div>
    ),
    say: '내가 고른 출신지가 상대를 이기면 배틀에서 훨씬 유리해요.',
  },
  {
    title: '⚔️ 토너먼트는 이렇게!',
    body: (
      <div className="flex flex-col gap-[1.6vmin] w-[min(86vw,110vmin)]">
        <Step n="1">🎲 누가 누구랑 할지 컴퓨터가 무작위로 정해!</Step>
        <Step n="2">📋 큰 화면 대진표 — 왼쪽부터 1경기, 2경기…</Step>
        <Step n="3" hot>🪑 내 이름이 나오면 배틀 태블릿 앞에 앉기</Step>
        <Step n="4">🔥 아깝게 진 친구는 패자부활전 기회가 있을 수도!</Step>
        <Step n="5">🏆 결승은 3판 2선승!</Step>
      </div>
    ),
    say: '차례가 된 두 친구만 배틀 태블릿에 앉아요. 나머지는 큰 화면으로 응원!',
  },
  {
    title: '📲 배틀 태블릿에 앉으면',
    body: (
      <div className="flex flex-col items-center gap-[2vmin]">
        <div className="flex flex-col gap-[1.4vmin] w-[min(86vw,110vmin)]">
          <Step n="1">📷 [내 QR 찍기] 눌러서 내 종이 QR 찍기</Step>
          <Step n="2">🃏 내 카드가 뜨고, 상대는 그림자로 기다려</Step>
          <Step n="3">⚡ 상대가 들어오면 HERE COMES A NEW CHALLENGER!</Step>
          <Step n="4" hot>👆 화면을 한 번 톡! 눌러두기 (소리가 켜져)</Step>
        </div>
        <p className="text-[4vmin] font-black attract-gold">G7BB 배틀!! 시작!! 3 · 2 · 1</p>
      </div>
    ),
    say: '화면을 한 번 눌러둬야 소리가 나요.',
  },
  {
    title: '⚡ 필살기 타이밍 — 제일 중요해!',
    body: (
      <div className="flex flex-col items-center gap-[2.4vmin]">
        <RingDemo />
        <div className="flex flex-col gap-[1.2vmin] w-[min(86vw,110vmin)]">
          <Step n="1">하얀 고리가 점점 작아져</Step>
          <Step n="2" hot>노란 고리랑 딱 겹칠 때 톡! = ✨ 퍼펙트!</Step>
          <Step n="3">조금 빠르거나 늦으면 👍 굿! · 많이 틀리면 😣</Step>
        </div>
      </div>
    ),
    say: '고리가 작아지다가 노란 고리와 겹치는 순간에 누르면 퍼펙트예요. 한번 같이 볼까요? (화면 고리를 보며 "지금!")',
  },
  {
    title: '🚨 배틀할 때 주의!',
    body: (
      <div className="flex flex-col items-center gap-[2.4vmin]">
        <SlotDemo />
        <div className="flex flex-col gap-[1.2vmin] w-[min(86vw,110vmin)]">
          <Step n="1" hot>필살기는 3번! 칸이 왼쪽·가운데·오른쪽 섞여서 떠</Step>
          <Step n="2" hot>❌ 미리 마구 누르지 마! 한 번 누르면 그걸로 끝</Step>
          <Step n="3">👀 칸이 뜨면 고리를 보고 → 겹칠 때 딱 한 번!</Step>
          <Step n="4">😴 안 누르면 필살기를 못 써서 손해야</Step>
        </div>
      </div>
    ),
    say: '미리 연타하면 그 순간 판정이 끝나버려요. 칸이 뜨고, 고리가 겹칠 때 딱 한 번!',
  },
  {
    title: '🧐 누가 이겼을까?',
    body: (
      <div className="flex flex-col items-center gap-[2vmin]">
        <div className="flex items-end gap-[4vmin]">
          {[
            { src: '/bots/stag.jpg', name: '이긴 곤충', hp: 23, win: true },
            { src: '/bots/butterfly.jpg', name: '진 곤충', hp: 0, win: false },
          ].map((c) => (
            <div key={c.name} className="flex flex-col items-center gap-[1vmin]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.src}
                alt=""
                className={`w-[24vmin] h-[30vmin] object-cover rounded-[2vmin] border-4 ${c.win ? 'border-amber-300 aura-gold' : 'border-slate-600 grayscale opacity-60'}`}
              />
              <div className="w-[24vmin] h-[2.4vmin] rounded-full bg-slate-800 overflow-hidden">
                <div className={`h-full ${c.win ? 'bg-rose-500' : 'bg-sky-500'}`} style={{ width: `${c.hp}%` }} />
              </div>
              <p className="text-[2.6vmin] font-black">HP {c.hp}%</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-400/10 px-[3vmin] py-[1.4vmin] text-center">
          <p className="text-[2.6vmin] font-black text-amber-200">🧐 왜 이겼을까?</p>
          <p className="text-[3.2vmin] font-black">상성 · ⚡ 타이밍 · 레벨 · 몸의 힘 · 그리고 약간의 운!</p>
        </div>
        <p className="text-[3vmin] font-bold text-slate-300">졌어도 괜찮아 — 한끗 차이였는지 HP 를 봐!</p>
      </div>
    ),
    say: '결과 화면에 왜 이겼는지가 나와요. 내가 고른 출신지·타이밍 덕분인지 같이 봐요.',
  },
  {
    title: '🌳 수액을 차지하자!',
    body: (
      <div className="flex flex-col items-center gap-[2.4vmin] text-center">
        <p className="text-[12vmin]">👑</p>
        <p className="text-[5vmin] font-black attract-gold leading-tight">
          끝까지 이긴 곤충이
          <br />
          참나무 수액의 주인!
        </p>
        <p className="text-[3.4vmin] font-bold text-slate-200">친구 배틀도 큰 화면으로 같이 응원해줘! 📣</p>
      </div>
    ),
  },
];

export default function HowToPage() {
  const [i, setI] = useState(0);
  const [showSay, setShowSay] = useState(true);
  const go = (d: number) => setI((x) => Math.min(SLIDES.length - 1, Math.max(0, x + d)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const s = SLIDES[i];
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col px-[3vw] py-[2vmin] select-none" style={{ wordBreak: 'keep-all' }}>
      <header className="flex items-center justify-between gap-2">
        <Link href="/admin" className="rounded-full bg-slate-800 px-3 py-1 text-[1.8vmin] font-bold text-slate-300">
          ← 직원 메뉴
        </Link>
        <div className="flex items-center gap-[1vmin]">
          <BrandMark size={32} />
          <span className="text-[2.2vmin] font-black text-amber-200">G7BB 배틀 · 게임 설명</span>
        </div>
        <button onClick={() => setShowSay((v) => !v)} className="rounded-full bg-slate-800 px-3 py-1 text-[1.8vmin] font-bold text-slate-300">
          💬 직원 멘트 {showSay ? '숨기기' : '보기'}
        </button>
      </header>

      {/* 화면 왼쪽 1/3 누르면 이전, 나머지 누르면 다음 */}
      <section className="relative flex-1 flex flex-col items-center justify-center gap-[3vmin] py-[2vmin]" onClick={(e) => go(e.clientX < window.innerWidth / 3 ? -1 : 1)}>
        <h1 key={`t${i}`} className="text-[6.4vmin] font-black text-center animate-pop">
          {s.title}
        </h1>
        <div key={`b${i}`} className="animate-pop flex justify-center">
          {s.body}
        </div>
      </section>

      <footer className="flex items-center justify-between gap-[2vmin]">
        <button onClick={() => go(-1)} disabled={i === 0} className="rounded-full bg-slate-800 px-[3vmin] py-[1.2vmin] text-[2.6vmin] font-black disabled:opacity-30">
          ◀ 이전
        </button>
        <div className="flex-1 flex flex-col items-center gap-[0.8vmin] min-w-0">
          {showSay && s.say && <p className="text-center text-[2vmin] text-slate-400 truncate max-w-full">💬 {s.say}</p>}
          <div className="flex gap-[0.8vmin]">
            {SLIDES.map((_, k) => (
              <span key={k} className={`h-[1.2vmin] rounded-full transition-all ${k === i ? 'w-[4vmin] bg-amber-300' : 'w-[1.2vmin] bg-slate-600'}`} />
            ))}
          </div>
        </div>
        <button
          onClick={() => go(1)}
          disabled={i === SLIDES.length - 1}
          className="rounded-full bg-amber-400 text-slate-900 px-[3vmin] py-[1.2vmin] text-[2.6vmin] font-black disabled:opacity-30"
        >
          다음 ▶
        </button>
      </footer>
    </main>
  );
}
