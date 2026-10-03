// 한 아이의 뱃지를 DB 에서 모아 세는 곳 (뱃지 화면 · 배틀 화면이 같이 쓴다).
// 뱃지 규칙 자체는 lib/badges.ts.
import { supabase } from './supabaseClient';
import { Player } from './types';
import { BadgeFacts, countBadges, earnedBadges, heldBadges, speciesBeatKey } from './badges';
import { readGameState, saveBadgeCount } from './game-state';
import { tierForPlayer } from './tiers';
import { findSpecies } from './species';
import { hasAnyMutation } from './mutations';
import { isStaffTicket, isTestTicket } from './ticket';

/**
 * 🎊 이 아이가 행사에서 몇 번째 손님인지 (10/3 Jin: "1·10·100·200·300·400·500번째 손님 업적").
 * = 곤충을 처음 만든 순서. 테스트 번호(900~)와 직원 번호(450~500)는 빼고 센다.
 * 곤충을 아직 안 만들었거나 못 읽으면 null. 곤충 수백 줄의 player_id·시각만 받아서 가볍다.
 */
export async function visitorNumber(playerId: string): Promise<number | null> {
  try {
    const [{ data: insects }, { data: players }] = await Promise.all([
      supabase.from('insects').select('player_id, created_at').order('created_at', { ascending: true }).limit(5000),
      supabase.from('players').select('id, ticket_code').limit(5000),
    ]);
    const skip = new Set(
      (players || []).filter((p: any) => isTestTicket(p.ticket_code) || isStaffTicket(p.ticket_code)).map((p: any) => p.id)
    );
    const rows = [...(insects || [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
    const seen = new Set<string>();
    for (const row of rows as any[]) {
      if (skip.has(row.player_id) || seen.has(row.player_id)) continue;
      seen.add(row.player_id);
      if (row.player_id === playerId) return seen.size;
    }
    return null;
  } catch {
    return null;
  }
}

export interface BadgeSnapshot {
  facts: BadgeFacts;
  earned: Set<string>;
  /** 조건은 채웠지만 게임 수 한도 때문에 다음 게임에서 열리는 뱃지 */
  held: Set<string>;
  /** 개수에 세는 뱃지 수 (참가권 뱃지 빼고) */
  count: number;
}

export async function loadBadgeSnapshot(player: Player): Promise<BadgeSnapshot> {
  const { data: insects } = await supabase
    .from('insects')
    .select('id, species, mutations, level, judge_rank')
    .eq('player_id', player.id);
  const ids = (insects || []).map((row: any) => row.id);

  const [{ count: battles }, { data: winRows }, { count: hearts }, visitorNo] = await Promise.all([
    supabase.from('battles').select('id', { count: 'exact', head: true }).eq('player_id', player.id),
    supabase.from('battles').select('opponent_insect_id').eq('player_id', player.id).eq('result', 'win').limit(500),
    ids.length
      ? supabase.from('hearts').select('insect_id', { count: 'exact', head: true }).in('insect_id', ids)
      : Promise.resolve({ count: 0 } as any),
    ids.length ? visitorNumber(player.id) : Promise.resolve(null),
  ]);

  // 이긴 상대들의 곤충 종류 (도장 깨기 뱃지). 연습 게임 승리는 배틀 기록이 없어서
  // 배틀 화면이 이길 때 바로 `beat_…` 뱃지로 저장해 둔다.
  const foeIds = Array.from(new Set((winRows || []).map((r: any) => r.opponent_insect_id).filter(Boolean)));
  let beatSpecies: string[] = [];
  if (foeIds.length) {
    const { data: foes } = await supabase.from('insects').select('species').in('id', foeIds);
    beatSpecies = Array.from(new Set((foes || []).map((f: any) => speciesBeatKey(f.species))));
  }

  const state = readGameState(player);
  const facts: BadgeFacts = {
    insectCount: ids.length,
    sessions: state.sessions.length,
    battles: battles ?? 0,
    wins: (winRows || []).length,
    maxLevel: Math.max(0, ...(insects || []).map((row: any) => row.level ?? 1)),
    hearts: hearts ?? 0,
    judged: (insects || []).some((row: any) => row.judge_rank),
    evolved: (insects || []).some((row: any) => row.mutations && hasAnyMutation(row.mutations, row.species)),
    mySpecies: (insects || []).some((row: any) => row.species && !findSpecies(row.species)),
    tierKey: tierForPlayer(player).key,
    beatSpecies,
    stored: { ...state.badges },
    visitorNo,
  };
  const earned = earnedBadges(facts);
  const held = heldBadges(facts);
  const count = countBadges(earned);
  // 내 곤충이 남의 배틀에 상대로 나올 때 버프를 주려고 개수를 적어둔다.
  void saveBadgeCount(player.id, count);
  return { facts, earned, held, count };
}
