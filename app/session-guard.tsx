'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AUTO_SIGNOUT_MS, getCurrentPlayer, hasStoredPlayer, markGameOver, readGameOverAt, signOut } from '@/lib/session';
import { gameIsOver, repairLadderRun } from '@/lib/game-state';

// 🏁 게임이 끝나면 자동 로그아웃 (2026-10-02 Jin: "게임했던 태블릿에 기존 사용자가 계속 떠 있네").
// 배틀 화면이 게임 끝에 시각을 적어두면(markGameOver), 어느 화면에 있든 90초 뒤 로그아웃하고 첫 화면으로 보낸다.
// 랭킹·뱃지 화면으로 옮겨가도 시계가 이어지게 layout 에 붙여 둔다. 남은 시간은 왼쪽 아래에 보여준다.
// 직원 화면·종이·QR 화면에서는 아무것도 안 한다.
const SKIP = ['/admin', '/print', '/qr', '/live'];

// 💤 아무것도 안 누르고 이만큼 지나면 로그아웃 (10/3 Jin: "횟수를 다 안 쓰고 간 사람들은 로그아웃하고, 나중에 QR 로 다시 들어오게")
// 배틀 한 판·AI 그림 만들기는 1분 안쪽이라 3분이면 넉넉하다. 마지막 30초는 "계속할게" 버튼을 띄운다.
const IDLE_MS = 3 * 60_000;
const IDLE_WARN_MS = 30_000;

export default function SessionGuard() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const [idleLeft, setIdleLeft] = useState<number | null>(null);
  const lastActive = useRef(Date.now());
  const skip = SKIP.some((p) => pathname.startsWith(p));

  // 🛟 10/3 Jin "게임이 끝났는데 로그아웃이 안 돼": 배틀 화면이 게임 끝을 못 적은 경우(중간에 나감 등)를 위한 그물.
  // 배틀 화면이 아닌 곳에서, 이 아이가 **지금 할 수 있는 게 없으면**(게임 다 씀 · 30분 대기 중) 시계를 켠다.
  // 배틀 화면은 싸우는 도중에 꺼지면 안 되니 거기서는 배틀 화면이 직접 정한다.
  useEffect(() => {
    if (skip || pathname.startsWith('/battle')) return;
    let cancelled = false;
    getCurrentPlayer()
      .then(async (p) => {
        if (cancelled || !p || readGameOverAt()) return;
        // 판 수가 안 적힌 옛 랭킹 도전은 battles 로 되살린 뒤 판단한다 (lib/game-state.ts)
        p = await repairLadderRun(p);
        if (cancelled) return;
        // 🔁 10/3 오후: 연습 1판이 남아 있어도 랭킹 도전을 못 하면 '게임 끝' (연습은 덤)
        // 🔁 10/3 저녁 Jin "개미귀신태하도 로그아웃 안 됐어": 마지막 게임의 랭킹 도전 3판을 다 했으면 횟수가 남아도 '이번 게임 끝'.
        // 🔁 10/3 밤 Jin "1만원 아이가 연습·1판만 하면 끝나버려": 연습만 했거나 랭킹 도전 판이 남았으면 아직 아님 → gameIsOver
        if (gameIsOver(p)) markGameOver();
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

  // 💤 자리를 떠난 아이 — 누르거나 화면을 옮기면 시계가 처음부터
  useEffect(() => {
    lastActive.current = Date.now();
    setIdleLeft(null);
    if (skip) return;
    const poke = () => {
      lastActive.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, poke, { passive: true, capture: true }));
    const id = window.setInterval(() => {
      if (!hasStoredPlayer() || readGameOverAt()) {
        setIdleLeft(null);
        return;
      }
      const remain = lastActive.current + IDLE_MS - Date.now();
      if (remain <= 0) {
        signOut();
        setIdleLeft(null);
        router.push('/');
        return;
      }
      setIdleLeft(remain <= IDLE_WARN_MS ? Math.ceil(remain / 1000) : null);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, poke, { capture: true } as any));
      window.clearInterval(id);
    };
  }, [skip, pathname, router]);

  if (left === null && idleLeft !== null) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-[95] flex items-center justify-between gap-2 rounded-2xl bg-slate-900/95 border-2 border-amber-300 px-4 py-3 shadow-xl">
        <span className="font-bold text-amber-200" style={{ wordBreak: 'keep-all' }}>
          👀 아무도 없어? {idleLeft}초 뒤 로그아웃할게
        </span>
        <button
          onClick={() => {
            lastActive.current = Date.now();
            setIdleLeft(null);
          }}
          className="shrink-0 rounded-xl bg-emerald-500 text-slate-900 font-black px-4 py-2"
        >
          계속할게!
        </button>
      </div>
    );
  }

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
