'use client';

import { useEffect } from 'react';

/**
 * 📺 화면이 저절로 꺼지지 않게 (10/4 Jin: "홍보 영상이 나오는 동안 태블릿 화면이 안 꺼지게 여기서 세팅할 수 있어?").
 *
 * 브라우저의 Screen Wake Lock 기능을 쓴다 — 안드로이드 크롬(84~)·아이패드 사파리(16.4~)에서 된다. HTTPS 에서만 (vercel 은 OK).
 * - 다른 앱으로 갔다 오거나 화면을 내렸다 올리면 브라우저가 풀어버려서, 다시 보일 때 또 요청한다.
 * - 안 되는 기기면 조용히 넘어간다 (화면이 꺼질 뿐 앱은 그대로) → 그런 기기는 태블릿 설정에서 "화면 자동 꺼짐" 을 길게.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let stopped = false;
    const request = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        sentinel = await (navigator as any).wakeLock.request('screen');
      } catch {
        // 배터리 절약 모드 등으로 거절되면 그냥 넘어간다
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
