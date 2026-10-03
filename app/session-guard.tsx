'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AUTO_SIGNOUT_MS, getCurrentPlayer, markGameOver, readGameOverAt, signOut } from '@/lib/session';
import { playStatus } from '@/lib/game-state';

// 🏁 게임이 끝나면 자동 로그아웃 (2026-10-02 Jin: "게임했던 태블릿에 기존 사용자가 계속 떠 있네").
// 배틀 화면이 게임 끝에 시각을 적어두면(markGameOver), 어느 화면에 있든 90초 뒤 로그아웃하고 첫 화면으로 보낸다.
// 랭킹·뱃지 화면으로 옮겨가도 시계가 이어지게 layout 에 붙여 둔다. 남은 시간은 왼쪽 아래에 보여준다.
// 직원 화면·종이·QR 화면에서는 아무것도 안 한다.
const SKIP = ['/admin', '/print', '/qr', '/live'];

export default function SessionGuard() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const skip = SKIP.some((p) => pathname.startsWith(p));

  // 🛟 10/3 Jin "게임이 끝났는데 로그아웃이 안 돼": 배틀 화면이 게임 끝을 못 적은 경우(중간에 나감 등)를 위한 그물.
  // 배틀 화면이 아닌 곳에서, 이 아이가 **지금 할 수 있는 게 없으면**(게임 다 씀 · 30분 대기 중) 시계를 켠다.
  // 배틀 화면은 싸우는 도중에 꺼지면 안 되니 거기서는 배틀 화면이 직접 정한다.
  useEffect(() => {
    if (skip || pathname.startsWith('/battle')) return;
    let cancelled = false;
    getCurrentPlayer()
      .then((p) => {
        if (cancelled || !p || readGameOverAt()) return;
        const s = playStatus(p);
        if (s.used > 0 && !s.canLadder && !s.canPractice) markGameOver();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skip, pathname]);

  useEffect(() => {
    if (skip) {
      setLeft(null);
      return;
    }
    const tick = () => {
      const at = readGameOverAt();
      if (!at) {
        setLeft(null);
        return;
      }
      const remain = at + AUTO_SIGNOUT_MS - Date.now();
      if (remain <= 0) {
        signOut();
        setLeft(null);
        router.push('/');
        return;
      }
      setLeft(Math.ceil(remain / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [skip, router, pathname]);

  if (left === null) return null;

  return (
    <div className="fixed left-3 bottom-3 z-[60] flex items-center gap-2 rounded-full bg-slate-900/90 border border-slate-600 pl-4 pr-1.5 py-1.5 shadow-xl text-sm">
      <span className="font-bold text-slate-200" style={{ wordBreak: 'keep-all' }}>
        🏁 게임 끝! {left}초 뒤 로그아웃
      </span>
      <button
        onClick={() => {
          signOut();
          setLeft(null);
          router.push('/');
        }}
        className="rounded-full bg-emerald-500 text-slate-900 font-black px-3 py-1"
      >
        지금 끝내기
      </button>
    </div>
  );
}
