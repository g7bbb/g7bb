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
import { ENVIRONMENTS } from './environments';
import { ORIGIN_EFFECTS } from './origins';
import { EnvironmentKey } from './types';
import { isStaffTicket, isTestTicket, NO_PIN_TICKETS } from './ticket';

export const ROOM_TICKET = 'T-ROOM';

// ── 시간표 (startAt 기준 ms) ─────────────────────────────
// 11/25 리허설 뒤 Jin: "시간을 너무 줄였어, 길어져도 돼. 기술을 최소 3번은 쓰게" → 필살기 기회 3번 (한 판 ≈ 30초)
/** "G7BB 배틀!! 시작!!" */
export const T_TITLE = 0;
/** 3 · 2 · 1 */
export const T_COUNT = 1200;
/** VS — 두 카드 쾅 */
export const T_VS = 4200;
/** 필살기 기회 횟수 */
export const CHANCE_COUNT = 3;
/** 한 번의 기회 = 서로 치고받기(CLASH_LEN) → ⚡ 타이밍 고리(CHANCE_LEN, 2초에 퍼펙트) → 판정 보여주기(JUDGE_LEN) */
export const CLASH_LEN = 1600;
export const CHANCE_LEN = 4000;
export const JUDGE_LEN = 1000;
export const ROUND_LEN = CLASH_LEN + CHANCE_LEN + JUDGE_LEN;
/** 첫 치고받기 시작 */
export const T_ROUND0 = 5400;
/** i 번째(0~2) 치고받기 시작 */
export function clashAt(i: number): number {
  return T_ROUND0 + i * ROUND_LEN;
}
/** i 번째 타이밍 고리 시작 */
export function chanceAt(i: number): number {
  return clashAt(i) + CLASH_LEN;
}
/** 마지막 고리가 끝나는 때 */
export const T_LAST_CHANCE_END = chanceAt(CHANCE_COUNT - 1) + CHANCE_LEN;
/** 고리가 다 끝난 뒤 상대 기기 결과를 기다리는 여유 → 결과 연출 시작 */
export const T_RESOLVE = T_LAST_CHANCE_END + 1800;
/** 결과 연출 길이 (마지막 일격 + 승리 + "왜 이겼을까") */
export const RESULT_LEN = 7000;
/** 상대 결과를 이만큼 기다려도 안 오면 "못 눌렀음" 으로 친다 */
export const WAIT_TIER_MS = 4000;

/** 3번의 기회가 어느 칸(0 왼쪽 · 1 가운데 · 2 오른쪽)에 뜰지 — 시작 시각으로 섞어서 두 기기가 똑같이 본다 */
export function chanceSlots(startAt: number): number[] {
  const r = seeded(startAt % 2147483647);
  const out = [0, 1, 2];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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
  /** 3번 기회의 타이밍 판정 (못 눌렀으면 'miss') */
  tiersA: string[];
  tiersB: string[];
  /** 이긴 곤충의 남은 HP % (한끗 차이면 작다) */
  left: number;
  /** 왜 이겼을까 (상성 · 타이밍 · 레벨 · 능력치 · 운) */
  reason: string;
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
  /** 🔥 패자부활전 (1라운드에서 짝이 없던 아이 vs 제일 아깝게 진 아이) */
  revival?: boolean;
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
  /** 1라운드에서 짝이 없어 패자부활전을 기다리는 아이 (홀수 인원) */
  waiting?: number | null;
  /** 패자부활로 다시 기회를 받은 아이들 (한 번만) */
  revived?: number[];
}

