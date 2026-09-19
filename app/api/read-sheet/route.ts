import { NextRequest, NextResponse } from 'next/server';
import { SPECIES } from '@/lib/species';
import { ENVIRONMENTS } from '@/lib/environments';
import { AGE_STAGES, BODY_PARTS } from '@/lib/insect-stats';
import { MUTATIONS } from '@/lib/mutations';
import { COLORS, MOODS } from '@/lib/appearance';

// 종이 마킹 자동 인식 (순서표 6번)
//
// 아이가 종이에 동그라미로 표시한 항목을 사진에서 읽어 JSON으로 돌려줍니다.
// 손글씨는 악필·오타 위험이 커서 **동그라미 마킹 방식**으로 정했습니다.
//
// ⚠️ 이미지 "생성" 모델이 아니라 **읽는** 모델을 씁니다. 둘은 다른 모델입니다.
//    GEMINI_IMAGE_MODEL 을 여기에 쓰면 그림을 그려버립니다.
//
// ⚠️ 결과를 그대로 저장하지 않습니다. 화면의 입력값을 **채워주기만** 하고,
//    아이(또는 부스 운영자)가 눈으로 확인한 뒤 저장합니다.
//    300명분 연필 마킹을 100% 읽는 건 불가능하고, 틀린 채로 저장되면 능력치가 엉뚱해집니다.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

/** 종이에 실제로 인쇄된 줄과 선택지를 그대로 불러와 프롬프트를 만듭니다.
 *  목록을 고치면 종이·앱·이 인식기가 **동시에** 따라갑니다. 따로 적어두면 반드시 어긋납니다. */
function buildPrompt(): string {
  const row = (label: string, items: string[]) => `- ${label}: ${items.join(' / ')}`;

  return [
    '이 사진은 아이가 곤충을 그리고 아래 항목에 동그라미로 표시한 A4 참가 용지다.',
    '표시된 항목을 읽어서 JSON으로만 답하라.',
    '',
    '용지에 있는 줄과 선택지는 정확히 다음과 같다:',
    row('곤충 종류', SPECIES.map((item) => item.label)),
    row('성장 단계', AGE_STAGES.map((item) => item.label)),
    row('출신지', ENVIRONMENTS.map((item) => item.label)),
    row('색깔 (안 골랐을 수 있음)', COLORS.map((item) => item.label)),
    row('느낌 (안 골랐을 수 있음)', MOODS.map((item) => item.label)),
    '',
    '부위 점수 — 각 줄에서 1~5 중 하나:',
    ...BODY_PARTS.map((part) => `- ${part.label}`),
    '',
    '특별 진화 — 각 줄에서 하나:',
    ...MUTATIONS.map((option) => row(option.label, option.choices.map((c) => c.label))),
    '',
    '읽는 규칙:',
    '- 동그라미·체크·색칠 등 **어떤 방식으로든 표시된 것**을 고른 것으로 본다.',
    '- 한 줄에 표시가 없으면 그 줄은 null 로 둔다. 추측해서 채우지 마라.',
    '- 한 줄에 두 개 이상 표시돼 있으면 **가장 진하게/크게** 표시된 것 하나만 고른다.',
    '- 종이 위쪽에 인쇄된 참가 번호(예: A-014)도 읽어서 ticket 에 넣는다. 안 보이면 null.',
    '- 값은 반드시 위에 적힌 **보기 문구 그대로** 쓴다. 다른 말로 바꾸지 마라.',
    '- 그림 자체는 보지 말고, 마킹란만 읽어라.',
    '',
    '⚠️ 헷갈리기 쉬운 것: **"날개" 줄이 두 개 있다.**',
    '- "부위 점수" 칸의 날개 → 1~5 중 하나의 **점수**. bodyParts 에 넣는다.',
    '- "특별 진화" 칸의 날개 → 2장 / 4장 / 6장 이상 중 하나의 **장수**. mutations 에 넣는다.',
    '두 칸은 용지에서 위아래로 떨어져 있고 각각 제목이 붙어 있으니 제목을 보고 구분하라.',
  ].join('\n');
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ticket: { type: 'STRING', nullable: true },
    species: { type: 'STRING', nullable: true },
    ageStage: { type: 'STRING', nullable: true },
    origin: { type: 'STRING', nullable: true },
    color: { type: 'STRING', nullable: true },
    mood: { type: 'STRING', nullable: true },
    bodyParts: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        BODY_PARTS.map((part) => [part.label, { type: 'INTEGER', nullable: true }])
      ),
    },
    mutations: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        MUTATIONS.map((option) => [option.label, { type: 'STRING', nullable: true }])
      ),
    },
  },
};

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: '사진이 없습니다.' }, { status: 400 });
    }
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: '서버에 GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.' },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: buildPrompt() }, { inlineData: { mimeType, data: imageBase64 } }] },
          ],
          generationConfig: {
            // JSON 형식을 모델에게 강제합니다. 이게 없으면 설명 문장이 섞여 파싱이 깨집니다.
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0, // 읽기 작업이므로 창의성이 필요 없습니다.
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Gemini API 오류: ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json(
        { error: '종이를 읽지 못했어요. 밝은 곳에서 종이 전체가 나오게 다시 찍어주세요.' },
        { status: 502 }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: '읽은 내용을 이해하지 못했어요. 다시 찍어주세요.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ result: parsed });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || '알 수 없는 오류가 발생했어요.' },
      { status: 500 }
    );
  }
}
