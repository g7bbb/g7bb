export interface PlayerSession {
  id: string;
  loginId: string;
  displayName: string;
}

const KEY = 'insect_battle_player';

// 로그인 상태를 서버 없이 이 브라우저(=이 휴대폰)에만 저장합니다.
// 베타 단계에서는 "같은 기기로 계속 들어오면 로그인 유지" 정도면 충분합니다.
export function getSession(): PlayerSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(session: PlayerSession) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
}
