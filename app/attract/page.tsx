'use client';

import { useRouter } from 'next/navigation';
import AttractShow from './attract-show';

// 📺 노트북·모니터에 하루 종일 켜두는 홍보 영상 (g7bb.vercel.app/attract). 누르면 첫 화면으로.
export default function AttractPage() {
  const router = useRouter();
  return <AttractShow onClose={() => router.push('/')} />;
}
