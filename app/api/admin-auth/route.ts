import { NextRequest, NextResponse } from 'next/server';

const ADMIN_CODE = process.env.ADMIN_CODE;

// 심사 화면(/admin/judge)에 들어갈 때 쓰는 암호 확인입니다.
// 암호는 NEXT_PUBLIC_ 없이 서버에서만 읽어 브라우저에 노출되지 않습니다.
//
// 참고: 행사용 베타라 Supabase RLS가 꺼져 있어서 이 암호가 데이터 자체를 지켜주지는 못합니다.
// 아이들이 실수로 심사 화면에 들어가는 것을 막는 용도입니다.
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!ADMIN_CODE) {
      return NextResponse.json(
        { ok: false, error: '서버에 ADMIN_CODE 환경변수가 설정되어 있지 않습니다.' },
        { status: 500 }
      );
    }

    if (typeof code !== 'string' || code !== ADMIN_CODE) {
      return NextResponse.json({ ok: false, error: '암호가 맞지 않아요.' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || '알 수 없는 오류가 발생했어요.' },
      { status: 500 }
    );
  }
}
