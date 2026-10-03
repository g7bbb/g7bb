'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentPlayer } from '@/lib/session';
import { Player } from '@/lib/types';
import Returning from '@/app/start/returning';

// ⏩ 2만원 이상: 3판이 끝나면 배틀 화면의 "다음 게임 바로 시작!" 이 여기로 온다 (10/4 Jin "연달아 다 할 수 있게").
// QR 을 다시 찍지 않아도 다시 온 화면(새 곤충 / 레벨업 + 포인트)을 그대로 보여준다.
export default function NextGamePage() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    getCurrentPlayer()
      .then((p) => (p ? setPlayer(p) : setMissing(true)))
      .catch(() => setMissing(true));
  }, []);

  useEffect(() => {
    if (missing) router.replace('/start');
  }, [missing, router]);

  if (!player) {
    return <main className="max-w-md mx-auto min-h-screen flex items-center justify-center text-slate-400">불러오는 중...</main>;
  }
  return <Returning player={player} onNotMe={() => router.push('/start')} />;
}
