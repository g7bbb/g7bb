import Link from 'next/link';
import { BrandLogo } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';
import { DRAWING_CONTEST_REWARDS, RANKING_REWARDS } from '@/lib/survey';
import { BADGE_MILESTONES } from '@/lib/badges';

// 📖 보호자용 게임 설명 (2026-10-02 Jin) — 종이 아래 "① 게임 설명" QR 이 여는 화면.
// 엄마·아빠가 읽는 화면이라 **존댓말**로 쓴다 (아이 화면은 반말).
// 종이를 뽑은 뒤에도 이 파일만 고치면 내용이 바뀐다 (QR 은 주소만 담고 있다).
// 🏙️ 11/20 Jin: 이 화면은 **대전 행사 내용 그대로** 둔다. 인천용은 `/guide/incheon` (app/guide/incheon/page.tsx).
//    참가권은 lib/tiers.ts 가 인천 가격으로 바뀌었으므로, 여기엔 대전 마지막 날(10/4) 참가권을 그대로 적어둔다.
const DAEJEON_TIERS: { emoji: string; price: string; name: string; perks: string[] }[] = [
  { emoji: '🎟️', price: '1.5만원', name: '참가권', perks: ['1게임 참여', '보너스 게임 (가끔 나와요)', '랭킹 상품 도전', '내 곤충 카드 발급', '게임 데이터 보존 안 됨'] },
  { emoji: '⬆️', price: '2만원', name: '레벨업권', perks: ['9판 참여', '레벨업 보너스 게임 (1회 무조건!)', '중간보스·보너스 게임 무조건 등장', '기다림 없이 9판 연달아', '랭킹 상품 도전', '내 곤충 카드 발급', '다시 참여하면 레벨업', 'G7BB 앱에서 내 캐릭터 보존 (앱이 나오면 QR로 이어서 참여)'] },
  { emoji: '🥇', price: '5만원', name: '골드', perks: ['하루 6게임(18판) 참여', '랭킹 상품 도전 (랭킹 선물은 별도)', '내 곤충 카드 발급', '내 곤충 피규어·포스터 선물 배송', '게임 데이터 계속 보관 (시즌1 이후에도 QR만 있으면 참여 가능)', '게임 속 금장식 카드 업적'] },
  { emoji: '💎', price: '10만원', name: '다이아', perks: ['2일간 무제한 참여', '랭킹 상품 도전 (랭킹 선물은 별도)', '내 곤충 카드 발급', '내 곤충 피규어·포스터 선물 배송', '홀로그램 카드 선물 배송', '게임 데이터 계속 보관 (시즌1 이후에도 QR만 있으면 참여 가능)', '4분기(10~12월) 전국 곤충체험 실내·실외 2회 참여권', '게임 속 홀로그램 다이아 카드 업적'] },
];

const KAKAO_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || '';

const STEPS: { emoji: string; title: string; body: string }[] = [
  { emoji: '🖍️', title: '종이에 곤충 그리기', body: '아이가 상상한 곤충을 자유롭게 그려요. 진하고 크게 그릴수록 AI가 더 잘 알아봐요.' },
  {
    emoji: '📷',
    title: '종이 오른쪽 위 QR 찍기',
    body: '그림을 다 그리면 종이 오른쪽 위 QR을 찍어요. 이름과 짧은 질문에 답하고 능력을 고른 뒤, 마지막에 그림을 사진으로 찍으면 AI가 멋진 곤충 카드로 바꿔줘요. 마음에 안 들면 2회 더 다시 만들 수 있어요.',
  },
  {
    emoji: '🧬',
    title: '곤충 능력 정하기',
    body: '곤충 종류 · 사는 곳 · 성장 단계 · 몸 부위 점수를 앱에서 고르면 능력치(HP·공격·수비·지능·회피)가 정해져요.',
  },
  {
    emoji: '⚔️',
    title: '수액을 차지하는 배틀',
    body: '1게임 = 랭킹 3위→2위→1위에 도전하는 배틀 3판 + 내가 고른 곤충과 연습 1판(경험치는 본게임의 50%, 연습한 상대의 공격 패턴을 읽어서 다음에 만나면 승리 확률 +10%). 배틀 중에 뜨는 ⚡필살기 버튼을 타이밍 맞춰 누르면 더 세져요.',
  },
  {
    emoji: '⏳',
    title: '30분마다 다시 도전',
    body: '게임을 시작하고 30분이 지나면 다시 도전할 수 있어요 (참가권에 따라 횟수가 달라요. 부스가 한가하면 30분 전에도 참여할 수 있어요). 다시 올수록 레벨이 올라 더 강해져요. 카드의 QR을 찍으면 바로 이어서 할 수 있어요.',
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
        <p className="font-black">🏆 랭킹 시상 (10/3~4 이틀 합산)</p>
        <ul className="mt-2 text-sm text-slate-300 flex flex-col gap-2">
          {RANKING_REWARDS.map((r) => (
            <li key={r.rank}>
              <b className="text-amber-300">
                {r.emoji} {r.rank}
              </b>{' '}
              · {r.text}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-slate-300">결과는 10월 4일 행사가 끝나면 곤충본부 액티비티 카카오톡 채널로 알려드려요. 채널을 꼭 친구 추가해주세요!</p>
      </section>

      <section className="bg-slate-800/80 rounded-2xl p-4">
        <p className="font-black">🎨 곤충 사생대회 (전체 참여자 중 3명)</p>
        <p className="mt-1 text-sm text-slate-400">배틀 성적과 상관없이, 예쁘고 멋지고 독특한 곤충을 뽑아요.</p>
        <ul className="mt-2 text-sm text-slate-300 flex flex-col gap-2">
          {DRAWING_CONTEST_REWARDS.map((r) => (
            <li key={r.rank}>
              <b className="text-amber-300">
                {r.emoji} {r.rank}
              </b>{' '}
              · {r.text}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-slate-800/80 rounded-2xl p-4">
        <p className="font-black">🎟️ 참가권</p>
        <div className="mt-2 flex flex-col gap-2">
          {DAEJEON_TIERS.map((tier) => {
            return (
              <div key={tier.price} className="text-sm">
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
