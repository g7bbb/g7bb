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

/**
 * 테스트 번호 (2026-10-02 Jin: "현장 테스트 때 30분 안 기다리고 배틀을 계속 하게").
 * 번호 숫자가 **900 이상**이면(A-900 ~ A-999) 게임 횟수·30분 대기 없이 계속 할 수 있다.
 * ⚠️ 종이를 900장 넘게 뽑으면 진짜 아이가 이 번호를 받게 된다 — 그때는 숫자를 올릴 것.
 */
export const TEST_TICKET_FROM = 900;
/**
 * 🧑‍🏫 직원이 상대 곤충을 만들어 둔 번호 (10/3 Jin: "캐릭터가 하나도 없어서 450~500번으로 몇 개 만들게").
 * 종이 묶음에서 빼둔 번호다. 지금은 'N번째 손님' 순서에서만 뺀다 (배틀 상대·랭킹에는 그대로 나옴).
 */
export const STAFF_TICKET_RANGE: [number, number] = [450, 500];
export function isStaffTicket(code: string | null | undefined): boolean {
  const m = /^[A-Z]-(\d{3})$/.exec(code ?? '');
  return !!m && Number(m[1]) >= STAFF_TICKET_RANGE[0] && Number(m[1]) <= STAFF_TICKET_RANGE[1];
}

/**
 * 🔓 비밀번호 없이 번호만 치면 바로 들어가는 번호 (2026-10-06 Jin: "951번은 입력하면 바로 접속하게").
 * 개발·시운전용. 번호를 더 넣으려면 이 목록에만 추가하면 된다. ⚠️ 진짜 아이 번호(900 미만)는 넣지 말 것.
 */
export const NO_PIN_TICKETS = ['A-951'];
export function skipsPin(code: string | null | undefined): boolean {
  return !!code && NO_PIN_TICKETS.includes(code);
}

export function isTestTicket(code: string | null | undefined): boolean {
  const m = /^[A-Z]-(\d{3})$/.exec(code ?? '');
  return !!m && Number(m[1]) >= TEST_TICKET_FROM;
}

/**
 * 화면·종이에 보여줄 번호 (2026-10-02 Jin: "A 는 이제 아예 다 빼줘, 숫자만").
 * 안쪽(DB·QR·비밀번호 계산)은 그대로 `A-014` 이고, **보여줄 때만** `014` 로 바꾼다.
 * A 가 아닌 금액별 종이(B-007 등)는 글자를 그대로 둔다 (그건 금액 표시라서).
 */
export function displayTicket(code: string | null | undefined): string {
  if (!code) return '';
  return code.startsWith('A-') ? code.slice(2) : code;
}
