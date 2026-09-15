import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// 베타 단계에서는 브라우저에서 Supabase를 직접 호출합니다 (별도 백엔드 없이 단순하게).
export const supabase = createClient(url, anonKey);
