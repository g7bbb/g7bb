'use client';

import { ReactNode } from 'react';
import { frameShines, tierForVisit } from '@/lib/card';

// 카드 등급(기본·은·금·홀로그램) **테두리만** 다른 화면에 물려주는 껍데기입니다.
//
// Jin 요청 (2026-09-29): "게임 내 곤충 화면이랑 랭킹, 배틀에도 똑같이 적용되나?"
//
// ⚠️ **다른 화면에는 카드를 통째로 넣지 않고 테두리만 씌웁니다.**
// 배틀 화면에 능력치 5줄과 QR까지 들어가면 HP바·타격 이펙트와 뒤엉켜 뭘 봐야 할지 모르게 됩니다.
// 랭킹 20명을 카드로 깔면 스크롤이 끝없이 길어지고 무거워집니다.
// 테두리만으로도 "금색 아이는 어디서든 금색" 이라는 통일감은 그대로 살아납니다.

export default function TierFrame({
  visit,
  level,
  children,
  /** 랭킹처럼 동그란 그림을 감쌀 때 */
  round = false,
  /** 테두리 두께(px). 작은 썸네일에는 얇게. */
  width = 3,
  className = '',
}: {
  visit: number;
  /** 곤충 레벨 — LV3 은색 · LV5 금색 · LV7 다이아 테두리 (10/4 Jin) */
  level?: number | null;
  children: ReactNode;
  round?: boolean;
  width?: number;
  className?: string;
}) {
  const tier = tierForVisit(visit, level);
  const radius = round ? '9999px' : '0.85rem';

  return (
    <div
      className={`${frameShines(tier) ? 'holo-frame' : ''} ${className}`}
      style={{
        background: tier.frame,
        padding: width,
        borderRadius: radius,
        // 1회차(기본)는 테두리가 거의 안 보이게 둡니다. 2회차 은색이 "달라졌다"고 느껴져야 합니다.
        boxShadow: tier.key === 'basic' ? 'none' : '0 0 12px rgba(255,255,255,0.28)',
      }}
    >
      <div style={{ borderRadius: round ? '9999px' : '0.7rem', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
