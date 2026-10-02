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
 * 종이 아래 **보호자용 QR** 2개가 가리키는 화면 (2026-10-02 Jin).
 * 우리 사이트 안의 화면이라, 종이를 뽑은 뒤에도 내용을 고칠 수 있다 (QR 은 주소만 담는다).
 */
export const GUIDE_URL = `${SITE_URL}/guide`;
export const ABOUT_URL = `${SITE_URL}/about`;
