'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { setSession } from '@/lib/session';

export default function SignupPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleanId = loginId.trim();
    const cleanName = displayName.trim();
    if (!cleanId || !cleanName) {
      setError('아이디와 이름(닉네임)을 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from('players')
        .select('id, login_id, display_name')
        .eq('login_id', cleanId)
        .maybeSingle();

      if (existing) {
        setSession({ id: existing.id, loginId: existing.login_id, displayName: existing.display_name });
        router.push('/');
        return;
      }

      const { data: created, error: insertError } = await supabase
        .from('players')
        .insert({ login_id: cleanId, display_name: cleanName })
        .select()
        .single();

      if (insertError) throw insertError;

      setSession({ id: created.id, loginId: created.login_id, displayName: created.display_name });
      router.push('/');
    } catch (err: any) {
      setError(err.message || '오류가 발생했어요. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold text-center">🙋 아이디 만들기</h1>
      <p className="text-sm text-slate-400 text-center">
        이미 만든 아이디를 입력하면 그대로 이어서 사용할 수 있어요.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          className="bg-slate-800 rounded-xl px-4 py-3 text-lg"
          placeholder="아이디 (예: bug_master)"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
        />
        <input
          className="bg-slate-800 rounded-xl px-4 py-3 text-lg"
          placeholder="이름 또는 별명"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
        >
          {loading ? '처리 중...' : '시작하기'}
        </button>
      </form>
    </main>
  );
}
