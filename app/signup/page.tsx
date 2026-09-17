'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 예전에는 여기서 구글/이메일 로그인을 받았지만, 부스 환경에 맞지 않아
// 종이 참가 번호 방식(/start)으로 바뀌었습니다. 옛 주소로 들어와도 헤매지 않도록 넘겨줍니다.
export default function SignupRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/start');
  }, [router]);

  return (
    <main className="max-w-md mx-auto min-h-screen flex items-center justify-center px-6">
      <p className="text-slate-400">시작 화면으로 이동 중...</p>
    </main>
  );
}
