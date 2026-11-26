'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { BrandLogo } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';
import { SITE_URL } from '@/lib/site';
import { useExperienceMode } from '@/lib/experience';

// 부스 태블릿에 띄워두는 "내 폰으로 하기" QR 화면 (2026-10-02 Jin).
// QR 은 화면 주소가 아니라 SITE_URL 로 만든다 — 어디서 열어도 진짜 앱 주소가 나온다 (lib/site.ts).
// 🧪 체험 모드(11/26 Jin): 직원이 큰 화면에 띄움 → 아이가 폰으로 찍고 → 종이 QR → 곤충 만들기 → 내 카드. 큰 화면에 맞게 크게.
export default function QrPage() {
  const exp = useExperienceMode();
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(SITE_URL, { margin: 1, width: 720, color: { dark: '#020617', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, []);

  if (exp)
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-[2.4vmin] px-6 py-[3vmin] text-center" style={{ wordBreak: 'keep-all' }}>
        <BrandLogo size={90} />
        <h1 className="text-[6vmin] font-black leading-tight">
          📱 내 폰으로 <span className="text-amber-300">AI 곤충</span> 만들기!
        </h1>
        <div className="bg-white rounded-[3vmin] p-[2vmin] shadow-2xl">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`${SITE_URL} QR`} className="w-[min(44vmin,80vw)] h-[min(44vmin,80vw)]" />
          ) : (
            <div className="w-[44vmin] h-[44vmin] flex items-center justify-center text-slate-500">QR 만드는 중...</div>
          )}
        </div>
        <p className="text-[2.6vmin] text-slate-400">{SITE_URL.replace(/^https?:\/\//, '')}</p>
        <ol className="flex flex-wrap justify-center gap-[1.6vmin] text-[3vmin] font-black">
          <li className="rounded-2xl bg-slate-800 px-[2.4vmin] py-[1.2vmin]">① 폰 카메라로 이 QR 찍기</li>
          <li className="rounded-2xl bg-slate-800 px-[2.4vmin] py-[1.2vmin]">② 📷 내 종이 QR 찍기</li>
          <li className="rounded-2xl bg-slate-800 px-[2.4vmin] py-[1.2vmin]">③ 곤충 만들기</li>
          <li className="rounded-2xl bg-emerald-600 px-[2.4vmin] py-[1.2vmin]">④ 🃏 내 곤충 카드 완성!</li>
        </ol>
        <p className="text-[2.4vmin] text-slate-300">💡 내 종이 QR 을 폰 카메라로 바로 찍어도 돼!</p>
      </main>
    );

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
