// 한 아이의 뱃지를 DB 에서 모아 세는 곳 (뱃지 화면 · 배틀 화면이 같이 쓴다).
// 뱃지 규칙 자체는 lib/badges.ts.
import { supabase } from './supabaseClient';
import { Player } from './types';
import { BadgeFacts, countBadges, earnedBadges, speciesBeatKey } from './badges';
import { readGameState, saveBadgeCount } from './game-state';
import { tierForPlayer } from './tiers';
import { findSpecies } from './species';
import { hasAnyMutation } from './mutations';

export interface BadgeSnapshot {
  facts: BadgeFacts;
  earned: Set<string>;
  /** 개수에 세는 뱃지 수 (참가권 뱃지 빼고) */
  count: number;
}

export async function loadBadgeSnapshot(player: Player): Promise<BadgeSnapshot> {
  const { data: insects } = await supabase
    .from('insects')
    .select('id, species, mutations, level, judge_rank')
    .eq('player_id', player.id);
  const ids = (insects || []).map((row: any) => row.id);

  const [{ count: battles }, { data: winRows }, { count: hearts }] = await Promise.all([
    supabase.from('battles').select('id', { count: 'exact', head: true }).eq('player_id', player.id),
    supabase.from('battles').select('opponent_insect_id').eq('player_id', player.id).eq('result', 'win').limit(500),
    ids.length
      ? supabase.from('hearts').select('insect_id', { count: 'exact', head: true }).in('insect_id', ids)
      : Promise.resolve({ count: 0 } as any),
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
  };
  const earned = earnedBadges(facts);
  const count = countBadges(earned);
  // 내 곤충이 남의 배틀에 상대로 나올 때 버프를 주려고 개수를 적어둔다.
  void saveBadgeCount(player.id, count);
  return { facts, earned, count };
}
