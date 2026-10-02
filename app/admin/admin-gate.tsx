'use client';

import { useEffect, useState } from 'react';
import { readAdminCode, rememberAdminCode } from '@/lib/ticket-pin-client';

// 직원 화면 공통 암호 문 (ADMIN_CODE). 심사·참가권 화면과 같은 방식이고, 한 번 들어가면 그 탭에서는 다시 안 묻는다.
// RLS 가 꺼진 베타라 데이터를 지키는 장치는 아니고, 아이들이 실수로 들어오는 걸 막는 용도다.

export default function AdminGate({ title, children }: { title: string; children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [code, setCode] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    try {
      // 암호 자체도 기억돼 있어야 통과 (비밀번호 목록을 받을 때 쓴다 — 10/2 전에 들어온 탭은 한 번 더 묻는다)
      if (window.sessionStorage.getItem('insect-battle-admin') === 'ok' && readAdminCode()) setAuthed(true);
    } catch {
      // 저장소가 막혀 있으면 매번 암호를 다시 입력하면 됩니다.
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    const res = await fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setAuthError(data?.error || '암호가 맞지 않아요.');
      return;
    }
    try {
      window.sessionStorage.setItem('insect-battle-admin', 'ok');
      rememberAdminCode(code);
    } catch {
      // 저장 실패는 무시합니다.
    }
    setAuthed(true);
  }

  if (authed) return <>{children}</>;

  return (
    <main className="max-w-sm mx-auto min-h-screen flex flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-bold text-center">🔒 {title}</h1>
      <form onSubmit={handleLogin} className="flex flex-col gap-3">
        <input
          type="password"
          className="bg-slate-800 rounded-xl px-4 py-3"
          placeholder="운영자 암호"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {authError && <p className="text-red-400 text-sm text-center">{authError}</p>}
        <button className="bg-emerald-500 text-slate-900 font-bold py-3 rounded-xl">들어가기</button>
      </form>
    </main>
  );
}
