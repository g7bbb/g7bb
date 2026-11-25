import { NextResponse } from 'next/server';

// ⏱ 서버 시각 — 토너먼트에서 기기마다 다른 시계를 맞추는 데 쓴다 (lib/tournament.ts syncClock)
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
