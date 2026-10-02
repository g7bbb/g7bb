/**
 * 아이들이 실제로 접속하는 앱 주소.
 *
 * 🔴 **종이에 인쇄하는 QR 은 반드시 이 주소여야 합니다.**
 *
 * 예전에는 `/print` 가 `window.location.origin` 을 썼습니다. 그러면 화면을 어디서
 * 열었느냐에 따라 QR 주소가 달라집니다. 개발할 때 쓰는 `npm run dev`(localhost:3000)
 * 에서 인쇄하면 **300장 전부 `http://localhost:3000/...` 이 박힌 죽은 종이**가 됩니다.
 * 부스에서 아이가 찍어도 아무것도 안 열리고, 이미 인쇄한 뒤라 되돌릴 수도 없습니다.
 * (2026-09-30 에 인쇄 직전 QR 을 실제로 디코드해보다 발견)
 *
 * 그래서 화면 주소와 **무관하게** 이 값을 씁니다.
 *
 * 주소가 바뀌면 Vercel 환경변수 `NEXT_PUBLIC_SITE_URL` 에 새 주소를 넣으면 됩니다.
 * (없으면 아래 기본값을 씁니다)
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://g7bb.vercel.app').replace(
  /\/+$/,
  ''
);

/** 종이·카드의 QR 이 가리키는 주소. 찍으면 번호가 채워진 시작 화면이 열립니다.
 *  pin(비밀번호 4자리, lib/ticket-pin.ts)이 있으면 같이 넣어 바로 들어오게 합니다. */
export function ticketUrl(ticket: string, pin?: string | null): string {
  return `${SITE_URL}/start?t=${encodeURIComponent(ticket)}${pin ? `&k=${pin}` : ''}`;
}

/**
 * 종이 아래 **보호자용 QR** 2개가 가리키는 곳 (2026-10-02 Jin).
 * ① 게임 설명: 카톡 채널의 게임 안내 글.
 * ② 곤충본부: 카톡 채널로 바로.
 */
/** ① 게임 설명 = Jin 이 곤충본부 액티비티 카톡 채널에 올린 "게임 안내" 글 (10/2 밤, 채널이 만든 QR 에서 읽은 주소).
 *  우리 /guide 화면도 같은 내용으로 남아 있다. */
export const GUIDE_URL = 'https://pf.kakao.com/_fMPCG/114783217?from=qr';
/** 곤충본부 카카오톡 채널 (10/2 Jin 확인: "QR 2 우리 카카오톡 채널 맞아") — 종이 ② QR 은 여기로 바로 간다 */
export const KAKAO_CHANNEL_URL = 'https://pf.kakao.com/_fMPCG';
/** ② 곤충본부 소개 = 카톡 채널의 곤충본부 소개 글 (10/2 밤 Jin 이 링크 줌) */
export const ABOUT_URL = 'https://pf.kakao.com/_fMPCG/114783238';
