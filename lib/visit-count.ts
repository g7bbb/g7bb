import { supabase } from './supabaseClient';

// 카드 등급(기본·은·금·홀로그램)을 매기려면 **그 곤충이 그 아이의 몇 번째 곤충인지**를 알아야 합니다.
//
// ⚠️ **회차를 DB에 저장하지 않는 것이 의도입니다.** 컬럼을 추가하면 마이그레이션이 필요하고,
// 그걸 안 돌린 채 배포하면 곤충 저장이 통째로 막힙니다. 행사 직전에 감수할 위험이 아닙니다.
// 대신 "그 아이가 만든 곤충을 시간순으로 세어" 회차를 구합니다.

/**
 * 모든 곤충의 "몇 번째인지"를 한 번에 구합니다. (곤충 id → 1, 2, 3 …)
 *
 * **왜 통째로 불러오나**: 랭킹·갤러리·배틀은 여러 아이의 곤충을 섞어 보여줍니다.
 * 아이마다 따로 세면 조회가 수십 번 나가므로, `id / player_id / created_at` **세 칸만**
 * 한 번에 받아 화면에서 셉니다. 이미지가 빠져 있어 1000마리라도 100KB 남짓입니다.
 *
 * **실패하면 빈 Map 을 돌려줍니다.** 등급 테두리는 없어도 되는 장식이라,
 * 이것 때문에 랭킹이나 갤러리가 안 뜨면 안 됩니다.
 */
export async function loadVisitMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const { data } = await supabase
      .from('insects')
      .select('id, player_id, created_at')
      .order('created_at', { ascending: true });

    const seen = new Map<string, number>();
    (data || []).forEach((row: any) => {
      const n = (seen.get(row.player_id) ?? 0) + 1;
      seen.set(row.player_id, n);
      map.set(row.id, n);
    });
  } catch {
    // 조용히 넘어갑니다. 등급 없이 기본 테두리로 보입니다.
  }
  return map;
}

/**
 * 한 아이가 지금까지 만든 곤충 개수.
 *
 * **아직 저장하지 않은 곤충의 회차**를 구할 때 씁니다 (곤충 만들기 결과 화면).
 * 지금 만드는 것이 `이 값 + 1` 번째입니다.
 *
 * 실패하면 0 을 돌려줍니다 → 첫 카드로 보입니다. 화면이 멈추는 것보다 낫습니다.
 */
export async function countInsectsForPlayer(playerId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('insects')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId);
    return count ?? 0;
  } catch {
    return 0;
  }
}
