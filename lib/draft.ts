// 📝 쓰던 거 임시 저장 (2026-10-03 밤 Jin: "QR 로 들어왔다가 중간에 꺼지면 글 많이 쓴 게 다 날아가서 멘붕")
//
// 태블릿·폰은 맨 아래 "그림 찍기" 에서 카메라를 열 때 브라우저 탭을 꺼버리는 일이 흔하다 (메모리가 모자라서).
// 그러면 위에서 고른 것·쓴 것이 다 사라진다. → 고칠 때마다 **그 기기에** 적어두고, 다시 열면 채워준다.
//
// - 종이 번호마다 따로 (`start:A-014`, `upload:A-014`) — 같은 태블릿을 다음 아이가 써도 섞이지 않는다.
// - 로그아웃해도 안 지운다 (같은 종이 QR 로 다시 오면 이어서). 다 끝나면(저장 성공) 지운다.
// - 6시간 지난 건 버린다. 저장 공간이 꽉 차는 등 실패해도 조용히 넘어간다 (임시 저장 때문에 체험이 막히면 안 됨).
const PREFIX = 'g7bb-draft:';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function saveDraft(key: string, data: unknown): boolean {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    return true;
  } catch {
    return false;
  }
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (!parsed || Date.now() - parsed.at > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // 무시
  }
}
