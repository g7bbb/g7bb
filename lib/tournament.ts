/**
 * ⚔️ (체험용) 수액 쟁탈 토너먼트 (2026-11-25 Jin)
 *
 * 흐름: 직원(노트북 + 큰 화면)이 "⚔️ 배틀 토너먼트 시작" → 오늘 만든 곤충들을 무작위로 섞어 대진표 →
 *       경기마다 지목된 두 아이가 **각자 태블릿·폰**에서 자기 QR 로 들어와 `/duel` 대기 화면 →
 *       둘 다 들어오면 "G7BB 배틀!! 시작!!" → 3·2·1 → 동시에 필살기 타이밍 → 결과 → 다음 경기. 결승만 3판 2선승.
 *
 * 🔌 기기 여러 대를 맞추는 방법 (DB 구조 변경 없음):
 *   - 대진표·진행 상황은 **직원 화면만** 쓰는 줄 하나에 둔다 → players 의 `ticket_code = 'T-ROOM'` 줄의 survey.tournament.
 *   - 아이 쪽 신호(들어왔어요·타이밍 결과)는 **그 아이 자기 줄**(players.survey.duel)에만 쓴다.
 *   → 한 줄을 두 기기가 동시에 고치는 일이 없어서 서로 덮어쓰지 않는다. 다들 1초마다 읽어 본다(실시간 기능 설정 필요 없음).
 *   - 시계는 기기마다 몇 초씩 틀려서 `/api/now`(서버 시각)와의 차이를 재서 맞춘다.
 *   - 승패는 **같은 씨앗(seed)으로 굴린 같은 계산**이라 어느 기기에서 계산해도 똑같이 나온다.
 */
import { supabase } from './supabaseClient';
import { Insect, Player } from './types';
import { statsForInsect } from './insect-stats';
import { BattleResult, BattleSide, resolveBattle, rollBattle } from './battle-engine';
import { baseMoveFor, movesFor, TIMING_TIERS } from './special-moves';
import { isStaffTicket, isTestTicket } from './ticket';

export const ROOM_TICKET = 'T-ROOM';

// ── 시간표 (startAt 기준 ms) ─────────────────────────────
/** "G7BB 배틀!! 시작!!" */
export const T_TITLE = 0;
/** 3 · 2 · 1 */
export const T_COUNT = 1200;
/** VS — 두 카드 쾅 */
export const T_VS = 4200;
/** ⚡ 필살기 타이밍 고리 (4초, 2초에 퍼펙트) */
export const T_CHANCE = 5400;
export const CHANCE_LEN = 4000;
/** 고리가 끝난 뒤 상대 기기 결과를 기다리는 여유 */
export const T_RESOLVE = T_CHANCE + CHANCE_LEN + 1800;
/** 결과 연출 길이 */
export const RESULT_LEN = 4500;
/** 상대 결과를 이만큼 기다려도 안 오면 "못 눌렀음" 으로 친다 */
export const WAIT_TIER_MS = 4000;

export interface Entrant {
  pid: string;
  iid: string;
  nick: string;
  kid: string;
  species: string;
  level: number;
}

export interface GameResult {
  seed: number;
  winner: 'a' | 'b';
  tierA: string;
  tierB: string;
  auto?: boolean;
}

export interface Match {
  id: string;
  round: number;
  slot: number;
  /** entrants 번호 (없으면 아직 안 정해짐 / 부전승) */
  a: number | null;
  b: number | null;
  winner: 'a' | 'b' | null;
  bestOf: 1 | 3;
  games: GameResult[];
  /** 지금 진행 중인 판의 씨앗과 시작 시각(서버 ms). 둘 다 들어와야 시작 시각이 정해진다 */
  seed?: number;
  startAt?: number;
}

export interface Tournament {
  id: string;
  createdAt: string;
  status: 'running' | 'done';
  entrants: Entrant[];
  rounds: Match[][];
  current: string | null;
}

/** 아이 쪽 신호 (그 아이 players.survey.duel) */
export interface DuelSignal {
  tid: string;
  mid: string;
  /** 몇 번째 판 (결승 3판 2선승) */
  g: number;
  joinedAt: number;
  /** 필살기 타이밍 결과 — 아직 안 눌렀으면 없음 */
  tier?: string;
}

// ── 시계 맞추기 ───────────────────────────────────────────
let offset = 0;
export async function syncClock(): Promise<number> {
  try {
    const t0 = Date.now();
    const res = await fetch('/api/now', { cache: 'no-store' });
    const { now } = await res.json();
    const t1 = Date.now();
    offset = now - (t0 + t1) / 2;
  } catch {
    offset = 0;
  }
  return offset;
}
export function serverNow(): number {
  return Date.now() + offset;
}

