import { supabase } from './supabaseClient';

interface PendingProfile {
  nickname: string;
  marketingConsent: boolean;
}

// 가입 정보(닉네임/마케팅 동의)를 로그인 리다이렉트 URL의 쿼리 파라미터로 실어 보냅니다.
// 로그인 링크를 다른 브라우저(예: 메일 앱 내장 브라우저)에서 열어도 정보가 유지되도록 하기 위함입니다.
function buildRedirectTo(profile: PendingProfile) {
  const params = new URLSearchParams({
    nickname: profile.nickname,
    consent: profile.marketingConsent ? '1' : '0',
  });
  return `${window.location.origin}/auth/finish?${params.toString()}`;
}

export async function signInWithGoogle(profile: PendingProfile) {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: buildRedirectTo(profile) },
  });
}

export async function sendMagicLink(email: string, profile: PendingProfile) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: buildRedirectTo(profile) },
  });
}
