// 🧪 테스트 세계 나누기 (2026-10-03 Jin: "900번대는 900번대끼리만, 오늘 행사 아이들과는 못 만나게")
//
// 테스트 번호(A-900~, `isTestTicket`)로 만든 곤충은 **테스트 번호 아이들에게만** 보이고,
// 진짜 아이들의 배틀 상대·랭킹·갤러리·예쁜 곤충 심사에는 안 나온다. 반대도 마찬가지.
//
// 번호는 players 에만 있어서, 화면마다 players 의 id·번호만 가볍게 받아와 나눈다 (그림 없음, 수십 KB).
// ⚠️ 받아오기에 실패하면 빈 Set = "테스트 아이 없음" 으로 본다. 화면이 멈추는 것보다 낫다.
import { supabase } from './supabaseClient';
import { isTestTicket } from './ticket';
import { Player } from './types';

/** 테스트 번호 아이들의 player id */
export async function loadTestPlayerIds(): Promise<Set<string>> {
  try {
    const { data } = await supabase.from('players').select('id, ticket_code').limit(5000);
    return new Set((data || []).filter((row: any) => isTestTicket(row.ticket_code)).map((row: any) => row.id));
  } catch {
    return new Set();
  }
}

/** 이 아이가 테스트 세계에 있나 (로그인 안 했으면 진짜 세계) */
export function isTestPlayer(player: Pick<Player, 'ticket_code'> | null | undefined): boolean {
  return !!player && isTestTicket(player.ticket_code);
}

/** 이 곤충(만든 아이)이 보는 사람과 같은 세계인가 */
export function sameWorld(ownerId: string, testIds: Set<string>, viewerIsTest: boolean): boolean {
  return testIds.has(ownerId) === viewerIsTest;
}

/**
 * 조금씩 끊어 불러오는 화면(갤러리·심사)용 — 쿼리 단계에서 같은 세계만 거른다.
 * 받아온 뒤 거르면 한 페이지가 비거나 모자라서 "더 보기" 가 엉킨다.
 */
export function filterWorldQuery<Q extends { in: any; not: any }>(query: Q, testIds: Set<string>, viewerIsTest: boolean): Q {
  const ids = Array.from(testIds);
  if (viewerIsTest) return query.in('player_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (!ids.length) return query;
  return query.not('player_id', 'in', `(${ids.join(',')})`);
}
