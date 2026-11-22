import { supabase } from './supabaseClient';
import { SEASON_FROM } from './event-config';
import { isStaffTicket, isTestTicket } from './ticket';

/** 이번 행사에서 아이들이 만든 곤충 목록 (글자만, 그림은 lib/image-cache) — 곤충 벽(/wall)·곤충 필드(/field) 공용 */
export interface RosterInsect {
  id: string;
  nickname: string;
  species: string;
  level: number;
  origin: string | null;
  kid: string;
}

/** 테스트(900~)·직원(450~500) 번호와 대전 때 곤충은 뺀다. 오래된 것부터. */
export async function loadSeasonInsects(limit = 600): Promise<RosterInsect[]> {
  const { data } = await supabase
    .from('insects')
    .select('id, player_id, nickname, species, level, origin, created_at')
    .gte('created_at', SEASON_FROM)
    .order('created_at', { ascending: true })
    .limit(limit);
  const rows = data || [];
  const pids = Array.from(new Set(rows.map((r: any) => r.player_id))).filter(Boolean);
  const players = new Map<string, { name: string; ticket: string }>();
  for (let i = 0; i < pids.length; i += 100) {
    const { data: ps } = await supabase.from('players').select('id, display_name, ticket_code').in('id', pids.slice(i, i + 100));
    (ps || []).forEach((p: any) => players.set(p.id, { name: String(p.display_name || ''), ticket: String(p.ticket_code || '') }));
  }
  return rows
    .filter((r: any) => {
      const p = players.get(r.player_id);
      return p && !isTestTicket(p.ticket) && !isStaffTicket(p.ticket);
    })
    .map((r: any) => ({
      id: r.id,
      nickname: r.nickname || '곤충',
      species: r.species || '곤충',
      level: r.level ?? 1,
      origin: r.origin ?? null,
      kid: players.get(r.player_id)?.name || '',
    }));
}
