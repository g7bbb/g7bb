import { NextRequest, NextResponse } from 'next/server';
import { INSECT_ANATOMY_RULES, findSpecies } from '@/lib/species';
import { describeMutations } from '@/lib/mutations';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

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
export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, species, bodyParts, mutations } = await req.json();

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
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
      const top = sorted.slice(0, 2).map(([key]) => BODY_PART_LABELS[key] || key);
      if (top.length) emphasis = `특히 ${top.join(', ')} 부분이 크고 강하게 강조되도록 그려줘. `;
    }

    // 종류를 알면 그 종의 실제 생김새 규칙까지 함께 알려줍니다.
    // 이게 없으면 AI가 "멋있게"를 우선해서 사슴벌레 턱을 4개 그리는 식의 오류를 냅니다.
    const matchedSpecies = findSpecies(species);
    const speciesName = matchedSpecies?.label || species;
    const speciesText = speciesName ? `${speciesName} 종류를 기반으로, ` : '';
    const speciesAnatomy = matchedSpecies?.anatomy
      ? `${speciesName}의 실제 생김새는 이렇다: ${matchedSpecies.anatomy} `
      : '';

    // 아이가 상상으로 개수를 더 그린 부위는 실제 곤충과 달라도 그대로 살립니다.
    // 이 체험의 핵심은 "내가 그린 곤충이 살아나는 것"이라, 여기서 고쳐버리면 안 됩니다.
    const mutationDescription = mutations ? describeMutations(mutations, species) : '';
    const mutationRule = mutationDescription
      ? `이 아이는 상상으로 ${mutationDescription}인 곤충을 만들었다. ` +
        '실제 곤충과 다르더라도 이 개수는 반드시 그대로 그려라. 아이의 상상이므로 절대 실제 개수로 고치지 마라. ' +
        '늘어난 부위는 어색하지 않게, 좌우 균형을 맞춰 자연스럽고 멋있게 배치해라. '
      : '';

    const prompt =
      `이 아이가 종이에 그린 곤충 그림을 참고해서, ${speciesText}실제 곤충 사진처럼 사실적인 질감과 디테일을 가진 ` +
      '박진감 넘치는 곤충 일러스트로 다시 그려줘. 빛나는 효과, 역동적인 포즈, 강렬한 배경 이펙트(스피드라인, 빛 입자 등)를 더해서 ' +
      `게임 카드 일러스트처럼 멋있게 만들어줘. ${emphasis}배경은 분위기 있는 색감으로 채워줘. ` +
      '사람 얼굴이 아니라, 어디까지나 곤충 캐릭터 자체만 화면 중앙에 크게 그려줘.\n\n' +
      // 아래 규칙은 연출보다 우선합니다. 곤충 행사에 오는 아이들은 실제 곤충을 잘 알기 때문에
      // 턱이나 다리 개수가 틀리면 바로 알아챕니다.
      `반드시 지켜야 할 규칙 (멋있게 그리는 것보다 이 규칙이 우선한다): ${mutationRule}` +
      `${speciesAnatomy}${INSECT_ANATOMY_RULES}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Gemini API 오류: ${errText}` }, { status: 502 });
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p: any) => p.inlineData?.data);

    if (!imagePart) {
      return NextResponse.json(
        { error: '곤충 이미지를 생성하지 못했어요. 다른 사진으로 다시 시도해주세요.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '알 수 없는 오류가 발생했어요.' }, { status: 500 });
  }
}
