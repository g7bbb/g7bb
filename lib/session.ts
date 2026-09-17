import { supabase } from './supabaseClient';
import { Player } from './types';

// Supabase Auth 세션에서 로그인한 사용자의 players 행을 가져옵니다.
// 로그인은 되어 있는데 아직 players 행이 없다면(가입 마무리 전 이탈 등) null을 반환합니다.
export async function getCurrentPlayer(): Promise<Player | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('players').select('*').eq('id', user.id).maybeSingle();
  return (data as Player) ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
}
