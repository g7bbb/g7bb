import type { Metadata, Viewport } from 'next';
import './globals.css';
import { GAME_NAME, GAME_TITLE } from '@/lib/brand';
import BgmPlayer from './bgm-player';
import SessionGuard from './session-guard';

export const metadata: Metadata = {
  title: GAME_TITLE,
  description: '사진으로 나만의 곤충을 만들고 배틀해봐!',
  // 아이폰 "홈 화면에 추가" 때 아이콘 아래 붙는 이름
  appleWebApp: { title: GAME_NAME },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        {children}
        <BgmPlayer />
        <SessionGuard />
      </body>
    </html>
  );
}
