import Link from 'next/link';
import { BrandLogo } from '@/app/brand-logo';

// 🐞 곤충본부 소개 (2026-10-02 Jin) — 종이 아래 "② 곤충본부는 뭐 하는 데예요?" QR 이 여는 화면.
// ⚠️ **초안이다.** Claude 가 대화에서 들은 것만으로 썼다 — Jin 이 실제 소개 글·사진·링크(인스타·홈페이지)를 주면 바꿀 것.
// 종이를 뽑은 뒤에도 이 파일만 고치면 내용이 바뀐다 (QR 은 주소만 담고 있다).
// 보호자가 읽는 화면이라 존댓말.

const KAKAO_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || '';

const ITEMS: { emoji: string; title: string; body: string }[] = [
  { emoji: '🌙', title: '여름 · 야간 곤충채집', body: '밤 숲에서 아이들과 함께 살아있는 곤충을 직접 찾아봐요.' },
  { emoji: '🐛', title: '봄·가을·겨울 · 애벌레 채집', body: '계절마다 숨어 있는 애벌레를 찾고, 곤충이 자라는 과정을 배워요.' },
  { emoji: '🪲', title: '곤충 체험 · 사육', body: '사슴벌레·장수풍뎅이 같은 곤충을 가까이에서 만나고 직접 길러볼 수 있어요.' },
  { emoji: '🎮', title: 'G7BB 배틀', body: '아이가 그린 곤충이 AI로 살아나 배틀하는 체험. 2027년 초에는 식물·어류·공룡 버전도 나올 예정이에요.' },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen max-w-md mx-auto px-5 py-8 flex flex-col gap-6" style={{ wordBreak: 'keep-all' }}>
      <div className="flex flex-col items-center gap-2 text-center">
        <BrandLogo size={120} />
        <h1 className="text-2xl font-black">곤충본부 (God of Bugs)</h1>
        <p className="text-slate-300 leading-relaxed">
          아이들이 곤충을 직접 보고, 만지고, 상상하며
          <br />
          자연을 좋아하게 되는 체험을 만들어요 🐞
        </p>
      </div>

      <section className="flex flex-col gap-3">
        {ITEMS.map((item) => (
          <div key={item.title} className="bg-slate-800/80 rounded-2xl p-4 flex gap-3">
            <span className="text-3xl leading-none">{item.emoji}</span>
            <div>
              <p className="font-black">{item.title}</p>
              <p className="mt-1 text-sm text-slate-300 leading-relaxed">{item.body}</p>
            </div>
          </div>
        ))}
      </section>

      {KAKAO_URL ? (
        <a href={KAKAO_URL} target="_blank" rel="noreferrer" className="bg-yellow-300 text-slate-900 font-black text-center py-4 rounded-2xl">
          💬 카카오톡 채널에서 다음 체험 소식 받기
        </a>
      ) : (
        <p className="text-center text-sm text-slate-400">다음 체험 소식은 부스에서 카카오톡 채널을 추가하면 받아볼 수 있어요.</p>
      )}
      <Link href="/guide" className="text-center text-sm text-slate-400 underline">
        ← 게임 설명 보기
      </Link>
    </main>
  );
}
