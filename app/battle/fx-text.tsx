'use client';

import { useState } from 'react';
import { FxArt } from '@/lib/fx-art';

// 효과 글씨 한 줄. **그림이 있으면 그림, 없으면 지금까지처럼 글씨**로 나옵니다.
//
// ⚠️ 13장이 한 번에 오지 않아서 이렇게 만들었습니다.
// 그림이 빠져도 배틀은 그대로 돌아가야 합니다 — 부스에서 화면이 비면 안 됩니다.
//
// 크기는 **높이로** 맞춥니다. 글자 수가 달라 가로 비율이 제각각(1.1~3.3배)이라
// 가로로 맞추면 짧은 말(`굿!`)만 혼자 커 보입니다. 대신 긴 말이 화면을 넘지 않게
// 가로에 상한(`maxWidth`)을 둬서, 넘치면 알아서 작아지게 했습니다.

/**
 * 뜰 때마다 왼쪽이나 오른쪽으로 **무작위로 기울일** 각도.
 *
 * Jin 요청 (2026-09-29): "글씨효과가 너무 정직하게 나오는 것 같다.
 * 랜덤으로 왼쪽 혹은 오른쪽으로 기울어져서 나와도 좋겠다."
 *
 * 만화 효과음처럼 매번 다르게 툭 튀어나오는 느낌을 내려는 것이라,
 * **0도 근처는 일부러 피합니다.** 안 그러면 "안 기울어진 것"이 섞여 나와
 * 기울인 티가 안 납니다. 4~11도 사이에서 좌우 중 한쪽을 고릅니다.
 */
export function randomTiltDeg(): number {
  const side = Math.random() < 0.5 ? -1 : 1;
  return side * (4 + Math.random() * 7);
}

/**
 * 효과 그림 한 장. 뜰 때마다 무작위로 기울어집니다.
 *
 * ⚠️ **기울이기는 바깥 div 가 맡습니다.** 그림 자체에 `rotate` 를 주면
 * `animate-judge-pop` 같은 애니메이션의 `transform`(확대·이동)과 충돌해서
 * 둘 중 하나가 무시됩니다. 부모가 돌리고 자식이 움직이면 자연스럽게 겹칩니다.
 */
export function FxImage({
  art,
  alt,
  height,
  className = '',
}: {
  art: FxArt;
  alt: string;
  /** 그림이 자기 높이를 갖고 있지 않을 때 쓸 높이(px) */
  height: number;
  className?: string;
}) {
  // 처음 그려질 때 한 번만 정합니다. 다시 그려져도 각도가 흔들리면 안 됩니다.
  // (새 각도가 필요하면 부르는 쪽에서 `key` 를 바꿔 새로 만들면 됩니다)
  const [tilt] = useState(randomTiltDeg);

  return (
    <span className={className} style={{ display: 'inline-block', transform: `rotate(${tilt}deg)` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.src}
        alt={alt}
        style={{
          height: art.height ?? height,
          width: 'auto',
          maxWidth: '92vw',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </span>
  );
}

export default function FxText({
  art,
  text,
  /** 그림으로 나올 때의 기본 높이(px). 그림이 자기 높이를 갖고 있으면 그쪽이 이긴다. */
  height,
  /** 그림이 없을 때 쓸 글씨 클래스 */
  textClassName,
  className = '',
}: {
  art?: FxArt | null;
  text: string;
  height: number;
  textClassName: string;
  className?: string;
}) {
  if (art) return <FxImage art={art} alt={text} height={height} className={className} />;
  return <span className={`${textClassName} ${className}`}>{text}</span>;
}
