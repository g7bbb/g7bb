// 🔐 비밀번호 4자리 — 화면 쪽 도우미. 계산은 서버(lib/ticket-pin.ts)만 한다.
import { normalizeTicket } from './ticket';

const PIN_KEY = 'g7bb-ticket-pin:';
const ADMIN_CODE_KEY = 'insect-battle-admin-code';

/** 번호 + 비밀번호가 맞는지 서버에 물어본다. 연결이 안 되면 false. */
export async function verifyTicketPin(ticket: string, pin: string): Promise<boolean> {
  try {
    const res = await fetch('/api/ticket-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket, pin }),
    });
    const data = await res.json().catch(() => null);
    return !!data?.ok;
  } catch {
    return false;
  }
}

/** 맞은 비밀번호를 이 기기에 기억 — 카드 QR 에 넣으려고 (카드 QR 을 찍으면 바로 들어오게) */
export function rememberTicketPin(ticket: string, pin: string) {
  const code = normalizeTicket(ticket);
  if (!code) return;
  try {
    window.localStorage.setItem(PIN_KEY + code, pin);
  } catch {
    // 기억 못 해도 카드 QR 을 찍으면 비밀번호만 한 번 더 치면 된다
  }
}

export function readTicketPin(ticket: string | null | undefined): string | null {
  const code = ticket ? normalizeTicket(ticket) : null;
  if (!code) return null;
  try {
    return window.localStorage.getItem(PIN_KEY + code);
  } catch {
    return null;
  }
}

/**
 * 직원 화면: 들어올 때 친 암호를 **그 기기에** 기억 (비밀번호 목록을 받을 때 쓴다).
 * 🔁 10/3 Jin: "사진 출력할 때도 다시 로그인해야 함" → 탭마다 묻던 것(sessionStorage)을 기기 기억(localStorage)으로.
 * 직원 메뉴(/admin)의 "🔒 직원 로그아웃" 으로 지울 수 있다.
 */
const ADMIN_FLAG_KEY = 'insect-battle-admin';
export function rememberAdminCode(code: string) {
  try {
    window.localStorage.setItem(ADMIN_CODE_KEY, code);
  } catch {
    // 무시
  }
}
export function readAdminCode(): string {
  try {
    return window.localStorage.getItem(ADMIN_CODE_KEY) ?? window.sessionStorage.getItem(ADMIN_CODE_KEY) ?? '';
  } catch {
    return '';
  }
}
/** 직원 암호를 통과한 기기인가 */
export function isAdminRemembered(): boolean {
  try {
    return window.localStorage.getItem(ADMIN_FLAG_KEY) === 'ok' && !!readAdminCode();
  } catch {
    return false;
  }
}
export function rememberAdminLogin(code: string) {
  try {
    window.localStorage.setItem(ADMIN_FLAG_KEY, 'ok');
  } catch {
    // 무시
  }
  rememberAdminCode(code);
}
export function forgetAdmin() {
  try {
    window.localStorage.removeItem(ADMIN_FLAG_KEY);
    window.localStorage.removeItem(ADMIN_CODE_KEY);
    window.sessionStorage.removeItem(ADMIN_FLAG_KEY);
    window.sessionStorage.removeItem(ADMIN_CODE_KEY);
  } catch {
    // 무시
  }
}

/** 직원 화면: 번호들의 비밀번호 받기 */
export async function fetchTicketPins(tickets: string[]): Promise<Record<string, string>> {
  const res = await fetch('/api/ticket-pins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: readAdminCode(), tickets }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || '비밀번호를 못 받아왔어요.');
  return data.pins as Record<string, string>;
}
