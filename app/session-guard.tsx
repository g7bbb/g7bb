'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AUTO_SIGNOUT_MS, readGameOverAt, signOut } from '@/lib/session';

// 🏁 게임이 끝나면 자동 로그아웃 (2026-10-02 Jin: "게임했던 태블릿에 기존 사용자가 계속 떠 있네").
// 배틀 화면이 게임 끝에 시각을 적어두면(markGameOver), 어느 화면에 있든 90초 뒤 로그아웃하고 첫 화면으로 보낸다.
// 랭킹·뱃지 화면으로 옮겨가도 시계가 이어지게 layout 에 붙여 둔다. 남은 시간은 왼쪽 아래에 보여준다.
// 직원 화면·종이·QR 화면에서는 아무것도 안 한다.
const SKIP = ['/admin', '/print', '/qr'];

export default function SessionGuard() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const skip = SKIP.some((p) => pathname.startsWith(p));

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
