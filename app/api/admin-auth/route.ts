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
/**
 * 암호를 비교하기 전에 다듬습니다 (2026-09-28).
 *
 * **왜 필요한가 — Jin이 실제로 막혔던 것**
 *
 * "붙여넣기는 되는데 손으로 치면 안 된다"는 증상이 났고, 원인이 두 가지였습니다.
 *
 * 1) **앞뒤 공백**: Vercel 환경변수 칸에 붙여넣을 때 끝에 공백이나 줄바꿈이 딸려
 *    들어가기 쉽습니다. 화면에는 안 보이는데 컴퓨터는 다른 값으로 봅니다.
 *
 * 2) **한글의 두 가지 저장 방식** (이쪽이 진짜 원인이었습니다):
 *    `곤` 한 글자를 통째로 저장하는 방식(NFC, U+ACE4)과
 *    `ㄱ`+`ㅗ`+`ㄴ` 으로 쪼개 저장하는 방식(NFD, U+1100 U+1169 U+11AB)이 있습니다.
 *    화면에는 똑같이 `곤`으로 보이지만 컴퓨터에는 전혀 다른 값입니다.
 *    붙여넣으면 저장된 형태가 그대로 들어가 맞고, 손으로 치면 그 기기의 입력기가
 *    만드는 형태라 어긋납니다. 기기마다(윈도우/맥/폰) 다른 형태를 만듭니다.
 *    → `normalize('NFC')` 로 한 가지 형태로 맞춰서 비교합니다.
 *
 * 부스에서는 PC로 등록해둔 암호를 폰으로 칠 수 있으므로 이 차이가 실제로 납니다.
 * 이것 때문에 심사 화면이 안 열리면 시상 8명 중 4명을 못 뽑습니다.
 */
function tidy(value: string): string {
  return value.normalize('NFC').trim();
}

export async function POST(req: NextRequest) {
  try {
    const rawAdminCode = process.env.ADMIN_CODE;
    const adminCode = rawAdminCode ? tidy(rawAdminCode) : '';
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

    if (typeof code !== 'string' || tidy(code) !== adminCode) {
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