/** 아이 쪽 신호 (그 아이 players.survey.duel) */
export interface DuelSignal {
  tid: string;
  mid: string;
  /** 몇 번째 판 (결승 3판 2선승) */
  g: number;
  joinedAt: number;
  /** 필살기 타이밍 결과 (기회마다 한 칸, 아직이면 null) */
  tiers?: (string | null)[];
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

export function tierMult(key: string | undefined | null): number {
  if (key === 'miss' || !key) return MISS_MULT;
  return TIMING_TIERS.find((t) => t.key === key)?.scoreMultiplier ?? 1;
}

/** 못 누른 기회 */
export const MISS_MULT = 0.9;
/**
 * 🌍 (체험용) 상성을 행사용보다 세게 (11/25 Jin: "본인이 정한 상성·출신지로 한끗 차이로 이길 수 있게").
 * 행사용 상성 +7% 위에 ×1.12 를 더 → 상성 이긴 쪽 승률 58% → 약 72% (시뮬레이션). 무조건은 아니라 타이밍으로 뒤집을 수 있다.
 */
export const CLASS_MATCHUP_EDGE = 1.12;

export interface DuelVerdict {
  winner: 'a' | 'b';
  left: number;
  reason: string;
  result: BattleResult;
}

/** 3번 기회의 평균 배수 */
export function avgMult(tiers: (string | null)[]): number {
  const list = [0, 1, 2].map((i) => tiers[i] ?? 'miss');
  return list.reduce((s, k) => s + tierMult(k), 0) / list.length;
}

const STAT_NAMES: Record<string, string> = { hp: 'HP가', atk: '공격력이', def: '수비력이', int: '지능이' };

/**
 * 한 판의 승패 — 두 곤충 + 씨앗 + 두 아이의 타이밍 3번. 어느 기기에서 돌려도 같은 답.
 * 3번 다 못 눌렀으면 필살기를 못 쓴 것으로 친다. 타이밍 배수는 3번의 평균 (못 누름 0.9).
 */
export function duelVerdict(a: Insect, b: Insect, seed: number, tiersA: (string | null)[], tiersB: (string | null)[]): DuelVerdict {
  const random = seeded(seed);
  const statsA = statsForInsect(a);
  const statsB = statsForInsect(b);
  const sideA: BattleSide = { stats: statsA, level: a.level, origin: a.origin ?? null };
  const sideB: BattleSide = { stats: statsB, level: b.level, origin: b.origin ?? null };
  const rolls = rollBattle(sideA, sideB, random);
  const pressedA = tiersA.some((k) => k && k !== 'miss');
  const pressedB = tiersB.some((k) => k && k !== 'miss');
  const usedA = pressedA ? movesFor(a.species, a.level).map((m) => m.key) : [];
  const usedB = pressedB ? movesFor(b.species, b.level).map((m) => m.key) : [];
  const mA = avgMult(tiersA);
  const mB = avgMult(tiersB);
  let res = resolveBattle(rolls.a, rolls.b, usedA, usedB, 1, random, {
    a: rolls.a.bonus && pressedA ? baseMoveFor(a.species).key : null,
    b: rolls.b.bonus && pressedB ? baseMoveFor(b.species).key : null,
    defTypeA: baseMoveFor(a.species).kind === 'defense',
    defTypeB: baseMoveFor(b.species).kind === 'defense',
    edgeA: mA * (rolls.a.matchup === 1 ? CLASS_MATCHUP_EDGE : 1),
    edgeB: mB * (rolls.b.matchup === 1 ? CLASS_MATCHUP_EDGE : 1),
  });
  // 토너먼트는 비김 없이 — 점수가 같으면 씨앗으로 정한다
  if (res.winner === 'draw') res = { ...res, winner: random() < 0.5 ? 'A' : 'B' };
  const winner: 'a' | 'b' = res.winner === 'A' ? 'a' : 'b';
  const win = winner === 'a' ? res.a.score : res.b.score;
  const lose = winner === 'a' ? res.b.score : res.a.score;
  const margin = win > 0 ? Math.max(0, 1 - lose / win) : 0;
  const left = Math.round(Math.min(40, Math.max(3, 3 + margin * 90)));

  // 왜 이겼을까 — 아이가 "아 그래서!" 할 수 있는 이유 하나
  const W = winner === 'a' ? a : b;
  const L = winner === 'a' ? b : a;
  const wRoll = winner === 'a' ? rolls.a : rolls.b;
  const lRoll = winner === 'a' ? rolls.b : rolls.a;
  const wM = winner === 'a' ? mA : mB;
  const lM = winner === 'a' ? mB : mA;
  const wTiers = winner === 'a' ? tiersA : tiersB;
  const wStats = winner === 'a' ? statsA : statsB;
  const lStats = winner === 'a' ? statsB : statsA;
  const envW = ENVIRONMENTS.find((e) => e.key === W.origin);
  const envL = ENVIRONMENTS.find((e) => e.key === L.origin);
  let reason: string;
  if (wRoll.matchup === 1 && envW && envL) {
    reason = `${envW.emoji} ${envW.label} 출신이 ${envL.emoji} ${envL.label} 출신을 이기는 상성! ${ORIGIN_EFFECTS[W.origin as EnvironmentKey]?.beatsWhy ?? ''}`.trim();
  } else if (lRoll.matchup === 1 && envW && envL) {
    reason = `상성은 ${envL.emoji} ${envL.label} 쪽이 유리했는데, ⚡ 필살기 타이밍으로 뒤집었어!`;
  } else if (wM - lM >= 0.06) {
    const perfect = wTiers.filter((k) => k === 'perfect').length;
    reason = `⚡ 필살기 타이밍을 더 잘 맞췄어!${perfect ? ` (퍼펙트 ${perfect}번)` : ''}`;
  } else if ((W.level ?? 1) > (L.level ?? 1)) {
    reason = `🆙 레벨이 더 높았어! (LV.${W.level} vs LV.${L.level})`;
  } else {
    // 능력치 중 제일 차이 나는 것
    const keys = ['hp', 'atk', 'def', 'int'] as const;
    let best: (typeof keys)[number] | null = null;
    let bestRatio = 1.04;
    keys.forEach((k) => {
      const r = (wStats as any)[k] / Math.max(1, (lStats as any)[k]);
      if (r > bestRatio) {
        bestRatio = r;
        best = k;
      }
    });
    const fx = W.origin ? ORIGIN_EFFECTS[W.origin as EnvironmentKey] : null;
    const fromOrigin = best && envW && fx && ((best === 'hp' && fx.hp > 0) || (best === 'def' && fx.def > 0));
    if (best && fromOrigin) reason = `${envW!.emoji} ${envW!.label} 출신이라 ${STAT_NAMES[best]} 더 높았어!`;
    else if (best) reason = `💪 ${STAT_NAMES[best]} 더 높았어! 몸의 힘을 잘 골랐어`;
    else if (wRoll.crit) reason = '🔥 크리티컬이 터졌어!';
    else reason = '🍀 정말 비슷했는데, 운이 조금 더 좋았어!';
  }
  if (margin < 0.06) reason = `🔥 한끗 차이!! ${reason}`;
  return { winner, left, reason, result: res };
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
 * 참가 곤충을 섞어 1라운드를 만든다.
 * 🔥 11/26 Jin: 부전승 없이 **패자부활전** (B안) — 모두 최소 1번은 배틀하고, 공짜로 올라가는 아이가 없게.
 *   - 홀수(15명): 1라운드 7경기 + 1명 대기 → 7경기가 끝나면 **패자부활전**(대기한 아이 vs 제일 아깝게 진 아이) → 이긴 아이까지 8명.
 *   - 라운드가 끝나 이긴 아이가 홀수(14명 → 7명)면 그 라운드 패자 중 **제일 아깝게 진 아이가 바로 부활** → 8명.
 *   - "제일 아깝게 진" = 이긴 쪽이 남긴 HP(left)가 제일 적었던 경기의 패자. 한 아이는 한 번만 부활.
 *   - 16명은 딱 맞아서 부활·대기 없음. 2명만 남은 라운드(결승)만 3판 2선승.
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
    waiting: null,
    revived: [],
  };
  const players = list.map((_, i) => i);
  if (players.length % 2 === 1 && players.length > 1) t.waiting = players.pop()!;
  t.rounds.push(buildRound(t, 0, players));
  t.current = nextMatchId(t);
  return t;
}

