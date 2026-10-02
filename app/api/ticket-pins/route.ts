import { NextRequest, NextResponse } from 'next/server';
import { isAdminCode, ticketPin } from '@/lib/ticket-pin';

// 직원용: 번호들의 비밀번호를 돌려준다 (종이 인쇄 · 카드 저장 · 참가권 화면). 직원 암호가 있어야 한다.
export async function POST(req: NextRequest) {
  try {
    const { code, tickets } = await req.json();
    if (!isAdminCode(code)) return NextResponse.json({ ok: false, error: '직원 암호가 필요해요. 다시 들어와 주세요.' }, { status: 401 });
    if (!Array.isArray(tickets) || tickets.length > 2000) return NextResponse.json({ ok: false, error: '번호 목록이 이상해요.' }, { status: 400 });
    const pins: Record<string, string> = {};
    for (const t of tickets) {
      const pin = typeof t === 'string' ? ticketPin(t) : null;
      if (pin) pins[t] = pin;
    }
    return NextResponse.json({ ok: true, pins });
  } catch {
    return NextResponse.json({ ok: false, error: '요청이 이상해요.' }, { status: 400 });
  }
}
