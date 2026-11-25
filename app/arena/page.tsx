'use client';

import { useEffect } from 'react';
import AdminGate from '@/app/admin/admin-gate';
import { setArenaDevice } from '@/lib/arena';
import { signOut } from '@/lib/session';

// ⚔️ 배틀 태블릿 켜기 — 직원이 태블릿에서 이 주소를 열고 직원 암호를 넣으면 이 기기가 "배틀 태블릿" 이 된다 (lib/arena.ts)
export default function ArenaSetup() {
  return (
    <AdminGate title="배틀 태블릿 켜기">
      <Go />
    </AdminGate>
  );
}

function Go() {
  useEffect(() => {
    setArenaDevice(true);
    signOut(); // 앞에 남아 있던 아이 로그인은 지우고 시작
    window.location.replace('/duel');
  }, []);
  return <p className="p-10 text-center text-slate-300">⚔️ 배틀 태블릿으로 바꾸는 중…</p>;
}
