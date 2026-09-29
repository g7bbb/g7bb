'use client';

// 효과 글씨 한 줄. **그림이 있으면 그림, 없으면 지금까지처럼 글씨**로 나옵니다.
//
// ⚠️ 13장이 한 번에 오지 않아서 이렇게 만들었습니다.
// 그림이 빠져도 배틀은 그대로 돌아가야 합니다 — 부스에서 화면이 비면 안 됩니다.
//
// 크기는 **높이로** 맞춥니다. 글자 수가 달라 가로 비율이 제각각(1.1~2.3배)이라
// 가로로 맞추면 짧은 말(`굿!`)만 혼자 커 보입니다. 대신 긴 말이 화면을 넘지 않게
// 가로에 상한(`maxWidth`)을 둬서, 넘치면 알아서 작아지게 했습니다.

export default function FxText({
  art,
  text,
  /** 그림으로 나올 때의 높이(px) */
  height,
  /** 그림이 없을 때 쓸 글씨 클래스 */
  textClassName,
  className = '',
}: {
  art?: string | null;
  text: string;
  height: number;
  textClassName: string;
  className?: string;
}) {
  if (art) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={art}
        alt={text}
        className={className}
        style={{ height, width: 'auto', maxWidth: '92vw', objectFit: 'contain' }}
      />
    );
  }
  return <span className={`${textClassName} ${className}`}>{text}</span>;
}
