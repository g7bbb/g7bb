'use client';

import { useEffect, useState } from 'react';
import TransformShow from '@/app/transform-show';
import { SHOW_PAIRS } from '@/lib/transform-show';
import { useWakeLock } from '@/lib/wake-lock';
import { EVENT_LIVE } from '@/lib/event-mode';

// 🪄 /show — "그림 → AI 곤충" 변신 쇼만 끝없이 (모니터·노트북에 틀어두는 용, 11/21 Jin)
// /show?scene=prompt — 맨 끝 "AI 프롬프트 연습" 장면만 (미리보기용)
export default function ShowPage() {
  useWakeLock(EVENT_LIVE);
  const [only, setOnly] = useState<'prompt' | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('scene') === 'prompt') setOnly('prompt');
    setReady(true);
  }, []);
  if (!ready) return null;
  return <TransformShow pairs={SHOW_PAIRS} loop only={only} />;
}
