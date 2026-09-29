// 아이가 폰으로 찍은 **사진을 서버로 보내기 전에** 줄입니다.
//
// 🚨 **왜 필요한가 — 부스가 멈출 수 있던 버그 (2026-09-29 발견)**
//
// Jin이 카카오톡 사진을 고르자 이런 에러가 났습니다:
//   `Unexpected token 'R', "Request En"... is not valid JSON`
// 잘린 문구의 정체는 **`Request Entity Too Large`** — 서버가 "요청이 너무 큽니다"를
// 일반 텍스트로 돌려줬는데, 화면이 그걸 JSON으로 읽으려다 깨진 것입니다.
//
// 원인: 사진을 **원본 그대로** base64 로 바꿔 보내고 있었습니다.
// - 요즘 폰 사진은 한 장 3~8MB
// - base64 로 바꾸면 용량이 약 1.33배로 부풉니다 → 4~11MB
// - 배포된 서버(Vercel)의 요청 본문 한도는 **4.5MB**
//
// 즉 **폰으로 찍은 사진 대부분이 한도를 넘습니다.** 행사에서 아이들이 A4 그림을
// 폰으로 찍어 올리는 게 체험의 첫 단계라, 그대로 뒀으면 거의 모든 아이가 여기서 막혔습니다.
// (테스트 때 안 걸린 이유는 작은 이미지를 썼기 때문입니다.)
//
// **AI는 원본 해상도가 필요 없습니다.** 4000×3000 을 보내도 모델이 알아서 줄여서 봅니다.
// 긴 변 2000px 이면 연필 마킹 동그라미까지 충분히 읽힙니다.

/**
 * 보낼 사진의 최대 한 변.
 *
 * 2000을 고른 이유: 종이 마킹(OMR)을 읽을 때 **연필로 칠한 작은 동그라미**를 봐야 하는데,
 * 1024까지 줄이면 그 표시가 뭉개질 수 있습니다. 2000이면 JPEG로 약 0.4~0.7MB,
 * base64로 부풀어도 1MB 안쪽이라 4.5MB 한도에 한참 못 미칩니다.
 */
const MAX_EDGE = 2000;

/**
 * JPEG 품질.
 * 0.85는 그림의 선과 연필 표시가 또렷하게 남으면서 용량이 확 줄어드는 지점입니다.
 */
const QUALITY = 0.85;

export interface PhotoPayload {
  base64: string;
  mimeType: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('사진을 읽지 못했어요. 다른 사진으로 해볼래?'));
    img.src = url;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('사진을 읽지 못했어요. 다른 사진으로 해볼래?'));
    reader.readAsDataURL(file);
  });
}

/**
 * 사진 파일을 서버로 보낼 수 있는 크기의 base64 로 바꿉니다.
 *
 * **줄이지 못하면 원본을 그대로 돌려줍니다.** 줄이기는 어디까지나 거들기라서,
 * 이것 때문에 아이가 곤충을 못 만드는 일이 있어서는 안 됩니다.
 * (원본이 한도를 넘으면 서버가 막겠지만, 그때는 화면이 한국어로 안내합니다.)
 */
export async function shrinkPhotoForUpload(file: File): Promise<PhotoPayload> {
  const dataUrl = await readAsDataUrl(file);
  const [, original] = dataUrl.split(',');
  const fallback: PhotoPayload = { base64: original, mimeType: file.type };

  try {
    if (typeof document === 'undefined') return fallback;

    const source = await loadImage(dataUrl);
    const longest = Math.max(source.width, source.height);
    if (!longest) return fallback;

    const scale = Math.min(1, MAX_EDGE / longest);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;

    // 사진에 투명한 부분이 있을 일은 없지만, JPEG 는 투명을 못 담으므로 흰 종이를 깔아둡니다.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    const encoded = canvas.toDataURL('image/jpeg', QUALITY).split(',')[1];
    if (!encoded) return fallback;

    // 어떤 이유로든 원본보다 커졌다면 바꾸지 않는 편이 낫습니다.
    if (encoded.length >= original.length) return fallback;

    return { base64: encoded, mimeType: 'image/jpeg' };
  } catch {
    return fallback;
  }
}

/**
 * 서버 응답을 JSON 으로 읽되, **JSON 이 아니어도 화면이 깨지지 않게** 합니다.
 *
 * 서버나 그 앞단(Vercel)이 막을 때는 JSON 이 아니라 일반 텍스트를 돌려줍니다.
 * 그걸 그냥 `res.json()` 으로 읽으면 아이와 진행 요원에게
 * `Unexpected token 'R' ...` 같은 문구가 그대로 뜹니다. 실제로 그렇게 떴습니다.
 */
export async function readJsonOrExplain(res: Response): Promise<any> {
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 413) {
      throw new Error('사진 용량이 너무 커요. 조금 더 작게 찍거나 다른 사진으로 해볼래?');
    }
    if (res.status === 504 || res.status === 408) {
      throw new Error('AI가 그림을 만드는 데 너무 오래 걸렸어요. 한 번만 더 눌러줄래?');
    }
    throw new Error(
      `서버에서 문제가 생겼어요. 다시 한 번 눌러주세요. 계속 안 되면 진행 요원에게 알려주세요. (오류 ${res.status})`
    );
  }
}
