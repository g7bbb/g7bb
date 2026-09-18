'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentPlayer } from '@/lib/session';
import { normalizeTicket } from '@/lib/ticket';
import { Player } from '@/lib/types';

const KAKAO_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || '';

function HomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [copied, setCopied] = useState(false);

  // 종이 QR이 첫 화면을 향하더라도 번호를 들고 시작 화면으로 넘겨줍니다.
  useEffect(() => {
    const fromUrl = params.get('t');
    const normalized = fromUrl ? normalizeTicket(fromUrl) : null;
    if (normalized) {
      router.replace(`/start?t=${normalized}`);
      return;
    }
    getCurrentPlayer().then(setPlayer);
  }, [params, router]);

  async function copyTicket() {
    if (!player?.ticket_code) return;
    try {
      await navigator.clipboard.writeText(player.ticket_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사가 막힌 브라우저에서는 화면의 번호를 직접 보고 입력하면 됩니다.
    }
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold">🐛 곤충 배틀 베타</h1>
        {player ? (
          <p className="mt-2 text-slate-300">{player.display_name}님, 환영해요!</p>
        ) : (
          <p className="mt-2 text-slate-400">종이에 적힌 번호로 시작해요</p>
        )}
      </div>

      {!player ? (
        <Link
          href="/start"
          className="block text-center bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-4 rounded-2xl text-lg"
        >
          🎫 번호 넣고 시작하기
        </Link>
      ) : (
        <div className="flex flex-col gap-4">
          <Link
            href="/upload"
            className="block text-center bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            📸 내 곤충 만들기
          </Link>
          <Link
            href="/battle"
            className="block text-center bg-sky-500 hover:bg-sky-400 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            ⚔️ 곤충 배틀
          </Link>
          <Link
            href="/gallery"
            className="block text-center bg-pink-500 hover:bg-pink-400 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            🎨 친구들 곤충 구경하기
          </Link>
          <Link
            href="/ranking"
            className="block text-center bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            🏆 랭킹 보기
          </Link>
        </div>
      )}

      {/* 상품 발표는 카카오톡 채널로만 하므로, 번호를 채널로 보내도록 크게 안내합니다. */}
      {player && (
        <section className="bg-slate-800 rounded-2xl p-5 flex flex-col gap-3 text-center">
          <p className="text-sm text-slate-300">
            🏅 상품 발표는 <span className="font-bold text-yellow-300">카카오톡 채널</span>에서 해요!
            <br />
            채널을 추가하고 <span className="font-bold">내 번호</span>를 보내주세요.
          </p>

          <button
            onClick={copyTicket}
            className="bg-slate-900 rounded-xl py-3 text-2xl font-bold tracking-widest"
          >
            {player.ticket_code}
            <span className="block text-xs font-normal text-slate-400 tracking-normal mt-1">
              {copied ? '✓ 복사됐어요!' : '눌러서 번호 복사'}
            </span>
          </button>

          {KAKAO_URL && (
            <a
              href={KAKAO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-yellow-400 text-slate-900 font-bold py-3 rounded-xl"
            >
              💬 카카오톡 채널 추가하기
            </a>
          )}

          <p className="text-xs text-slate-500">
            채널에 번호를 보내지 않으면 당첨돼도 연락을 드릴 수 없어요!
          </p>
        </section>
      )}
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
