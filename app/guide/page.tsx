import Link from 'next/link';
import { BrandLogo } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';
import { TIERS, TIER_ORDER } from '@/lib/tiers';
import { PRIZES } from '@/lib/survey';
import { BADGE_MILESTONES } from '@/lib/badges';

// 📖 보호자용 게임 설명 (2026-10-02 Jin) — 종이 아래 "① 게임 설명" QR 이 여는 화면.
// 엄마·아빠가 읽는 화면이라 **존댓말**로 쓴다 (아이 화면은 반말).
// 종이를 뽑은 뒤에도 이 파일만 고치면 내용이 바뀐다 (QR 은 주소만 담고 있다).

const KAKAO_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || '';

const STEPS: { emoji: string; title: string; body: string }[] = [
  { emoji: '🖍️', title: '종이에 곤충 그리기', body: '아이가 상상한 곤충을 자유롭게 그려요. 진하고 크게 그릴수록 AI가 더 잘 알아봐요.' },
  {
    emoji: '📷',
    title: '종이 오른쪽 위 QR 찍기',
    body: '이름과 짧은 질문에 답한 뒤 그림을 사진으로 찍어 올리면, AI가 멋진 곤충 카드로 바꿔줘요. 마음에 안 들면 2번 더 다시 만들 수 있어요.',
  },
  {
    emoji: '🧬',
    title: '곤충 능력 정하기',
    body: '곤충 종류 · 사는 곳 · 성장 단계 · 몸 부위 점수를 앱에서 고르면 능력치(HP·공격·수비·지능·회피)가 정해져요.',
  },
  {
    emoji: '⚔️',
    title: '수액을 차지하는 배틀',
    body: '1게임 = 랭킹 3위→2위→1위에 도전하는 배틀 3판 + 랭커와 연습 1판. 배틀 중에 뜨는 ⚡필살기 버튼을 타이밍 맞춰 누르면 더 세져요.',
  },
  {
    emoji: '⏳',
    title: '30분마다 다시 도전',
    body: '게임을 시작하고 30분이 지나면 다시 도전할 수 있어요. 다시 올수록 레벨이 올라 더 강해져요. 카드의 QR을 찍으면 바로 이어서 할 수 있어요.',
  },
  {
    emoji: '🏅',
    title: '뱃지 모으기',
    body: '배틀을 하면서 뱃지(업적)를 모아요. 모은 개수에 따라 곤충이 더 강해지고, 부스에서 선물도 받아요.',
  },
];

export default function GuidePage() {
  return (
    <main className="min-h-screen max-w-md mx-auto px-5 py-8 flex flex-col gap-6" style={{ wordBreak: 'keep-all' }}>
      <div className="flex flex-col items-center gap-2 text-center">
        <BrandLogo size={88} />
        <h1 className="text-2xl font-black">{GAME_TITLE}</h1>
        <p className="text-slate-300">보호자분들을 위한 게임 설명이에요 🙂</p>
      </div>

      <section className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="bg-slate-800/80 rounded-2xl p-4 flex gap-3">
            <span className="text-3xl leading-none">{step.emoji}</span>
            <div>
              <p className="font-black">
                {i + 1}. {step.title}
              </p>
              <p className="mt-1 text-sm text-slate-300 leading-relaxed">{step.body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="bg-slate-800/80 rounded-2xl p-4">
        <p className="font-black">🎁 뱃지 개수 보상</p>
        <ul className="mt-2 text-sm text-slate-300 flex flex-col gap-1">
          {BADGE_MILESTONES.map((m) => (
            <li key={`${m.count}-${m.title}`}>
              <b className="text-amber-300">{m.count}개</b> · {m.emoji} {m.title}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-slate-800/80 rounded-2xl p-4">
        <p className="font-black">🏆 랭킹 시상 (2일 합산)</p>
        <p className="mt-1 text-sm text-slate-300">배틀 랭킹 1~4위에게 선물을 드려요. 결과는 10월 4일 행사가 끝날 때 카카오톡 채널로 알려드려요.</p>
        <ol className="mt-2 text-sm text-slate-300 flex flex-col gap-1">
          <li><b className="text-amber-300">1위</b> · {PRIZES[0].label}</li>
          <li><b className="text-amber-300">2위</b> · {PRIZES[1].label} / {PRIZES[2].label} 중 택1</li>
          <li><b className="text-amber-300">3위</b> · {PRIZES[3].label}</li>
          <li><b className="text-amber-300">4위</b> · {PRIZES[4].label}</li>
        </ol>
      </section>

      <section className="bg-slate-800/80 rounded-2xl p-4">
        <p className="font-black">🎟️ 참가권</p>
        <div className="mt-2 flex flex-col gap-2">
          {TIER_ORDER.map((key) => {
            const tier = TIERS[key];
            return (
              <div key={key} className="text-sm">
                <p className="font-bold">
                  {tier.emoji} {tier.price} · {tier.name}
                </p>
                <p className="text-slate-400">{tier.perks.join(' · ')}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-amber-400/15 border border-amber-400/40 rounded-2xl p-4 text-sm leading-relaxed">
        <p className="font-black text-amber-200">📌 꼭 기억해주세요</p>
        <p className="mt-1">· 그림 종이는 <b>상품을 받을 때 필요</b>해요. 꼭 보관해주세요.</p>
        <p>· 카카오톡 채널을 추가하고 <b>종이 번호(예: 014)</b>를 채팅으로 보내주시면, 당첨되었을 때 바로 연락드릴 수 있어요.</p>
        <p>· 아이 사진은 저장하지 않아요. AI가 만든 곤충 그림만 저장해요.</p>
      </section>

      {KAKAO_URL && (
        <a href={KAKAO_URL} target="_blank" rel="noreferrer" className="bg-yellow-300 text-slate-900 font-black text-center py-4 rounded-2xl">
          💬 카카오톡 채널 추가하기
        </a>
      )}
      <Link href="/about" className="text-center text-sm text-slate-400 underline">
        곤충본부는 뭐 하는 곳이에요? →
      </Link>
    </main>
  );
}
