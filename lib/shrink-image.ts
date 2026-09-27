// AI가 만든 곤충 그림을 DB에 넣기 전에 JPEG로 다시 인코딩합니다.
//
// **왜 필요한가 (2026-09-27)**
//
// 만들어진 그림은 `insects.image_base64` 컬럼에 base64 텍스트로 통째로 들어갑니다.
// Gemini가 돌려주는 1024x1024 PNG는 한 장에 2MB 안팎이고, base64로 부풀면 약 2.8MB입니다.
// 300명이면 **830MB**. Supabase 무료 플랜의 DB 용량은 500MB라서
// **150~170명쯤에서 꽉 차고, 그 순간부터 모든 아이의 저장이 실패합니다.**
// 행사 첫날 오후에 부스가 멈춘다는 뜻이라 그냥 둘 수 없었습니다.
//
// 같은 1024 크기로 JPEG(품질 0.92)로만 바꿔도 한 장 0.5MB, 300명 145MB로 내려갑니다.
//
// **크기를 줄이지 않고 JPEG로만 바꾼 이유**: 1위 상품이 "내 곤충 포스터 + 소형 피규어 제작"이라
// 해상도를 낮추면 상품 품질이 떨어집니다. 원본이 이미 1024라 더 깎을 여유가 없습니다.
// 용량은 형식만 바꿔도 6배가 줄어드니 해상도를 건드릴 이유가 없습니다.

/** 저장할 그림의 최대 한 변. Gemini가 이보다 큰 걸 주면 여기까지만 줄입니다. */
const MAX_EDGE = 1024;

/**
 * JPEG 품질.
 * 0.92는 눈으로는 원본과 구분이 안 되면서 PNG의 1/6 크기가 되는 지점입니다.
 * 더 낮추면 용량은 더 줄지만 포스터로 뽑았을 때 티가 나기 시작합니다.
 */
const JPEG_QUALITY = 0.92;

/**
 * JPEG는 투명을 담지 못해서, 투명한 그림을 그냥 바꾸면 그 부분이 까맣게 됩니다.
 * 프롬프트에 "배경은 분위기 있는 색감으로 채워줘"가 들어 있어 투명이 나올 일은 거의 없지만,
 * 혹시 나오더라도 앱 배경(slate-950)과 같은 색이면 티가 나지 않습니다.
 */
const BACKDROP = '#020617';

export interface StoredImage {
  image: string;
  mime: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    img.src = src;
  });
}

/**
 * base64 그림을 저장용 JPEG로 바꿉니다.
 *
 * **실패하면 원본을 그대로 돌려줍니다.** 용량을 줄이는 건 어디까지나 거들기일 뿐이고,
 * 이것 때문에 아이가 곤충을 저장하지 못하는 일이 있어서는 안 됩니다.
 */
export async function shrinkForStorage(image: string, mime: string): Promise<StoredImage> {
  try {
    if (typeof document === 'undefined') return { image, mime };

    const source = await loadImage(`data:${mime};base64,${image}`);
    const longest = Math.max(source.width, source.height);
    if (!longest) return { image, mime };

    const scale = Math.min(1, MAX_EDGE / longest);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { image, mime };

    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const encoded = dataUrl.split(',')[1];
    if (!encoded) return { image, mime };

    // 어떤 이유로든 원본보다 커졌다면 바꾸지 않는 편이 낫습니다.
    if (encoded.length >= image.length) return { image, mime };

    return { image: encoded, mime: 'image/jpeg' };
  } catch {
    return { image, mime };
  }
}
