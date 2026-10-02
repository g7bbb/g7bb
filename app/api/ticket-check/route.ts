import { NextRequest, NextResponse } from 'next/server';
import { checkTicketPin } from '@/lib/ticket-pin';

// 번호 + 비밀번호 4자리가 맞는지 (/start 에서 부른다). 비밀번호 자체는 돌려주지 않는다.
export async function POST(req: NextRequest) {
  try {
    const { ticket, pin } = await req.json();
    return NextResponse.json({ ok: typeof ticket === 'string' && checkTicketPin(ticket, String(pin ?? '')) });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
