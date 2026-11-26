// 🧹 오늘 기록 지우기 (11/26 Jin: "수동으로 삭제할 수 있는 삭제 혹은 초기화 버튼") — 직원 화면 /admin/reset
//
// 지우는 대상 = 다같이 보기·토너먼트에 나오는 것: **오늘(한국 날짜)** 들어온 아이·오늘 만든 곤충 + 리허설 번호(951~953).
// - 오늘 처음 들어온 아이 · 테스트 번호(900~) → 아이 줄째 지운다 (곤충·배틀·하트는 DB 가 같이 지움, on delete cascade)
// - 예전 행사 아이가 오늘 곤충을 만들었으면 → **오늘 곤충만** 지운다 (행사 기록·2만원 "캐릭터 보존" 약속 지키기)
// - 직원 번호(450~500)·T-ROOM(체험 모드 스위치) 은 건드리지 않는다. 토너먼트 표는 따로 비운다.
import { supabase } from './supabaseClient';
import { NO_PIN_TICKETS, isStaffTicket, isTestTicket } from './ticket';
import { ROOM_TICKET, saveTournament, todayStartIso } from './tournament';

export interface ResetRow {
  pid: string;
  ticket: string;
  kid: string;
  /** 아이 줄째 지우나 (아니면 오늘 곤충만) */
  whole: boolean;
  test: boolean;
  insects: { id: string; nick: string; at: string }[];
  at: string;
}

export async function loadResetRows(): Promise<ResetRow[]> {
  const since = todayStartIso();
  const [{ data: ps, error: e1 }, { data: ins, error: e2 }, { data: tps }] = await Promise.all([
    supabase.from('players').select('id, ticket_code, display_name, created_at').gte('created_at', since).limit(1000),
    supabase.from('insects').select('id, player_id, nickname, created_at').gte('created_at', since).limit(2000),
    supabase.from('players').select('id, ticket_code, display_name, created_at').in('ticket_code', NO_PIN_TICKETS),
  ]);
  if (e1 || e2) throw new Error('불러오지 못했어요');
  const players = new Map<string, any>();
  (ps || []).forEach((p: any) => players.set(p.id, { ...p, today: true }));
  (tps || []).forEach((p: any) => !players.has(p.id) && players.set(p.id, { ...p, today: false }));
  const insects: any[] = [...(ins || [])];
  // 리허설 번호는 예전에 만든 곤충도 리허설 화면에 나오므로 전부
  const testIds = (tps || []).map((p: any) => p.id);
  if (testIds.length) {
    const { data: old } = await supabase.from('insects').select('id, player_id, nickname, created_at').in('player_id', testIds);
    (old || []).forEach((r: any) => !insects.some((x) => x.id === r.id) && insects.push(r));
  }
  // 오늘 곤충을 만든 예전 아이
  const missing = Array.from(new Set(insects.map((r) => r.player_id))).filter((id) => !players.has(id));
  for (let i = 0; i < missing.length; i += 100) {
    const { data } = await supabase.from('players').select('id, ticket_code, display_name, created_at').in('id', missing.slice(i, i + 100));
    (data || []).forEach((p: any) => players.set(p.id, { ...p, today: false }));
  }
  const rows: ResetRow[] = [];
  players.forEach((p) => {
    if (p.ticket_code === ROOM_TICKET || isStaffTicket(p.ticket_code)) return;
    const test = isTestTicket(p.ticket_code);
    const mine = insects
      .filter((r) => r.player_id === p.id)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((r) => ({ id: r.id, nick: r.nickname || '곤충', at: r.created_at }));
    if (!p.today && !test && !mine.length) return;
    rows.push({ pid: p.id, ticket: p.ticket_code || '', kid: p.display_name || '', whole: p.today || test, test, insects: mine, at: p.created_at });
  });
  return rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export async function deleteResetRow(r: ResetRow): Promise<void> {
  if (r.whole) {
    const { error } = await supabase.from('players').delete().eq('id', r.pid);
    if (error) throw error;
    return;
  }
  if (r.insects.length) {
    const { error } = await supabase.from('insects').delete().in('id', r.insects.map((i) => i.id));
    if (error) throw error;
  }
  // 토너먼트 신호도 지우기 (예전 아이 줄은 남으니까)
  const { data } = await supabase.from('players').select('survey').eq('id', r.pid).maybeSingle();
  const survey = (data as any)?.survey;
  if (survey && survey.duel) {
    const { duel: _drop, ...rest } = survey;
    await supabase.from('players').update({ survey: rest }).eq('id', r.pid);
  }
}

/** 전부 지우기 + 토너먼트 표 비우기. 실패한 줄 수를 돌려준다 */
export async function resetAll(rows: ResetRow[]): Promise<number> {
  let failed = 0;
  for (const r of rows) {
    try {
      await deleteResetRow(r);
    } catch {
      failed++;
    }
  }
  await saveTournament(null);
  return failed;
}
