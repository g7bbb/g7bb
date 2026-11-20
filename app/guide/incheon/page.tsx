import { BrandLogo } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';
import { TIERS, SELL_ORDER } from '@/lib/tiers';
import { DRAWING_CONTEST_REWARDS, RANKING_REWARDS } from '@/lib/survey';
import { BADGE_MILESTONES } from '@/lib/badges';
import { CURRENT_EVENT, PAST_EVENT } from '@/lib/event-config';

// 📖 인천 행사 보호자 안내 (2026-11-20 Jin: "대전 안내는 그대로 두고 인천용 페이지 하나 더").
// 대전용은 /guide. 존댓말 (보호자가 읽는 화면).
// - 랭킹 시상: 인천 이틀 합산, **1~5위까지만** (RANKING_REWARDS 앞 3줄 = 1위 · 2위 · 3~5위)
// - 참가권: lib/tiers.ts 의 지금 파는 것(SELL_ORDER) — 5천원 · 1만원 · 10만원
// - 순위판의 지난 대전 TOP 10 · 지역 1위끼리 챔피언 배틀(예정)

const KAKAO_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || '';
/** ⚠️ 인천 행사 날짜 — 바뀌면 여기만 */
const EVENT_DAYS = '11/21~22';
const RESULT_DAY = '11월 22일';

const STEPS: { emoji: string; title: string; body: string }[] = [
  { emoji: '🖍️', title: '종이에 곤충 그리기', body: '아이가 상상한 곤충을 자유롭게 그려요. 진하고 크게 그릴수록 AI가 더 잘 알아봐요.' },
  {
    emoji: '📷',
    title: '종이 오른쪽 위 QR 찍기',
    body: 'QR을 찍고 이름·능력을 고른 뒤, 마지막에 그림을 사진으로 찍으면 AI가 멋진 곤충 카드로 바꿔줘요. 마음에 안 들면 2회 더 다시 만들 수 있어요.',
  },
  {
    emoji: '⚔️',
    title: '수액을 차지하는 배틀',
    body: '1게임 = 랭킹 3위→2위→1위에 도전하는 배틀 3판 + 내가 고른 곤충과 연습 1판. 배틀 중 ⚡필살기 버튼을 타이밍 맞춰 누르면 더 세져요. 랭커를 이기면 그 순위를 차지해요.',
  },
  {
    emoji: '⏳',
    title: '다시 도전',
    body: '5천원은 30분 뒤에 다시 도전할 수 있어요. 1만원·10만원은 기다림 없이 연달아 할 수 있어요. 다시 할수록 레벨이 올라 더 강해져요.',
  },
  {
    emoji: '🏅',
    title: '뱃지 모으기',
    body: '배틀을 하면서 뱃지(업적)를 모아요. 모은 개수에 따라 곤충이 더 강해져요.',
  },
];

export default function IncheonGuidePage() {
  // 대전 뱃지 실물 선물은 인천에서 정해지지 않아 뺐다 (Jin 확인 대기)
  const milestones = BADGE_MILESTONES.filter((m) => !m.title.includes('대전'));
  return (
    <main className="min-h-screen max-w-md mx-auto px-5 py-8 flex flex-col gap-6" style={{ wordBreak: 'keep-all' }}>
      <div className="flex flex-col items-center gap-2 text-center">
        <BrandLogo size={88} />
        <h1 className="text-2xl font-black">{GAME_TITLE}</h1>
        <p className="font-bold text-amber-300">{CURRENT_EVENT.name}</p>
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
        <p className="font-black">🎟️ 참가권</p>
        <div className="mt-2 flex flex-col gap-3">
          {SELL_ORDER.map((key) => {
            const tier = TIERS[key];
            return (
              <div key={key} className="text-sm">
                <p className="font-bold text-base">
                  {tier.emoji} {tier.price} · {tier.label ?? tier.name}
                </p>
                <p className="text-slate-400">{tier.perks.join(' · ')}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-slate-800/80 rounded-2xl p-4">
        <p className="font-black">🏆 랭킹 시상 ({EVENT_DAYS} 이틀 합산 · 1~5위)</p>
        <ul className="mt-2 text-sm text-slate-300 flex flex-col gap-2">
          {RANKING_REWARDS.slice(0, 3).map((r) => (
            <li key={r.rank}>
              <b className="text-amber-300">
                {r.emoji} {r.rank}
              </b>{' '}
              · {r.text}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-slate-300">결과는 {RESULT_DAY} 행사가 끝나면 곤충본부 액티비티 카카오톡 채널로 알려드려요. 채널을 꼭 친구 추가해주세요!</p>
      </section>

      <section className="bg-amber-400/15 border border-amber-400/40 rounded-2xl p-4 text-sm leading-relaxed">
        <p className="font-black text-amber-200">👑 지역 챔피언 배틀 (예정)</p>
        <p className="mt-1">{PAST_EVENT.short}·{CURRENT_EVENT.short} 등 <b>각 지역 1위끼리</b> 따로 겨루는 챔피언 배틀 이벤트를 준비하고 있어요. 자세한 내용은 카카오톡 채널로 알려드릴게요.</p>
        <p className="mt-2">📺 부스 순위판에는 인천 순위와 함께 <b>지난 {PAST_EVENT.short} 행사 TOP 10</b>(공격력)도 보여요.</p>
      </section>

      <section className="bg-slate-800/80 rounded-2xl p-4">
        <p className="font-black">🎁 뱃지 개수 보상</p>
        <ul className="mt-2 text-sm text-slate-300 flex flex-col gap-1">
          {milestones.map((m) => (
            <li key={`${m.count}-${m.title}`}>
              <b className="text-amber-300">{m.count}개</b> · {m.emoji} {m.title}
            </li>
          ))}
        </ul>
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
    </main>
  );
}
