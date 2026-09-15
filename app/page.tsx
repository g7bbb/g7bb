'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSession, PlayerSession } from '@/lib/session';

const KAKAO_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || '';

export default function HomePage() {
  const [session, setSessionState] = useState<PlayerSession | null>(null);

  useEffect(() => {
    setSessionState(getSession());
  }, []);

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold">🐛 곤충 배틀 베타</h1>
        {session ? (
          <p className="mt-2 text-slate-300">{session.displayName}님, 환영해요!</p>
        ) : (
          <p className="mt-2 text-slate-400">먼저 아이디를 만들어주세요</p>
        )}
      </div>

      {!session ? (
        <Link
          href="/signup"
          className="block text-center bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold py-4 rounded-2xl text-lg"
        >
          🙋 아이디 만들기
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
            href="/ranking"
            className="block text-center bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            🏆 랭킹 보기
          </Link>
        </div>
      )}

      {KAKAO_URL && (
        <a
          href={KAKAO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center border border-yellow-400 text-yellow-300 font-semibold py-3 rounded-2xl"
        >
          💬 카카오톡 채널에서 체험 공지 보기
        </a>
      )}
    </main>
  );
}