/** 이 라운드에 올라온 아이들(entrants 번호)로 경기를 짠다. (혹시 홀수면 마지막 아이 부전승 — 부활할 패자가 없을 때만) */
function buildRound(t: Tournament, round: number, players: number[]): Match[] {
  const order = [...players];
  const final = order.length === 2 && (t.waiting === null || t.waiting === undefined);
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

/** 이 라운드에서 제일 아깝게 진 아이 (패자부활전 경기·이미 부활한 아이 빼고). 없으면 null */
function bestLoser(t: Tournament, round: Match[]): number | null {
  const revived = new Set(t.revived ?? []);
  const cands = round
    .filter((m) => !m.revival && m.winner && m.a !== null && m.b !== null)
    .map((m) => {
      const loser = m.winner === 'a' ? m.b! : m.a!;
      const last = m.games[m.games.length - 1];
      return { loser, left: last?.left ?? 50, r: Math.random() };
    })
    .filter((c) => !revived.has(c.loser));
  if (!cands.length) return null;
  cands.sort((x, y) => x.left - y.left || x.r - y.r);
  return cands[0].loser;
}

/** 이 아이가 패자부활로 올라온 아이인지 */
export function isRevived(t: Tournament, idx: number | null): boolean {
  return idx !== null && (t.revived ?? []).includes(idx);
}

/** 지금 라운드가 다 끝났으면 → (대기한 아이가 있으면) 패자부활전 / 다음 라운드 (홀수면 아깝게 진 아이 부활) / 1명 남으면 끝 */
function maybeNextRound(t: Tournament) {
  const last = t.rounds[t.rounds.length - 1];
  if (!last || last.some((m) => !m.winner)) return;
  if (t.waiting !== null && t.waiting !== undefined) {
    const w = t.waiting;
    t.waiting = null;
    const loser = bestLoser(t, last);
    const round = t.rounds.length - 1;
    if (loser !== null) {
      t.revived = [...(t.revived ?? []), loser];
      last.push({ id: `r${round}m${last.length}`, round, slot: last.length, a: w, b: loser, winner: null, bestOf: 1, games: [], revival: true });
    } else {
      // 진 아이가 없으면(이럴 일은 없지만) 그냥 올라간다
      last.push({ id: `r${round}m${last.length}`, round, slot: last.length, a: w, b: null, winner: 'a', bestOf: 1, games: [] });
      maybeNextRound(t);
    }
    return;
  }
  const winners = last.map((m) => (m.winner === 'a' ? m.a : m.b)).filter((x): x is number => x !== null);
  if (winners.length <= 1) {
    t.status = 'done';
    return;
  }
  if (winners.length % 2 === 1) {
    const loser = bestLoser(t, last);
    if (loser !== null) {
      t.revived = [...(t.revived ?? []), loser];
      winners.push(loser);
    }
  }
  t.rounds.push(buildRound(t, t.rounds.length, winners));
}

/** 라운드마다 경기 수 (15명 → 8(7 + 패자부활전) · 4 · 2 · 1 / 14명 → 7 · 4 · 2 · 1) */
export function roundSizes(t: Tournament): number[] {
  const out: number[] = [];
  let n = t.entrants.length;
  while (n > 1) {
    out.push(n % 2 === 0 ? n / 2 : (n - 1) / 2 + 1);
    let next = Math.ceil(n / 2);
    if (next % 2 === 1 && next > 1) next += 1;
    n = next;
  }
  return out;
}

/** 전체 라운드 수 */
export function totalRounds(t: Tournament): number {
  return roundSizes(t).length;
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

/** 앞으로 할 경기 n 개 (지금 경기부터, 양쪽이 정해진 것만) */
export function upcomingMatches(t: Tournament, n: number): Match[] {
  const out: Match[] = [];
  for (const r of t.rounds) for (const m of r) if (!m.winner && m.a !== null && m.b !== null && out.length < n) out.push(m);
  return out;
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
    for (let k = 0; k < 4; k++) {
      maybeNextRound(copy);
      copy.current = nextMatchId(copy);
      if (copy.current || copy.status === 'done') break;
    }
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

/** 경기 이름 — "1라운드 3경기" · "🔥 패자부활전" · "🏆 결승" */
export function matchLabel(t: Tournament, m: Match): string {
  if (m.revival) return '🔥 패자부활전';
  const name = roundName(t, m.round);
  const count = t.rounds[m.round]?.filter((x) => !x.revival).length ?? 1;
  return count <= 1 ? name : `${name} ${m.slot + 1}경기`;
}

/** 패자부활로 올라온 아이가 이 경기에서 "부활한 아이" 로 보이는지 (진 경기 다음부터) */
export function showRevived(t: Tournament, m: Match, idx: number | null): boolean {
  if (!isRevived(t, idx)) return false;
  const lost = t.rounds.flat().find((x) => x.winner && !x.revival && (x.winner === 'a' ? x.b === idx : x.a === idx));
  return !!lost && lost.id !== m.id && (m.revival || m.round > lost.round);
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
    // ⚠️ 테스트 번호 전부를 넣으면 예전에 시험하던 번호들(안 온 선수)이 대진표를 채워서 내 차례가 안 온다 (11/25 실제로 겪음)
    //    → 오늘 만든 테스트 곤충 + 리허설 번호(951·952·953, 비밀번호 없는 번호)의 마지막 곤충만
    const { data: tps } = await supabase.from('players').select('id, ticket_code').in('ticket_code', NO_PIN_TICKETS);
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

/**
 * 오늘 QR 로 들어왔는데 아직 곤충을 안 만든 아이들 (다같이 보기의 그림자 칸).
 * 오늘 처음 등록한 아이만 (예전 행사에서 온 아이는 곤충을 만들면 그때 나타난다).
 */
export async function loadTodayWaiting(includeTest = false, haveInsect: Set<string> = new Set()): Promise<{ pid: string; kid: string }[]> {
  try {
    const { data } = await supabase.from('players').select('id, display_name, ticket_code, created_at').gte('created_at', todayStartIso()).limit(200);
    const rows: any[] = [...(data || [])];
    if (includeTest) {
      const { data: tps } = await supabase.from('players').select('id, display_name, ticket_code, created_at').in('ticket_code', NO_PIN_TICKETS);
      (tps || []).forEach((p: any) => {
        if (!rows.some((r) => r.id === p.id)) rows.push(p);
      });
    }
    return rows
      .filter((p) => p.ticket_code !== ROOM_TICKET && !isStaffTicket(p.ticket_code) && (includeTest || !isTestTicket(p.ticket_code)))
      .filter((p) => !haveInsect.has(p.id) && (p.display_name || '').trim())
      .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))
      .map((p) => ({ pid: p.id, kid: p.display_name }));
  } catch {
    return [];
  }
}
