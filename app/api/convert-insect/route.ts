import { NextRequest, NextResponse } from 'next/server';
import { INSECT_ANATOMY_RULES, findSpecies } from '@/lib/species';
import { describeMutationsForPrompt } from '@/lib/mutations';
import { appearancePrompt } from '@/lib/appearance';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
/**
 * 그림을 그리는 Gemini 모델.
 *
 * 🚨 **2026-09-29: 기본값을 `gemini-2.5-flash-image` 에서 바꿨다.**
 * 그 모델은 Gemini Developer API(= 이 코드가 쓰는 generativelanguage.googleapis.com)에서
 * **2026년 10월 2일에 종료**된다. 행사가 10/3~4 이라 **행사 전날 밤에 변환이 통째로 죽는다.**
 * 게다가 2.5 계열은 공지된 종료일보다 **먼저** 끊긴 전례가 보고돼 있어 더 못 미룬다.
 * (Vertex AI 쪽은 2027-03-15 로 다르게 적혀 있지만, 우리는 Vertex 가 아니라 Developer API 다.)
 *
 * ⚠️ **Vercel 환경변수 `GEMINI_IMAGE_MODEL` 이 이 기본값을 이긴다.**
 * 그쪽에 옛 모델명이 들어 있으면 이 파일을 고쳐도 소용없다. Vercel 값을 같이 바꿔야 한다.
 *
 * ⚠️ 모델명은 자주 바뀐다. 변환이 실패하면 https://ai.google.dev 의 최신 모델 목록부터 확인할 것.
 */
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';

const BODY_PART_LABELS: Record<string, string> = {
  head: '머리(턱)',
  legs: '다리(발톱)',
  armor: '갑옷(몸통 두께)',
  wings: '날개',
  eyes: '눈',
  instinct: '육감',
  genetics: '유전적 특징',
};

