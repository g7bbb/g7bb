import { supabase } from './supabaseClient';
import { Player } from './types';

// 부스 환경에서는 로그인 대신 "종이에 인쇄된 참가 번호"로 본인을 확인합니다.
// 한 번 시작하면 그 기기의 브라우저에 참가자 id를 저장해두어, 화면을 옮겨다녀도 이어집니다.
const STORAGE_KEY = 'insect-battle-player-id';

function readStoredId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // 시크릿 모드 등에서 저장소가 막혀 있어도 앱이 멈추지 않도록 합니다.
    return null;
  }
}

export function rememberPlayer(playerId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, playerId);
  } catch {
    // 저장을 못 해도 이번 화면 흐름은 그대로 진행됩니다.
  }
}

export async function getCurrentPlayer(): Promise<Player | null> {
  const playerId = readStoredId();
  if (!playerId) return null;

  const { data } = await supabase.from('players').select('*').eq('id', playerId).maybeSingle();
  return (data as Player) ?? null;
}

// 같은 번호로 다시 들어온 아이가 자기 곤충을 이어받을 수 있게 합니다.
export async function findPlayerByTicket(ticketCode: string): Promise<Player | null> {
  const { data } = await supabase
    .from('players')
    .select('*')
    .eq('ticket_code', ticketCode)
    .maybeSingle();
  return (data as Player) ?? null;
}

export function signOut() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 지우지 못해도 무시합니다.
  }
}