// ── 씨앗으로 굴리는 주사위 (같은 씨앗 = 같은 결과) ─────────
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tierMult(key: string | undefined): number {
  return TIMING_TIERS.find((t) => t.key === key)?.scoreMultiplier ?? 1;
}

/**
 * 한 판의 승패 — 두 곤충 + 씨앗 + 두 아이의 타이밍. 어느 기기에서 돌려도 같은 답.
 * 타이밍을 못 눌렀으면(tier 'miss') 필살기를 못 쓴 것으로 친다 (보통 배틀과 같은 규칙).
 */
export function computeDuel(a: Insect, b: Insect, seed: number, tierA: string, tierB: string): BattleResult {
  const random = seeded(seed);
  const sideA: BattleSide = { stats: statsForInsect(a), level: a.level, origin: a.origin ?? null };
  const sideB: BattleSide = { stats: statsForInsect(b), level: b.level, origin: b.origin ?? null };
  const rolls = rollBattle(sideA, sideB, random);
  const usedA = tierA === 'miss' ? [] : movesFor(a.species, a.level).map((m) => m.key);
  const usedB = tierB === 'miss' ? [] : movesFor(b.species, b.level).map((m) => m.key);
  const res = resolveBattle(rolls.a, rolls.b, usedA, usedB, tierMult(tierA), random, {
    a: rolls.a.bonus && tierA !== 'miss' ? baseMoveFor(a.species).key : null,
    b: rolls.b.bonus && tierB !== 'miss' ? baseMoveFor(b.species).key : null,
    defTypeA: baseMoveFor(a.species).kind === 'defense',
    defTypeB: baseMoveFor(b.species).kind === 'defense',
    edgeB: usedB.length ? tierMult(tierB) : 1,
  });
  // 토너먼트는 비김 없이 — 점수가 같으면 씨앗으로 정한다
  if (res.winner === 'draw') return { ...res, winner: random() < 0.5 ? 'A' : 'B' };
  return res;
}

// ── 대진표 ───────────────────────────────────────────────
function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * 참가 곤충을 섞어 1라운드를 만든다 (11/25 Jin: "부전승을 최소화").
 * 라운드마다 **최대한 많이 짝을 짓고, 홀수일 때만 1명 부전승** — 13명이면 6경기 + 1명 부전승 → 7명 → 3경기 + 1명 → 4명 → 준결승 → 결승.
 * 부전승은 되도록 한 번도 안 받은 아이에게 (같은 아이가 두 번 쉬지 않게). 다음 라운드는 앞 라운드가 끝나면 만든다.
 * 2명만 남은 라운드(결승)만 3판 2선승.
 */
