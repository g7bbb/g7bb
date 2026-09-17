import { NextRequest, NextResponse } from 'next/server';

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const SHEETS_WEBHOOK_TOKEN = process.env.SHEETS_WEBHOOK_TOKEN;

// 참가 기록(고른 설정 / 받고 싶은 선물 / 설문 답변)을 구글 시트에 한 줄씩 남깁니다.
// 시트 주소와 토큰은 NEXT_PUBLIC_ 없이 서버에서만 읽어 브라우저에 노출되지 않게 합니다.
export async function POST(req: NextRequest) {
  try {
    const { row } = await req.json();

    if (!row || typeof row !== 'object') {
      return NextResponse.json({ error: '기록할 내용이 없습니다.' }, { status: 400 });
    }

    // 시트 연동을 아직 설정하지 않은 환경(로컬 테스트 등)에서도 체험이 멈추면 안 되므로
    // 환경변수가 없으면 오류 대신 "건너뜀"으로 응답합니다.
    if (!SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_TOKEN) {
      return NextResponse.json({ ok: false, skipped: true });
    }

    const response = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: SHEETS_WEBHOOK_TOKEN, row }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `시트 기록 실패 (${response.status})` },
        { status: 502 }
      );
    }

    // Apps Script는 오류도 200으로 돌려주므로 본문을 확인합니다.
    const result = await response.json().catch(() => null);
    if (result && result.ok === false) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || '알 수 없는 오류가 발생했어요.' },
      { status: 500 }
    );
  }
}
