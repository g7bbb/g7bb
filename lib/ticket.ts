// 종이에 인쇄된 참가 번호(예: A-014)를 다루는 함수들입니다.
//
// 이 번호가 곧 아이의 신분증입니다. 비밀번호를 정하지 않으므로 잊어버릴 일이 없고,
// 시상할 때는 아이가 그 종이를 들고 오기 때문에 남이 번호만 알아서는 상품을 받을 수 없습니다.

// 영문 1글자 + 숫자 3자리. 가운데 하이픈은 있어도 없어도 인식합니다.
const TICKET_PATTERN = /^([A-Z])-?(\d{3})$/;

// 아이가 손으로 입력할 때를 대비해 공백/소문자/하이픈 누락을 모두 받아줍니다.
// **숫자만 쳐도 된다** (2026-10-01 Jin: "A- 를 직접 쓰는 게 불편해") — `910` → A-910, `14` → A-014.
// 종이는 A 한 종류만 뽑기 때문에 숫자만 오면 A 로 본다. 글자 뒤 숫자가 1~2자리여도 받아준다 (`a14` → A-014).
export function normalizeTicket(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  const digits = /^(\d{1,3})$/.exec(cleaned);
  if (digits) return Number(digits[1]) > 0 ? `A-${digits[1].padStart(3, '0')}` : null;
  const short = /^([A-Z])-?(\d{1,3})$/.exec(cleaned);
  if (short && Number(short[2]) > 0) return `${short[1]}-${short[2].padStart(3, '0')}`;
  const match = TICKET_PATTERN.exec(cleaned);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

export function isValidTicket(raw: string): boolean {
  return normalizeTicket(raw) !== null;
}

// 인쇄용 번호를 순서대로 만들어 줍니다. (A-001 ~ A-999, 그다음 B-001 ...)
export function ticketAt(index: number): string {
  const letter = String.fromCharCode(65 + Math.floor(index / 999));
  const number = String((index % 999) + 1).padStart(3, '0');
  return `${letter}-${number}`;
}
