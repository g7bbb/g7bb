import { BRAND } from '@/lib/brand';

// 우리 로고를 화면 어디에나 쉽게 넣기 위한 조각입니다.
// 이모지(🐛·🚀) 자리를 대신하도록 **높이만 정하면** 가로는 비율대로 따라옵니다.

export function BrandMark({
  size = 28,
  tone = 'white',
  className = '',
}: {
  /** 높이(px) */
  size?: number;
  /** 어두운 바탕이면 white, 밝은 바탕(초록 버튼·종이)이면 black */
  tone?: 'white' | 'black';
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND.mark[tone]}
      alt=""
      aria-hidden
      style={{ height: size, width: 'auto' }}
      className={`inline-block align-middle ${className}`}
    />
  );
}

export function BrandLogo({
  size = 120,
  tone = 'white',
  alt = '곤충본부 로고',
  className = '',
}: {
  size?: number;
  tone?: 'white' | 'black';
  alt?: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND.logo[tone]}
      alt={alt}
      style={{ height: size, width: 'auto' }}
      className={`mx-auto block ${className}`}
    />
  );
}
