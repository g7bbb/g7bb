import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// 베타 단계에서는 브라우저에서 Supabase를 직접 호출합니다 (별도 백엔드 없이 단순하게).
// flowType: 'implicit' 로 두면 OAuth/매직링크 콜백을 별도 서버 라우트 없이
// 클라이언트 페이지에서 그대로 처리할 수 있습니다 (지금 앱 구조와 동일하게 유지).
export const supabase = createClient(url, anonKey, {
  auth: { flowType: 'implicit' },
});
