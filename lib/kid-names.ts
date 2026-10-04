import { supabase } from './supabaseClient';

/**
 * 순위판에 곤충 이름과 같이 보여줄 **아이 닉네임** (10/4 Jin: "곤충 이름인지 닉네임인지 모르겠어, 이름을 작게 넣어줘").
 * players 의 id·이름 두 칸만 받는다 (가볍게). 실패하면 빈 값 — 이름이 없어도 순위판은 떠야 한다.
 */
export async function loadKidNames(playerIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(playerIds)).filter(Boolean);
  if (ids.length === 0) return new Map();
  try {
    const { data } = await supabase.from('players').select('id, display_name').in('id', ids);
    return new Map((data || []).map((p: any) => [p.id as string, String(p.display_name || '')]));
  } catch {
    return new Map();
  }
}
