'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentPlayer } from '@/lib/session';
import { loadBadgeSnapshot } from '@/lib/badge-state';
import { BADGE_MILESTONES, COUNTED_TOTAL } from '@/lib/badges';
import { BrandMark } from '@/app/brand-logo';

// 📖 뱃지를 모아봐! (강력 설명서) — 2026-10-01 Jin.
// 뱃지 개수마다 받는 선물·버프를 알려준다. 숫자는 lib/badges.ts 한 곳에서 온다.
// 어디서 들어왔든 "← 돌아가기"(바로 전 화면) 와 "🏠 처음 화면" 으로 나갈 수 있다.

const TIPS: [string, string][] = [
  ['⚔️', '배틀에서 이기기 — 첫 승리 · 5승 · 10승'],
  ['🦌', '여섯 종류 곤충을 하나씩 이겨보기 — 다 이기면 🏆 도장 깨기!'],
  ['✨', '필살기 버튼을 퍼펙트 타이밍에 누르기'],
  ['🔁', 'QR 로 다시 와서 곤충 키우기 · 레벨 올리기'],
  ['🥇', '랭킹 1~3위 안에 들어가 보기'],
  ['💖', '갤러리에서 친구들한테 하트 받기'],
  ['🧬', '종이에 턱·날개·다리·더듬이·발톱을 더 그려서 특별 진화하기'],
];

export default function BadgeGuidePage() {
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getCurrentPlayer();
      if (!p) return; // 번호 없이 들어와도 설명은 볼 수 있다
      setCount((await loadBadgeSnapshot(p)).count);
    })().catch(() => setCount(null));
  }, []);

  function goBack() {
    // 들어온 화면이 주소에 적혀 있다 (`?from=/battle`). 없거나 이상하면 뱃지 화면으로.
    // (history 로 뒤로 가면 QR·링크로 바로 열었을 때 갈 곳이 없어서 앱 밖으로 나가 버린다)
    let from = '/badges';
    try {
      const raw = new URLSearchParams(window.location.search).get('from') ?? '';
      if (/^\/[a-z/-]*$/.test(raw) && !raw.startsWith('//')) from = raw;
    } catch {
      // 주소를 못 읽으면 뱃지 화면으로
    }
    router.push(from);
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-5 px-5 py-8" style={{ wordBreak: 'keep-all' }}>
      <h1 className="text-2xl font-black text-center leading-tight">
        <BrandMark size={32} className="mr-2 -mt-1" />
        뱃지를 모아봐!
        <span className="block text-base font-bold text-amber-300 mt-1">📖 강력 설명서</span>
      </h1>

      {count !== null && (
        <p className="text-center text-lg">
          지금 내 뱃지 <b className="text-amber-300 text-2xl">{count}</b>
          <span className="text-slate-400"> / {COUNTED_TOTAL}개</span>
        </p>
      )}

      <section className="flex flex-col gap-3">
        {Array.from(new Set(BADGE_MILESTONES.map((m) => m.count))).map((n) => {
          const items = BADGE_MILESTONES.filter((m) => m.count === n);
          const done = count !== null && count >= n;
          return (
            <div
              key={n}
              className={`rounded-2xl p-4 flex gap-4 items-center ${done ? 'bg-emerald-900/50 ring-2 ring-emerald-400' : 'bg-slate-800'}`}
            >
              <div className="shrink-0 w-16 text-center">
                <p className="text-3xl font-black text-amber-300 leading-none">{n === COUNTED_TOTAL ? '전부' : n}</p>
                <p className="text-xs text-slate-400 mt-1">{n === COUNTED_TOTAL ? `${n}개` : '개 모으면'}</p>
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                {items.map((m) => (
                  <p key={m.title} className="text-base">
                    <span className="mr-1">{m.emoji}</span>
                    <b className={m.kind === 'gift' ? 'text-pink-300' : 'text-emerald-300'}>{m.title}</b>
                    <span className="block text-sm text-slate-300">{m.text}</span>
                  </p>
                ))}
              </div>
              {done && <span className="text-2xl">✅</span>}
            </div>
          );
        })}
      </section>

      <div className="bg-slate-800 rounded-2xl p-4 text-sm text-slate-200 flex flex-col gap-1.5">
        <p className="font-bold text-amber-300">💪 버프는 쌓여!</p>
        <p>뱃지 20개를 모으면 HP·수비력·필살기 버프를 <b>셋 다</b> 받아. 배틀할 때 저절로 들어가.</p>
        <p className="text-xs text-slate-400">🎁 선물은 부스 선생님께 내 뱃지 화면을 보여주면 받을 수 있어.</p>
        <p className="text-xs text-slate-400">골드·다이아 회원 뱃지는 개수에 안 들어가.</p>
      </div>

      <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-2">
        <p className="font-bold">🔎 뱃지는 이렇게 모아!</p>
        {TIPS.map(([e, t]) => (
          <p key={t} className="text-sm text-slate-200">
            <span className="mr-1.5">{e}</span>
            {t}
          </p>
        ))}
      </div>

      <div className="flex gap-2 sticky bottom-3">
        <button onClick={goBack} className="flex-1 bg-slate-700 font-bold py-3.5 rounded-xl shadow-lg">
          ← 돌아가기
        </button>
        <button onClick={() => router.push('/')} className="flex-1 bg-emerald-500 text-slate-900 font-bold py-3.5 rounded-xl shadow-lg">
          🏠 처음 화면
        </button>
      </div>
    </main>
  );
}
