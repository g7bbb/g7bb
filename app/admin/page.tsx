'use client';

import Link from 'next/link';
import AdminGate from './admin-gate';
import { forgetAdmin } from '@/lib/ticket-pin-client';
import { signOut } from '@/lib/session';
import { useEffect, useState } from 'react';
import { fetchExperienceMode, setExperienceMode } from '@/lib/experience';

// 🧑‍🏫 직원 메뉴 (10/3 Jin: "직원용 화면에서 뒤로가기가 있으면 좋겠어. 주소를 다 못 외우니")
// 직원 화면 주소를 한곳에 모았다. 각 직원 화면 왼쪽 위 "← 직원 메뉴" 로 여기로 돌아온다.
// 암호는 그 기기에 기억된다 (lib/ticket-pin-client.ts) — 아이들도 쓰는 태블릿이면 다 쓰고 "직원 로그아웃".

const MENU: { href: string; emoji: string; title: string; desc: string }[] = [
  // 🧪 (체험용) 11/25 — 큰 화면(노트북)에서 연다
  { href: '/together', emoji: '📺', title: '오늘 곤충 다같이 보기', desc: '(체험용) 큰 화면 · 아이가 쓴 프롬프트와 능력치 · 왜 이렇게 만들었는지 발표' },
  { href: '/tournament', emoji: '⚔️', title: '배틀 토너먼트', desc: '(체험용) 큰 화면 · 무작위 대진표 · 선수는 배틀 태블릿에서 QR · 결승 3판 2선승' },
  { href: '/arena', emoji: '📲', title: '이 기기를 배틀 태블릿으로', desc: '(체험용) 배틀용 태블릿 2대에서 한 번씩 누르기 · 이 기기에서만 배틀이 돼요 (아이 폰은 응원만)' },
  { href: '/admin/tier', emoji: '💰', title: '참가권 올려주기', desc: '1만·10만원 · 30분 대기 풀기 · 종이 비밀번호 보기' },
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
        <ModeSwitch />
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
            signOut();
            window.alert('이 기기에 들어와 있던 아이를 로그아웃했어요.');
          }}
          className="mt-4 bg-amber-400 text-slate-900 font-black py-4 rounded-2xl"
        >
          👋 이 기기의 아이 로그아웃 (다음 친구 차례)
        </button>
        <button
          onClick={() => {
            forgetAdmin();
            window.location.href = '/';
          }}
          className="mt-2 bg-slate-700 font-bold py-3 rounded-2xl"
        >
          🔒 직원 로그아웃 (이 기기에서 암호 지우기)
        </button>
      </main>
    </AdminGate>
  );
}

/** 🧪 체험 모드 스위치 (11/25 Jin) — 켜면 아이 화면에서 행사용 내용(랭킹·배틀·뱃지·참가권·레벨업)이 사라진다 (lib/experience.ts) */
function ModeSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetchExperienceMode().then(setOn);
  }, []);
  async function flip() {
    const next = !on;
    if (!window.confirm(next ? '체험 모드를 켤까요?\n아이 화면에서 랭킹·배틀·뱃지·참가권이 숨겨져요.' : '체험 모드를 끌까요?\n행사용 화면으로 돌아가요.')) return;
    setBusy(true);
    try {
      await setExperienceMode(next);
      setOn(next);
    } catch {
      window.alert('바꾸지 못했어요. 인터넷을 확인하고 다시 눌러주세요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`rounded-2xl px-5 py-4 border-2 ${on ? 'border-emerald-400 bg-emerald-500/15' : 'border-slate-600 bg-slate-800'}`} style={{ wordBreak: 'keep-all' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black">🧪 체험 모드 {on === null ? '…' : on ? '켜짐' : '꺼짐 (행사용)'}</p>
          <p className="text-sm text-slate-400">켜면 아이 화면이 체험용으로 (랭킹·배틀·뱃지·참가권 숨김 · 토너먼트 대결장)</p>
        </div>
        <button
          onClick={flip}
          disabled={busy || on === null}
          className={`shrink-0 rounded-full px-4 py-2 font-black disabled:opacity-50 ${on ? 'bg-slate-700 text-white' : 'bg-emerald-500 text-slate-900'}`}
        >
          {on ? '끄기' : '켜기'}
        </button>
      </div>
      {on && <p className="mt-2 text-xs text-emerald-200">아이 기기는 화면을 새로 열 때부터 바뀌어요. 이미 열려 있으면 새로고침!</p>}
    </div>
  );
}
