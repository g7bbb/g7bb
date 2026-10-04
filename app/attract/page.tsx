'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AttractShow from './attract-show';

// 📺 노트북·모니터에 하루 종일 켜두는 홍보 영상 (g7bb.vercel.app/attract). 누르면 첫 화면으로.
// 하루 종일 켜두면 고친 화면이 안 들어와서 10분마다 스스로 새로고침 (10/4, /live 와 같은 이유)
const RELOAD_MS = 10 * 60_000;

export default function AttractPage() {
  const router = useRouter();
  useEffect(() => {
    const id = window.setTimeout(() => window.location.reload(), RELOAD_MS);
    return () => window.clearTimeout(id);
  }, []);
  return <AttractShow onClose={() => router.push('/')} />;
}
