'use client';

import AttractShow from './attract/attract-show';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentPlayer, signOut } from '@/lib/session';
import { normalizeTicket, displayTicket } from '@/lib/ticket';
import { Player } from '@/lib/types';
import { BrandLogo } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';
import QrScanner from '@/app/start/qr-scanner';

const KAKAO_URL = process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL || '';

// 첫 화면 공지 · 다음 시리즈 예고 (2026-10-01 Jin). 문구는 여기만 고치면 된다.
const HOME_NOTICE = '친구나 가족과 함께하면 더 강해져!!';
const COMING_SOON = 'G7BB 시리즈 커밍순! (27년 초 앱출시 예정)';
// 로고 그림은 public/series/ 에 넣으면 바로 그 그림이 나온다 (없으면 이모지 동그라미).
const NEXT_SERIES: { emoji: string; name: string; from: string; to: string; img: string }[] = [
  { emoji: '🌱', name: '식물 버전', from: '#22c55e', to: '#14532d', img: '/series/plant.jpg' },
  { emoji: '🐟', name: '어류 버전', from: '#38bdf8', to: '#1e3a8a', img: '/series/fish.jpg' },
  { emoji: '🦖', name: '공룡 버전', from: '#f97316', to: '#7c2d12', img: '/series/dino.jpg' },
];

function SeriesLogo({ v }: { v: (typeof NEXT_SERIES)[number] }) {
  const [hasImg, setHasImg] = useState(true);
  return (
    <div
      className="relative w-24 h-24 rounded-full overflow-hidden flex flex-col items-center justify-center shadow-lg ring-2 ring-white/25"
      style={{ background: `radial-gradient(circle at 35% 30%, ${v.from}, ${v.to})` }}
    >
      {hasImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v.img} alt={v.name} className="absolute inset-0 w-full h-full object-cover" onError={() => setHasImg(false)} />
      ) : (
        <>
          <span className="text-4xl leading-none">{v.emoji}</span>
          <span className="mt-0.5 text-[0.5625rem] font-black text-white/90 tracking-wider">G7BB</span>
        </>
      )}
    </div>
  );
}

/** 📺 첫 화면에서 아무도 안 만지면 홍보 영상을 트는 시간 */
const ATTRACT_AFTER_MS = 60_000;

function HomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [copied, setCopied] = useState(false);
  // 📷 화면 안에서 종이 QR 찍기 (부스 태블릿 카메라가 QR 을 못 읽어서, 10/3 Jin)
  const [scanning, setScanning] = useState(false);
  // 📺 대기 화면 홍보 영상 (10/3 밤 Jin) — 아무도 로그인 안 했고 1분 동안 아무도 안 만지면 저절로 튼다. 누르면 멈춤.
  const [attract, setAttract] = useState(false);
  useEffect(() => {
    if (player || scanning || attract) return;
    let last = Date.now();
    const poke = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'input'];
    events.forEach((e) => window.addEventListener(e, poke, { passive: true, capture: true }));
    const id = window.setInterval(() => {
      if (Date.now() - last >= ATTRACT_AFTER_MS) setAttract(true);
    }, 2000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, poke, { capture: true } as any));
      window.clearInterval(id);
    };
  }, [player, scanning, attract]);

  // 종이 QR이 첫 화면을 향하더라도 번호를 들고 시작 화면으로 넘겨줍니다.
  useEffect(() => {
    const fromUrl = params.get('t');
    const normalized = fromUrl ? normalizeTicket(fromUrl) : null;
    if (normalized) {
      const k = (params.get('k') ?? '').replace(/\D/g, '');
      router.replace(`/start?t=${normalized}${k ? `&k=${k}` : ''}`);
      return;
    }
    getCurrentPlayer().then(setPlayer);
  }, [params, router]);

  async function copyTicket() {
    if (!player?.ticket_code) return;
    try {
      await navigator.clipboard.writeText(displayTicket(player.ticket_code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사가 막힌 브라우저에서는 화면의 번호를 직접 보고 입력하면 됩니다.
    }
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col justify-center gap-6 px-6 py-10">
      {attract && <AttractShow onClose={() => setAttract(false)} />}
      <div className="text-center">
        <BrandLogo size={150} />
        <h1 className="mt-4 text-2xl font-bold" style={{ wordBreak: 'keep-all' }}>
          {GAME_TITLE}
        </h1>
        {player ? (
          <p className="mt-2 text-slate-300">{player.display_name}, 반가워!</p>
        ) : (
          <p className="mt-2 text-slate-400" style={{ wordBreak: 'keep-all' }}>곤충을 다 그렸으면 종이의 QR을 찍어서 시작해!</p>
        )}
      </div>

      {scanning && <QrScanner onClose={() => setScanning(false)} />}
      {!player ? (
        <div className="flex flex-col gap-3">
          {/* 📷 버튼 바로 위 안내 (10/3 Jin: "종이 오른쪽 위에 QR을 찍어줘!!! 이렇게") */}
          <div className="bg-amber-400/15 border-2 border-amber-300 rounded-2xl px-4 py-3 text-center" style={{ wordBreak: 'keep-all' }}>
            <p className="text-xl font-black text-amber-200">📄 종이 오른쪽 위에 QR을 찍어줘!!!</p>
            <p className="mt-1 text-sm text-amber-100">아래 초록 버튼을 누르고, 종이 오른쪽 위 QR을 카메라에 비춰줘</p>
          </div>
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="block text-center bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black py-4 rounded-2xl text-lg"
          >
            📷 종이 QR 찍고 시작하기
          </button>
          <Link
            href="/start"
            className="block text-center bg-slate-800 text-slate-200 font-bold py-3 rounded-2xl"
          >
            🎫 시작하기
          </Link>
        </div>
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
            ⚔️ G7BB 배틀
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
          <Link
            href="/badges"
            className="block text-center bg-violet-400 hover:bg-violet-300 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            🏅 내 뱃지
          </Link>
          {/* 👋 바로 로그아웃 (10/3 Jin: "로그아웃 안 된 태블릿, 직원이 누를 키가 없어") — 다음 친구 차례 */}
          <button
            type="button"
            onClick={() => {
              signOut();
              setPlayer(null);
            }}
            className="block text-center bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold py-3 rounded-2xl"
          >
            👋 {player.display_name} 끝내기 (다음 친구 차례)
          </button>
        </div>
      )}

      {/* 공지 — 번호 있는 아이·없는 아이 모두 */}
      <p
        className="text-center text-lg font-black text-amber-300 bg-amber-400/10 border-2 border-amber-400/50 rounded-2xl px-4 py-3"
        style={{ wordBreak: 'keep-all' }}
      >
        👨‍👩‍👧 {HOME_NOTICE}
      </p>

      {/* 상품 발표는 카카오톡 채널로만 하므로, 번호를 채널로 보내도록 크게 안내합니다. */}
      {player && (
        <section className="bg-slate-800 rounded-2xl p-5 flex flex-col gap-3 text-center">
          <p className="text-sm text-slate-300">
            🏅 상품 발표는 <span className="font-bold text-yellow-300">카카오톡 채널</span>에서 해!
            <br />
            채널을 추가하고 <span className="font-bold">내 번호</span>를 보내줘!
          </p>

          <button
            onClick={copyTicket}
            className="bg-slate-900 rounded-xl py-3 text-2xl font-bold tracking-widest"
          >
            {displayTicket(player.ticket_code)}
            <span className="block text-xs font-normal text-slate-400 tracking-normal mt-1">
              {copied ? '✓ 복사됐어!' : '눌러서 번호 복사'}
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
            채널에 번호를 안 보내면 당첨돼도 연락을 못 해!
          </p>
        </section>
      )}

      {/* 다음 시리즈 예고 — 맨 아래 */}
      <section className="mt-4 text-center" style={{ wordBreak: 'keep-all' }}>
        <p className="text-sm font-black tracking-wide text-slate-300">🚀 {COMING_SOON}</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {NEXT_SERIES.map((v) => (
            <div key={v.name} className="flex flex-col items-center gap-1.5">
              <SeriesLogo v={v} />
              <span className="text-xs font-bold text-slate-200">{v.name}</span>
            </div>
          ))}
        </div>
      </section>
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
