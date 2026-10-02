// 🔐 종이 번호 비밀번호 4자리 — **서버에서만** 쓴다 (2026-10-02 Jin: "번호만 쳐서 남의 캐릭터로 들어갈 수 있다").
//
// 번호(A-014)는 랭킹·카드에 보이므로 누구나 알 수 있다. 그래서 종이에 비밀번호 4자리를 같이 찍고,
// 종이 QR 에는 그 비밀번호가 들어간다(/start?t=A-014&k=4827). 번호만 쳐서는 못 들어온다.
//
// 비밀번호는 저장하지 않고 **번호에서 계산**한다(HMAC). 그래서 DB 변경이 없고 몇 장을 뽑든 똑같이 나온다.
// ⚠️ **SECRET 을 바꾸면 이미 뽑은 종이의 비밀번호가 전부 틀리게 된다.** 종이를 뽑은 뒤에는 절대 바꾸지 말 것.
// ⚠️ 이 파일은 API(app/api/ticket-*) 에서만 불러온다. 화면 코드에서 불러오면 SECRET 이 브라우저로 새어 나간다.
import { createHmac } from 'crypto';
import { normalizeTicket } from './ticket';

const SECRET = 'g7bb-ticket-f006e74b096de5e3f9af718a13da63d8';

export function ticketPin(ticket: string): string | null {
  const code = normalizeTicket(ticket);
  if (!code) return null;
  const n = createHmac('sha256', SECRET).update(code).digest().readUInt32BE(0) % 10000;
  return String(n).padStart(4, '0');
}

export function checkTicketPin(ticket: string, pin: string): boolean {
  const right = ticketPin(ticket);
  return !!right && String(pin ?? '').replace(/\D/g, '') === right;
}

/** 직원 암호(ADMIN_CODE) 확인 — app/api/admin-auth 와 같은 규칙 (NFC + 앞뒤 공백 제거) */
export function isAdminCode(code: unknown): boolean {
  const tidy = (v: string) => v.normalize('NFC').trim();
  const admin = process.env.ADMIN_CODE ? tidy(process.env.ADMIN_CODE) : '';
  return !!admin && typeof code === 'string' && tidy(code) === admin;
}
