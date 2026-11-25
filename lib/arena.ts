/**
 * ⚔️ 배틀 태블릿 (체험용 토너먼트, 2026-11-25 Jin)
 * "배틀 태블릿은 2대. 너가 준 링크로 켜진 태블릿으로만 배틀 — 다른 아이들이 핸드폰으로 들어오는 걸 막으려고"
 * → 직원이 태블릿에서 `/arena` 를 열고 직원 암호를 한 번 넣으면 그 기기에 "배틀 태블릿" 표시를 남긴다(localStorage).
 *   표시가 있는 기기만 /duel 에서 대결한다. 아이 폰은 /duel 을 열어도 "큰 화면으로 응원해줘" 만 보인다.
 */
const KEY = 'g7bb-arena-device';

export function isArenaDevice(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setArenaDevice(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    // 저장 못 해도 무시
  }
}
