import { supabase } from './supabaseClient';

// "예쁜 곤충" 하트 투표입니다.
//
// 하트는 아이들이 서로 구경하며 누르는 재미 요소이고, **최종 순위는 운영자가 정합니다**.
// 친구끼리 몰아주기가 있을 수 있어서 하트 수는 심사 화면에 참고용으로만 보여줍니다.

// 곤충별 하트 개수를 한 번에 세어 옵니다.
export async function loadHeartCounts(): Promise<Map<string, number>> {
  const { data } = await supabase.from('hearts').select('insect_id');
  const counts = new Map<string, number>();
  (data || []).forEach((row: any) => {
    counts.set(row.insect_id, (counts.get(row.insect_id) ?? 0) + 1);
  });
  return counts;
}

// 내가 하트를 누른 곤충들을 가져옵니다.
export async function loadMyHearts(playerId: string): Promise<Set<string>> {
  const { data } = await supabase.from('hearts').select('insect_id').eq('player_id', playerId);
  return new Set((data || []).map((row: any) => row.insect_id));
}

// 이미 눌렀으면 취소, 아니면 추가합니다.
export async function toggleHeart(insectId: string, playerId: string, liked: boolean) {
  if (liked) {
    await supabase.from('hearts').delete().eq('insect_id', insectId).eq('player_id', playerId);
  } else {
    await supabase.from('hearts').insert({ insect_id: insectId, player_id: playerId });
  }
}
