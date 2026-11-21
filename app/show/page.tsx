'use client';

import TransformShow from '@/app/transform-show';
import { SHOW_PAIRS } from '@/lib/transform-show';
import { useWakeLock } from '@/lib/wake-lock';
import { EVENT_LIVE } from '@/lib/event-mode';

// 🪄 /show — "그림 → AI 곤충" 변신 쇼만 끝없이 (모니터·노트북에 틀어두는 용, 11/21 Jin)
export default function ShowPage() {
  useWakeLock(EVENT_LIVE);
  return <TransformShow pairs={SHOW_PAIRS} loop />;
}
