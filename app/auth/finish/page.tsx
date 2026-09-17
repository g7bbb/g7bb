'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function FinishInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      // 구글/매직링크 리다이렉트 직후에는 세션이 막 생기는 순간이라, 이벤트로도 한 번 더 감지합니다.
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) run(session.user.id, session.user.email ?? null);
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) await run(session.user.id, session.user.email ?? null);

      async function run(userId: string, email: string | null) {
        if (cancelled) return;
        const nickname = params.get('nickname');
        const consent = params.get('consent') === '1';
        if (!nickname) {
          setError('닉네임 정보가 없어요. 처음부터 다시 시도해주세요.');
          return;
        }

        const { error: upsertError } = await supabase.from('players').upsert({
          id: userId,
          display_name: nickname,
          email,
          marketing_consent: consent,
        });

        if (cancelled) return;
        if (upsertError) {
          setError(upsertError.message);
          return;
        }
        router.replace('/');
      }

      return () => sub.subscription.unsubscribe();
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <p className="text-red-400">{error}</p>
          <a href="/signup" className="text-sky-400 underline">
            다시 시도하기
          </a>
        </>
      ) : (
        <p className="text-slate-400">로그인 마무리하는 중...</p>
      )}
    </main>
  );
}

export default function AuthFinishPage() {
  return (
    <Suspense fallback={null}>
      <FinishInner />
    </Suspense>
  );
}
