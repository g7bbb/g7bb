// 구글 시트 기록은 "있으면 좋은" 부가 기능입니다. 시트가 막히거나 인터넷이 잠깐 끊겨도
// 아이의 체험이 멈추면 안 되므로, 결과를 기다리지 않고 보내기만 하고 실패는 무시합니다.
export function logToSheet(row: Record<string, unknown>) {
  try {
    void fetch('/api/log-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 기록 실패는 조용히 넘어갑니다.
  }
}
