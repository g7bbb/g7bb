'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { BrandLogo } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';
import { SITE_URL } from '@/lib/site';

// 부스 태블릿에 띄워두는 "내 폰으로 하기" QR 화면 (2026-10-02 Jin).
// QR 은 화면 주소가 아니라 SITE_URL 로 만든다 — 어디서 열어도 진짜 앱 주소가 나온다 (lib/site.ts).
export default function QrPage() {
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(SITE_URL, { margin: 1, width: 720, color: { dark: '#020617', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, []);

  return (
    <main
      className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center gap-5 px-6 py-8 text-center"
      style={{ wordBreak: 'keep-all' }}
    >
      <BrandLogo size={110} />
      <h1 className="text-2xl font-black">{GAME_TITLE}</h1>
      <p className="text-xl font-black text-amber-300">📱 내 폰으로 하고 싶으면 찍어봐!</p>

      <div className="bg-white rounded-3xl p-4 shadow-2xl">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`${SITE_URL} QR`} className="w-64 h-64" />
        ) : (
          <div className="w-64 h-64 flex items-center justify-center text-slate-500">QR 만드는 중...</div>
        )}
      </div>
      <p className="text-sm text-slate-400">{SITE_URL.replace(/^https?:\/\//, '')}</p>

      <p className="text-sm text-slate-300">
        카메라 앱을 켜고 네모 칸을 비추면 돼.
        <br />
        종이에 있는 QR 을 찍어도 바로 시작할 수 있어!
      </p>

      <Link href="/start" className="w-full bg-emerald-500 text-slate-900 font-black py-4 rounded-2xl text-lg">
        🎮 이 태블릿으로 시작하기
      </Link>
    </main>
  );
}