export function makeTournament(entrants: Entrant[]): Tournament {
  const list = shuffle(entrants);
  const t: Tournament = {
    id: `t${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    status: 'running',
    entrants: list,
    rounds: [],
    current: null,
  };
  t.rounds.push(buildRound(t, 0, list.map((_, i) => i)));
  t.current = nextMatchId(t);
  return t;
}

/** 이 라운드에 올라온 아이들(entrants 번호)로 경기를 짠다. 홀수면 1명 부전승(바로 승리 처리). */
function buildRound(t: Tournament, round: number, players: number[]): Match[] {
  const order = [...players];
  if (order.length % 2 === 1) {
    // 부전승 받을 아이: 아직 한 번도 안 받은 아이 중 맨 뒤 (1라운드는 이미 섞여 있어서 사실상 무작위)
    const hadBye = new Set(t.rounds.flat().filter((m) => m.b === null && m.a !== null).map((m) => m.a));
    let pick = order.length - 1;
    for (let i = order.length - 1; i >= 0; i--) {
      if (!hadBye.has(order[i])) {
        pick = i;
        break;
      }
    }
    const [bye] = order.splice(pick, 1);
    order.push(bye);
  }
  const final = order.length === 2;
  const out: Match[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i];
    const b = i + 1 < order.length ? order[i + 1] : null;
    out.push({
      id: `r${round}m${out.length}`,
      round,
      slot: out.length,
      a,
      b,
      winner: b === null ? 'a' : null,
      bestOf: final ? 3 : 1,
      games: [],
    });
  }
  return out;
}

/** 지금 라운드가 다 끝났으면 다음 라운드를 만든다 (1명 남으면 끝) */
function maybeNextRound(t: Tournament) {
  const last = t.rounds[t.rounds.length - 1];
  if (!last || last.some((m) => !m.winner)) return;
  const winners = last.map((m) => (m.winner === 'a' ? m.a : m.b)).filter((x): x is number => x !== null);
  if (winners.length <= 1) {
    t.status = 'done';
    return;
  }
  t.rounds.push(buildRound(t, t.rounds.length, winners));
}

/** 참가 인원으로 본 전체 라운드 수 (13명 → 13·7·4·2 = 4라운드) */
export function totalRounds(t: Tournament): number {
  let n = t.entrants.length;
  let r = 0;
  while (n > 1) {
    n = Math.ceil(n / 2);
    r++;
  }
  return r;
}

/** 라운드마다 경기 수 (화면에 아직 안 만든 라운드 자리를 그릴 때) */
export function roundSizes(t: Tournament): number[] {
  const out: number[] = [];
  let n = t.entrants.length;
  while (n > 1) {
    out.push(Math.ceil(n / 2));
    n = Math.ceil(n / 2);
  }
  return out;
}

export function findMatch(t: Tournament, id: string | null | undefined): Match | null {
  if (!id) return null;
  for (const r of t.rounds) for (const m of r) if (m.id === id) return m;
  return null;
}

/** 다음에 할 경기 (양쪽이 다 정해졌고 아직 승자가 없는 것, 앞 라운드부터) */
export function nextMatchId(t: Tournament): string | null {
  for (const r of t.rounds) for (const m of r) if (!m.winner && m.a !== null && m.b !== null) return m.id;
  return null;
}

export function winsOf(m: Match): { a: number; b: number } {
  return { a: m.games.filter((g) => g.winner === 'a').length, b: m.games.filter((g) => g.winner === 'b').length };
}

/** 한 판 결과를 적고, 경기가 끝났으면(단판 / 3판 2선승) 승자를 정하고, 라운드가 끝났으면 다음 라운드를 만든다 */
export function recordGame(t: Tournament, mid: string, game: GameResult): Tournament {
  const copy: Tournament = JSON.parse(JSON.stringify(t));
  const m = findMatch(copy, mid);
  if (!m || m.winner) return copy;
  if (m.games.some((g) => g.seed === game.seed)) return copy; // 같은 판을 두 번 적지 않게
  m.games.push(game);
  m.seed = undefined;
  m.startAt = undefined;
  const w = winsOf(m);
  const need = m.bestOf === 3 ? 2 : 1;
  if (w.a >= need || w.b >= need) {
    m.winner = w.a >= need ? 'a' : 'b';
    maybeNextRound(copy);
    copy.current = nextMatchId(copy);
    if (!copy.current && copy.status !== 'done') maybeNextRound(copy);
    if (!copy.current) copy.status = 'done';
  }
  return copy;
}

export function roundName(t: Tournament, round: number): string {
  const left = totalRounds(t) - round;
  if (left === 1) return '🏆 결승';
  if (left === 2) return '준결승';
  return `${round + 1}라운드`;
}

export function champion(t: Tournament): Entrant | null {
  if (t.status !== 'done') return null;
  const final = t.rounds[t.rounds.length - 1]?.[0];
  if (!final?.winner) return null;
  const idx = final.winner === 'a' ? final.a : final.b;
  return idx === null ? null : t.entrants[idx];
}

// ── DB 읽고 쓰기 ─────────────────────────────────────────
async function roomRow(): Promise<{ id: string; survey: any } | null> {
  // 혹시 줄이 두 개 생겼어도 깨지지 않게 첫 줄만 (maybeSingle 은 두 줄이면 실패한다)
  const { data } = await supabase.from('players').select('id, survey').eq('ticket_code', ROOM_TICKET).order('created_at', { ascending: true }).limit(1);
  return ((data as any[]) ?? [])[0] ?? null;
}

export async function loadTournament(): Promise<Tournament | null> {
  try {
    const row = await roomRow();
    return (row?.survey?.tournament as Tournament) ?? null;
  } catch {
    return null;
  }
}

let saveChain: Promise<unknown> = Promise.resolve();
/**
 * 직원 화면만 부른다. 저장은 **한 번에 하나씩** 차례로 (동시에 두 번 저장하면 줄이 두 개 생기거나 앞 저장이 덮인다 — 테스트에서 실제로 겪음).
 */
export function saveTournament(t: Tournament | null): Promise<void> {
  const job = saveChain.then(() => saveNow(t));
  saveChain = job.catch(() => undefined);
  return job;
}

/** 🧪 체험 모드 켜고 끄기 (직원 메뉴) — 같은 T-ROOM 줄의 survey.mode. 토너먼트 저장과 같은 차례 줄로 (서로 덮지 않게) */
export function saveRoomMode(on: boolean): Promise<void> {
  const job = saveChain.then(async () => {
    const row = await roomRow();
    const mode = on ? 'class' : null;
    if (row) {
      const { error } = await supabase.from('players').update({ survey: { ...(row.survey ?? {}), mode } }).eq('id', row.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('players').insert({ ticket_code: ROOM_TICKET, display_name: '⚔️토너먼트', survey: { mode } });
      if (error) throw error;
    }
  });
  saveChain = job.catch(() => undefined);
  return job;
}

/** 체험 모드인지 (T-ROOM survey.mode === 'class') */
export async function loadRoomMode(): Promise<boolean> {
  const row = await roomRow();
  return row?.survey?.mode === 'class';
}

async function saveNow(t: Tournament | null): Promise<void> {
  const row = await roomRow();
  if (row) {
    const { error } = await supabase.from('players').update({ survey: { ...(row.survey ?? {}), tournament: t } }).eq('id', row.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('players')
      .insert({ ticket_code: ROOM_TICKET, display_name: '⚔️토너먼트', survey: { tournament: t } });
    if (error) throw error;
  }
}

/** 아이 기기: 내 줄에 신호 쓰기 (다른 칸은 그대로 두고 duel 만) */
export async function writeSignal(playerId: string, sig: DuelSignal): Promise<void> {
  const { data } = await supabase.from('players').select('survey').eq('id', playerId).maybeSingle();
  const survey = { ...(((data as any)?.survey as object) ?? {}), duel: sig };
  await supabase.from('players').update({ survey }).eq('id', playerId);
}

export async function readSignals(playerIds: string[]): Promise<Map<string, DuelSignal>> {
  const out = new Map<string, DuelSignal>();
  if (!playerIds.length) return out;
  const { data } = await supabase.from('players').select('id, survey').in('id', playerIds);
  (data || []).forEach((r: any) => {
    if (r.survey?.duel) out.set(r.id, r.survey.duel as DuelSignal);
  });
  return out;
}

export function signalFor(sig: DuelSignal | undefined, t: Tournament, m: Match): DuelSignal | null {
  if (!sig || sig.tid !== t.id || sig.mid !== m.id || sig.g !== m.games.length) return null;
  return sig;
}

export async function loadInsect(id: string): Promise<Insect | null> {
  const { data } = await supabase.from('insects').select('*').eq('id', id).maybeSingle();
  return (data as Insect) ?? null;
}

// ── 오늘 만든 곤충 (다같이 보기 · 토너먼트 참가자) ───────
/** 한국 날짜 오늘 0시 (ISO) */
export function todayStartIso(): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const d = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000;
  return new Date(d).toISOString();
}

export interface TodayInsect extends Entrant {
  origin: string | null;
  createdAt: string;
}

/**
 * 오늘 만든 곤충 — 아이 한 명당 가장 최근 곤충 하나. 직원(450~500)은 빼고,
 * 테스트 번호(900~)는 includeTest 일 때만 (리허설용).
 */
export async function loadTodayInsects(includeTest = false): Promise<TodayInsect[]> {
  const { data } = await supabase
    .from('insects')
    .select('id, player_id, nickname, species, level, origin, created_at')
    .gte('created_at', todayStartIso())
    .order('created_at', { ascending: true })
    .limit(400);
  const rows: any[] = [...(data || [])];
  // 🧪 리허설: 테스트 번호(900~)는 오늘 만든 게 없어도 **마지막 곤충**을 넣는다 (11/25 Jin "악마의왼발은 이미 만들었는데")
  if (includeTest) {
    const { data: tps } = await supabase.from('players').select('id, ticket_code').gte('ticket_code', 'A-900').lte('ticket_code', 'A-999');
    const tids = (tps || []).map((p: any) => p.id);
    if (tids.length) {
      const { data: older } = await supabase
        .from('insects')
        .select('id, player_id, nickname, species, level, origin, created_at')
        .in('player_id', tids)
        .order('created_at', { ascending: true })
        .limit(400);
      const have = new Set(rows.map((r) => r.id));
      (older || []).forEach((r: any) => {
        if (!have.has(r.id)) rows.push(r);
      });
      rows.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
    }
  }
  const pids = Array.from(new Set(rows.map((r: any) => r.player_id)));
  const players = new Map<string, Pick<Player, 'display_name' | 'ticket_code'>>();
  for (let i = 0; i < pids.length; i += 100) {
    const { data: ps } = await supabase.from('players').select('id, display_name, ticket_code').in('id', pids.slice(i, i + 100));
    (ps || []).forEach((p: any) => players.set(p.id, p));
  }
  const latest = new Map<string, TodayInsect>();
  rows.forEach((r: any) => {
    const p = players.get(r.player_id);
    if (!p || p.ticket_code === ROOM_TICKET || isStaffTicket(p.ticket_code)) return;
    if (!includeTest && isTestTicket(p.ticket_code)) return;
    latest.set(r.player_id, {
      pid: r.player_id,
      iid: r.id,
      nick: r.nickname || '곤충',
      kid: p.display_name || '',
      species: r.species || '곤충',
      level: r.level ?? 1,
      origin: r.origin ?? null,
      createdAt: r.created_at,
    });
  });
  return Array.from(latest.values());
}
