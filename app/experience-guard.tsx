'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { EVENT_ONLY_PATHS, fetchExperienceMode } from '@/lib/experience';

// 🧪 체험 모드면 행사용 화면(배틀·랭킹·뱃지…)을 주소로 열어도 첫 화면으로 돌려보낸다 (lib/experience.ts)
export default function ExperienceGuard() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!pathname || !EVENT_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return;
    let alive = true;
    void fetchExperienceMode().then((on) => {
      if (alive && on) router.replace('/');
    });
    return () => {
      alive = false;
    };
  }, [pathname, router]);
  return null;
}
