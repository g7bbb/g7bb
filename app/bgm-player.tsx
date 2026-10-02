'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { readBgmMuted, setBgmMuted, setBgmTrack, setBgmVisit, startBgm } from '@/lib/bgm';
import { getCurrentPlayer } from '@/lib/session';
import { readGameState } from '@/lib/game-state';

// 배경음악 켜기 + 오른쪽 아래 작은 🔊/🔇 버튼 (lib/bgm.ts).
// 종이 인쇄·직원 화면에서는 음악도 버튼도 없다.
export default function BgmPlayer() {
  const pathname = usePathname() ?? '/';
  const off = pathname.startsWith('/print') || pathname.startsWith('/admin');
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(readBgmMuted());
  }, []);

  // 폰은 터치한 뒤에만 소리가 나서, 첫 터치 때 시작한다.
  useEffect(() => {
    if (off) return;
    const go = () => startBgm();
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
  }, [off]);

  // 회차에 따라 평소 음악이 바뀐다 (1회차 / 2~4회차 / 5회차~). 화면을 옮길 때마다 다시 본다 — 게임을 새로 시작하면 바로 바뀌게.
  useEffect(() => {
    if (off) return;
    getCurrentPlayer()
      .then((p) => setBgmVisit(Math.max(1, readGameState(p).sessions.length)))
      .catch(() => undefined);
  }, [pathname, off]);

  // 배틀 화면은 배틀 음악, 직원·종이 화면은 끔, 나머지는 평소 음악
  useEffect(() => {
    setBgmTrack(off ? 'off' : pathname.startsWith('/battle') ? 'battle' : 'main');
  }, [pathname, off]);

  if (off) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        const next = !muted;
        setMuted(next);
        if (!next) startBgm();
        setBgmMuted(next);
      }}
      aria-label={muted ? '배경음악 켜기' : '배경음악 끄기'}
      className="fixed bottom-3 right-3 z-50 w-10 h-10 rounded-full bg-slate-800/80 border border-slate-600 text-lg flex items-center justify-center shadow-lg"
    >
      {muted ? '🔇' : '🎵'}
    </button>
  );
}
