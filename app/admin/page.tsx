'use client';

import Link from 'next/link';
import AdminGate from './admin-gate';
import { forgetAdmin } from '@/lib/ticket-pin-client';

// 🧑‍🏫 직원 메뉴 (10/3 Jin: "직원용 화면에서 뒤로가기가 있으면 좋겠어. 주소를 다 못 외우니")
// 직원 화면 주소를 한곳에 모았다. 각 직원 화면 왼쪽 위 "← 직원 메뉴" 로 여기로 돌아온다.
// 암호는 그 기기에 기억된다 (lib/ticket-pin-client.ts) — 아이들도 쓰는 태블릿이면 다 쓰고 "직원 로그아웃".

const MENU: { href: string; emoji: string; title: string; desc: string }[] = [
  { href: '/admin/tier', emoji: '💰', title: '참가권 올려주기', desc: '3만·5만·10만원 · 30분 대기 풀기 · 종이 비밀번호 보기' },
  { href: '/admin/poster', emoji: '🖨️', title: '포스터 · 카드 출력', desc: '원본 그림 받기 · A3 포스터 · 셀피 카드' },
  { href: '/admin/judge', emoji: '🎨', title: '곤충 사생대회 심사', desc: '1~3등 고르기 (하트는 참고)' },
  { href: '/live', emoji: '📺', title: '실시간 랭킹 (모니터용)', desc: '영상 옆 모니터에 띄워두기 · 자동으로 새로고침' },
  { href: '/print', emoji: '📄', title: '참가 용지 인쇄', desc: '종이 PDF 만들기' },
  { href: '/', emoji: '🏠', title: '게임 첫 화면', desc: '아이들이 쓰는 화면으로' },
];

export default function AdminHome() {
  return (
    <AdminGate title="직원 메뉴" hideBack>
      <main className="max-w-md mx-auto min-h-screen flex flex-col gap-3 px-5 py-8" style={{ wordBreak: 'keep-all' }}>
        <h1 className="text-2xl font-black text-center mb-2">🧑‍🏫 직원 메뉴</h1>
        {MENU.map((m) => (
          <Link key={m.href} href={m.href} className="bg-slate-800 hover:bg-slate-700 rounded-2xl px-5 py-4 flex items-center gap-4">
            <span className="text-3xl">{m.emoji}</span>
            <span>
              <span className="block text-lg font-black">{m.title}</span>
              <span className="block text-sm text-slate-400">{m.desc}</span>
            </span>
          </Link>
        ))}
        <button
          onClick={() => {
            forgetAdmin();
            window.location.href = '/';
          }}
          className="mt-4 text-sm text-slate-400 underline self-center"
        >
          🔒 직원 로그아웃 (이 기기에서 암호 지우기)
        </button>
      </main>
    </AdminGate>
  );
}
