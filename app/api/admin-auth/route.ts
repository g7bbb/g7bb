import { NextRequest, NextResponse } from 'next/server';

// 심사 화면(/admin/judge)에 들어갈 때 쓰는 암호 확인입니다.
// 암호는 NEXT_PUBLIC_ 없이 서버에서만 읽어 브라우저에 노출되지 않습니다.
//
// 참고: 행사용 베타라 Supabase RLS가 꺼져 있어서 이 암호가 데이터 자체를 지켜주지는 못합니다.
// 아이들이 실수로 심사 화면에 들어가는 것을 막는 용도입니다.
//
// ⚠️ 환경변수는 **요청이 올 때마다** 읽습니다 (2026-09-28).
// 파일 맨 위에서 `const ADMIN_CODE = process.env.ADMIN_CODE` 로 한 번만 읽으면,
// 값이 없던 상태로 서버가 뜬 뒤에는 나중에 값이 생겨도 계속 없는 것으로 봅니다.
export async function POST(req: NextRequest) {
  try {
    // 앞뒤 공백을 떼고 비교합니다 (2026-09-28).
    //
    // Vercel 환경변수 칸에 값을 붙여넣으면 끝에 공백이나 줄바꿈이 딸려 들어가기 쉽습니다.
    // 화면에는 보이지 않는데 컴퓨터는 다른 값으로 보기 때문에, 저장할 때 쓴 값을 그대로
    // 손으로 쳐도 "암호가 맞지 않아요"가 뜹니다. 실제로 Jin이 이걸로 막혔습니다
    // (붙여넣기는 되는데 타이핑은 안 되는 증상).
    //
    // 부스에서 폰으로 급하게 칠 때 이것 때문에 심사 화면이 안 열리면 안 되므로,
    // 양쪽 다 떼고 비교합니다. 암호 앞뒤의 공백은 어차피 의도한 값이 아닙니다.
    const adminCode = process.env.ADMIN_CODE?.trim();
    const { code } = await req.json();

    if (!adminCode) {
      // 부스에서 이 화면을 보게 될 사람은 개발자가 아니라 Jin입니다.
      // "뭐가 잘못됐다"가 아니라 "무엇을 하면 되는지"를 적어둡니다.
      return NextResponse.json(
        {
          ok: false,
          error:
            '아직 암호가 등록되지 않았어요. Vercel → Settings → Environment Variables 에서 ' +
            'ADMIN_CODE 를 Production 으로 추가한 뒤, Deployments 에서 Redeploy 까지 해야 반영됩니다.',
        },
        { status: 500 }
      );
    }

    if (typeof code !== 'string' || code.trim() !== adminCode) {
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