// 아이가 그린 곤충 그림 사진을 받아, 실사 느낌 + 멋진 이펙트가 들어간 곤충 일러스트로 변환합니다.
// AI 그림은 10~20초, 붐비면 더 걸린다. Vercel 기본 시간 제한에 걸려 끊기지 않게 넉넉히 (최대 60초).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, species, customSpecies, customLook, bodyParts, mutations, color, mood } =
      await req.json();

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: '사진이 없어. 사진을 먼저 골라줘!' }, { status: 400 });
    }
    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: '서버에 GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.' },
        { status: 500 }
      );
    }

    // 아이가 가장 높은 점수를 준 신체 부위 2개를 뽑아서 이미지에 강조되도록 프롬프트에 반영합니다.
    let emphasis = '';
    if (bodyParts && typeof bodyParts === 'object') {
      const sorted = Object.entries(bodyParts as Record<string, number>).sort((a, b) => b[1] - a[1]);
      // "머리(턱)" 을 모든 곤충에 쓰면 나비에게도 큰 집게 턱이 생긴다 → 종마다 머리 이름을 바꾼다.
      const headLabel = findSpecies(species)?.head ?? '머리';
      const top = sorted
        .slice(0, 2)
        .map(([key]) => (key === 'head' ? headLabel : BODY_PART_LABELS[key] || key));
      if (top.length) emphasis = `특히 ${top.join(', ')} 부분이 크고 강하게 강조되도록 그려줘. `;
    }

    // 종류를 알면 그 종의 실제 생김새 규칙까지 함께 알려줍니다.
    // 이게 없으면 AI가 "멋있게"를 우선해서 사슴벌레 턱을 4개 그리는 식의 오류를 냅니다.
    const matchedSpecies = findSpecies(species);
    // "기타 곤충"을 고른 아이는 곤충 이름과 생김새를 직접 적는다 (2026-09-30 Jin 요청).
    // 이게 없으면 AI 는 "기타 곤충"만 보고 아무 곤충이나 그린다.
    // 아이가 자유롭게 친 글이라 줄바꿈을 없애고 길이를 자른다 (프롬프트가 엉뚱하게 늘어나지 않게).
    const clean = (value: unknown, max: number) =>
      typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
    const ownName = clean(customSpecies, 20);
    const ownLook = clean(customLook, 200);
    // 아이가 직접 쓴 생김새·효과 (10/3 Jin: 번개·불꽃 같은 효과를 자세히 쓰면 그림이 훨씬 멋지게 나옴)
    const lookText = ownLook
      ? `아이가 직접 설명한 생김새·효과: "${ownLook}". 이 설명(번개·불꽃·얼음 같은 효과, 색, 배경 포함)을 하나도 빠짐없이 크고 분명하게 반영해라. ` +
        `앞의 색깔·느낌 규칙과 부딪히면 아이가 직접 쓴 이 설명을 따라라. `
      : '';
    const speciesName = ownName || matchedSpecies?.label || species;
    const speciesText = speciesName ? `${speciesName} 종류를 기반으로, ` : '';
    const speciesAnatomy = ownName
      ? `아이가 직접 "${ownName}"을(를) 그렸다고 알려줬다. 실제 ${ownName}의 생김새를 따라 그려라. ` +
        (ownLook ? lookText : '')
      : matchedSpecies?.anatomy
        ? `${speciesName}의 실제 생김새는 이렇다: ${matchedSpecies.anatomy} ` +
          (ownLook ? lookText : '')
        : ownLook
          ? lookText
          : '';

    // 🚨 큰 생김새는 고른 곤충을 반드시 따른다 (2026-10-02 Jin: "나비를 골랐는데 얼굴이 사슴벌레").
    // 아이 그림(또는 다른 곤충 사진)이 다른 곤충처럼 보여도 그림은 색·무늬·자세 참고용일 뿐이다.
    const forbid = ownName ? '' : matchedSpecies?.forbid ?? '';
    const speciesRule = speciesName
      ? `③ 이 곤충은 "${speciesName}"이다. 몸 전체의 큰 생김새(얼굴·입·머리·몸통·날개 모양)는 누가 봐도 한눈에 ` +
        `${speciesName}의 모습으로 알아볼 수 있어야 한다. 아이 그림이 다른 곤충처럼 보여도, 그림은 색·무늬·자세·특별히 그린 부분을 ` +
        `참고하는 데만 쓰고 몸의 기본 형태는 반드시 ${speciesName}의 모습으로 그려라. ` +
        (forbid ? `${forbid} (단, 아이가 특별 진화로 직접 고른 부위는 예외로 그대로 그려라.) ` : '')
      : '';

    // 아이가 상상으로 개수를 더 그린 부위는 실제 곤충과 달라도 그대로 살립니다.
    // 이 체험의 핵심은 "내가 그린 곤충이 살아나는 것"이라, 여기서 고쳐버리면 안 됩니다.
    const mutationDescription = mutations ? describeMutationsForPrompt(mutations, species) : '';
    const mutationRule = mutationDescription
      ? `이 아이는 상상으로 ${mutationDescription}인 곤충을 만들었다. ` +
        '실제 곤충과 다르더라도 이 개수는 반드시 그대로 그려라. 아이의 상상이므로 절대 실제 개수로 고치지 마라. ' +
        '늘어난 부위는 어색하지 않게, 좌우 균형을 맞춰 자연스럽고 멋있게 배치해라. '
      : '';

    // 아이가 종이에 표시한 색깔·느낌입니다. 안 골랐으면 "그림에 있는 색을 그대로 살려라"가 들어갑니다.
    // 연필로만 그린 그림이 많을 텐데, 그럴 때 AI가 색을 마음대로 정해버리는 것을 막아줍니다.
    const lookRule = appearancePrompt(color, mood);

    const prompt =
      `이 아이가 종이에 그린 곤충 그림을 참고해서, ${speciesText}실제 곤충 사진처럼 사실적인 질감과 디테일을 가진 ` +
      '곤충 일러스트로 다시 그려줘. 강렬한 배경 이펙트(스피드라인, 빛 입자 등)를 더해서 ' +
      `게임 카드 일러스트처럼 만들어줘. ${emphasis}배경은 분위기 있는 색감으로 채워줘. ` +
      '사람 얼굴이 아니라, 어디까지나 곤충 캐릭터 자체만 화면 중앙에 크게 그려줘.\n\n' +
      // 🚨 2026-09-29: 새 모델이 "게임 카드처럼"을 **진짜 카드를 그리라는 뜻**으로 알아들어서
      // 테두리와 `LV. 9 / 9000` 같은 가짜 글자를 그림 안에 그려 넣었다.
      // AI가 그리는 글자는 언제나 엉터리고, 1위 상품이 포스터·피규어 제작이라 그대로 둘 수 없다.
      // 카드 틀·레벨·능력치·필살기는 **앱이 그림 위에 직접 그린다**(진짜 값으로). AI는 그림만 그린다.
      '⚠️ 절대 금지: 카드 테두리나 액자, 글자, 숫자, 레벨 표시, 능력치 바, 로고, 워터마크, ' +
      '말풍선 같은 UI 요소를 그림 안에 넣지 마라. 어떤 문자도 그리지 마라. ' +
      '곤충과 배경만 화면 전체를 꽉 채워서 그려라.\n\n' +
      // 아래 규칙은 연출보다 우선합니다. 곤충 행사에 오는 아이들은 실제 곤충을 잘 알기 때문에
      // 턱이나 다리 개수가 틀리면 바로 알아챕니다.
      // 색깔·느낌도 여기 넣습니다. 위쪽 연출 문장에 두면 "멋있게"를 핑계로 무시당합니다.
      // 🚨 절대 규칙 (2026-10-01 Jin): 1위 상품이 **3D 프린팅 피규어**라 얇은 부위는 출력하면 부러진다.
      '🚨 절대 규칙 (무엇보다 우선): ① 이 곤충은 3D 프린팅으로 피규어를 만든다. 관절·다리·더듬이·발톱을 ' +
      '너무 얇거나 가늘게 그리지 마라. 실제보다 조금 두툼하고 튼튼하게 그려라. ' +
      '② 아이가 고른 곤충 이름과 적어 준 설명을 최대한 그대로 따라 그려라. ' +
      `${speciesRule}\n\n` +
      `반드시 지켜야 할 규칙 (멋있게 그리는 것보다 이 규칙이 우선한다): ${mutationRule}` +
      `${lookRule} ${speciesAnatomy}${INSECT_ANATOMY_RULES}`;

    // 행사 당일(10/3) 보강: 여러 아이가 한꺼번에 만들면 Gemini 가 "바빠(429)"·"잠깐 문제(500/503)" 를 줄 수 있다.
    // 그때는 2초 쉬고 **한 번만** 자동으로 다시 시도한다 (아이는 버튼을 한 번만 누른 셈).
    const callGemini = () =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
          }),
        }
      );
    let response = await callGemini();
    if ([429, 500, 503].includes(response.status)) {
      await new Promise((r) => setTimeout(r, 2000));
      response = await callGemini();
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error', response.status, errText.slice(0, 500));
      // 영어 오류문을 그대로 보여주면 부스에서 아무도 못 알아본다 → 상황별 반말 안내 (원문은 서버 로그에)
      const friendly =
        response.status === 429
          ? '지금 곤충을 만드는 친구가 너무 많아! 10초만 기다렸다가 다시 눌러줘 🐝'
          : response.status === 404
            ? '선생님께: AI 모델 이름이 맞지 않아요 (Vercel 의 GEMINI_IMAGE_MODEL 확인). (오류 404)'
            : response.status === 401 || response.status === 403
              ? '선생님께: AI 키 또는 결제 한도 문제예요 (Google AI Studio 확인). (오류 ' + response.status + ')'
              : response.status === 400
                ? '이 사진으로는 곤충을 못 만들었어. 그림 칸만 꽉 차게 다시 찍어줄래? 📷'
                : 'AI 가 잠깐 쉬는 중이야. 조금 있다가 다시 눌러줘! (오류 ' + response.status + ')';
      return NextResponse.json({ error: friendly }, { status: 502 });
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData?.data);

    if (!imagePart) {
      return NextResponse.json(
        { error: '곤충 그림을 못 만들었어. 그림 칸만 꽉 차게, 밝은 곳에서 다시 찍어볼래? 📷' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '알 수 없는 문제가 생겼어. 다시 눌러줘!' }, { status: 500 });
  }
}
