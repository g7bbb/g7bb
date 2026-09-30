import type { MetadataRoute } from 'next';
import { GAME_NAME, GAME_TITLE } from '@/lib/brand';

// 폰에서 "홈 화면에 추가"를 눌렀을 때 쓰이는 이름과 아이콘입니다.
// 아이콘은 **흰 바탕**입니다. 투명으로 두면 기기가 검게 채워서 검은 로고가 사라집니다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: GAME_TITLE,
    short_name: GAME_NAME,
    description: '내가 그린 곤충으로 배틀하자!',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
