// 🏆 지난 행사(대전) 1~10위 — 인천 순위표 옆에 작게 (2026-11-20 Jin: "대전 행사 순위 10위까지 공격력 나타내서")
//
// 지난 행사 기간(PAST_EVENT)의 배틀 기록에서 아이별 최고 점수로 1~10위를 뽑는다 (랭킹 화면과 같은 기준).
// 테스트 번호(900~)·직원 번호(450~500)는 뺀다. 그림은 안 받는다 (가볍게).
// 공격력은 카드와 같은 값 (statsForInsect — 지금 레벨업 포인트·보너스까지 반영된 값).
// 지난 행사 기록은 이제 안 바뀌므로 한 번만 받으면 된다.
import { supabase } from './supabaseClient';
import { PAST_EVENT } from './event-config';
import { isStaffTicket, isTestTicket } from './ticket';
import { statsForInsect } from './insect-stats';
import { loadKidNames } from './kid-names';

export interface PastRankRow {
  rank: number;
  nickname: string;
  kid: string;
  species: string | null;
  level: number;
  atk: number;
  score: number;
}

export async function loadPastTop10(): Promise<PastRankRow[]> {
  try {
    let q = supabase
      .from('battles')
      .select('player_id, insect_id, score')
      .gte('created_at', PAST_EVENT.from)
      .order('score', { ascending: false })
      .limit(2000);
    if (PAST_EVENT.to) q = q.lt('created_at', PAST_EVENT.to);
    const [{ data: battles }, { data: players }] = await Promise.all([
      q,
      supabase.from('players').select('id, ticket_code').limit(5000),
    ]);
    const skip = new Set(
      (players || []).filter((p: any) => isTestTicket(p.ticket_code) || isStaffTicket(p.ticket_code)).map((p: any) => p.id)
    );
    const best = new Map<string, { insect_id: string; score: number }>();
    (battles || []).forEach((r: any) => {
      if (skip.has(r.player_id)) return;
      const cur = best.get(r.player_id);
      if (!cur || r.score > cur.score) best.set(r.player_id, { insect_id: r.insect_id, score: r.score });
    });
    const top = Array.from(best.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 10);
    if (!top.length) return [];

    const [{ data: insects }, kids] = await Promise.all([
      supabase
        .from('insects')
        .select('id, nickname, species, level, body_parts, age_stage, mutations, origin, stats')
        .in('id', top.map(([, v]) => v.insect_id)),
      loadKidNames(top.map(([pid]) => pid)),
    ]);
    const byId = new Map((insects || []).map((i: any) => [i.id, i]));
    return top.map(([pid, v], i) => {
      const ins: any = byId.get(v.insect_id) || {};
      let atk = 0;
      try {
        atk = Math.round(statsForInsect(ins).atk);
      } catch {
        atk = 0;
      }
      return {
        rank: i + 1,
        nickname: ins.nickname || '이름없음',
        kid: kids.get(pid) || '',
        species: ins.species ?? null,
        level: ins.level ?? 1,
        atk,
        score: Math.round(v.score),
      };
    });
  } catch {
    return [];
  }
}
