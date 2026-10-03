import { supabase } from './supabaseClient';
import { Player } from './types';
import { ROUNDS_PER_GAME, Tier, TierKey, TIERS, tierForPlayer } from './tiers';
import { isTestTicket, normalizeTicket } from './ticket';

// ─────────────────────────────────────────────────────────────
// 참여 횟수 · 30분 대기 · 뱃지 기록 (2026-10-01 Jin 확정)
//
//   1게임 = 랭킹 도전 1번 (3판) + 랭커와 연습 게임 1판
//   재참여는 **30분 뒤** (그 게임을 시작한 시각부터)
//   몇 게임 할 수 있는지는 종이 번호 앞 글자(금액)로 정해진다 → `lib/tiers.ts`
//
// ⚠️ **새 칸(컬럼)을 만들지 않고 `players.survey`(원래 있던 jsonb) 안의 `game` 에 넣는다.**
// 행사 이틀 전이라 DB 구조를 바꾸는 작업(마이그레이션)을 피하려는 것이다.
// survey 에 있던 설문 답은 건드리지 않고 `game` 만 고친다 (`saveGameState`).
//
// ⚠️ 이 기록은 화면(브라우저)에서 쓴다. RLS 가 꺼진 베타라 마음먹으면 고칠 수는 있지만,
// 부스에서 아이가 그럴 일은 없다고 보고 받아들인 위험이다.
// ─────────────────────────────────────────────────────────────

export const COOLDOWN_MS = 30 * 60 * 1000;

export interface PlaySession {
  /** 이 게임을 시작한 시각 (ISO) — 30분 대기는 여기서부터 잰다 */
  at: string;
  /** 랭킹 도전을 시작했는지 */
  ladder?: boolean;
  /** 랭커와 연습 게임을 했는지 */
  practice?: boolean;
  /** 다시 와서 레벨업을 받은 게임인지 (한 게임에 한 번만) */
  leveled?: boolean;
  /** 다시 와서 "새 곤충 만들기" 를 고른 게임인지 */
  newInsect?: boolean;
  /** 그 새 곤충을 실제로 저장했는지 (한 게임에 곤충 하나) */
  insectMade?: boolean;
  /**
   * 🛟 랭킹 도전이 몇 판까지 갔는지 (10/3 Jin "1만원 아이가 1판만 하면 게임이 끝나버려").
   * 전에는 배틀 화면 안에만 있어서, 중간에 🏆 랭킹 같은 다른 화면으로 나가면 남은 판이 사라지고
   * '게임 끝' 로그아웃까지 됐다. 이제 판이 끝날 때마다 여기 적고, 다시 오면 **이어서** 한다.
   * targets 는 배틀 화면의 상대 요약(OpponentSummary). 비어 있으면 그때 랭킹 3명으로 다시 채운다.
   */
  ladderRun?: SavedLadder;
}

export interface SavedLadder {
  targets: any[];
  index: number;
  used: number;
  log: { rank: number; nickname: string; won: boolean; bot?: boolean }[];
  bossAfter: number | null;
  bossDone: boolean;
  bonus?: boolean;
  /** 보너스 스테이지 상품을 무조건 "레벨 1 업" 으로 (2만원 이상 첫 보너스, lib/bonus-stage.ts planLadderEvent) */
  bonusLevel?: boolean;
}

/** 랭킹 도전 한 게임의 판 수 */
export const LADDER_ROUNDS = ROUNDS_PER_GAME;

/** 이 게임의 랭킹 도전을 **다 끝냈는지** (시작 안 했으면 false). 옛 기록(판 수가 안 적힌 것)은 끝난 것으로 본다. */
export function ladderComplete(s: PlaySession | undefined): boolean {
  if (!s?.ladder) return false;
  const run = s.ladderRun;
  if (!run) return true;
  return run.used >= LADDER_ROUNDS || (run.targets.length > 0 && run.index >= run.targets.length);
}

/** 이어서 할 랭킹 도전 (시작했는데 아직 판이 남은 것) */
export function ladderToResume(player: Player | null | undefined): SavedLadder | null {
  if (!player) return null;
  const last = readGameState(player).sessions.slice(-1)[0];
  return last?.ladder && last.ladderRun && !ladderComplete(last) ? last.ladderRun : null;
}

export interface GameState {
  sessions: PlaySession[];
  /** 뱃지 key → 처음 받은 시각 (ISO). 화면에서 바로 계산되는 뱃지는 여기 안 적는다. */
  badges: Record<string, string>;
  /** 직원이 올려준 참가권 (없으면 종이 번호 앞 글자로 정함) */
  tier?: TierKey;
  /**
   * 마지막으로 센 뱃지 개수 (2026-10-01 뱃지 버프). 이 아이 곤충이 **상대로 나올 때** 버프를 주려고 적어둔다.
   * 상대의 뱃지를 배틀마다 처음부터 세면 조회가 너무 많아서, 본인이 뱃지·배틀 화면을 열 때 갱신한다.
   */
  badgeCount?: number;
  /**
   * 친구·가족 번호 (2026-10-01 Jin: "친구나 가족과 함께하면 레벨업 속도 +10%").
   * 아이가 친구 번호를 적으면 **양쪽 다** 서로의 번호가 들어간다. 하나라도 있으면 버프.
   */
  friends?: string[];
  /**
   * ⏩ 직원이 30분 대기를 풀어준 게임 (그 게임의 시작 시각 `at`). 10/2 Jin: "부스가 한가하면 30분 전에도".
   * 마지막 게임의 `at` 과 같으면 그 게임 뒤의 대기만 없어진다 (다음 게임을 시작하면 다시 30분).
   */
  waivedAt?: string;
  /** ➕ 직원이 서비스로 더 준 게임 수 (`grantExtraGame`) */
  extraGames?: number;
}

/** 한국 날짜 (YYYY-MM-DD) — 5만원 "하루만" 을 세려고 */
export function kstDay(ms: number): string {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function readGameState(player: Pick<Player, 'survey'> | null | undefined): GameState {
  const raw = (player?.survey as any)?.game ?? {};
  return {
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    badges: raw.badges && typeof raw.badges === 'object' ? raw.badges : {},
    ...(raw.tier && TIERS[raw.tier as TierKey] ? { tier: raw.tier as TierKey } : {}),
    ...(Number.isFinite(raw.badgeCount) ? { badgeCount: Number(raw.badgeCount) } : {}),
    ...(Array.isArray(raw.friends) ? { friends: raw.friends.filter((t: unknown) => typeof t === 'string') } : {}),
    ...(typeof raw.waivedAt === 'string' ? { waivedAt: raw.waivedAt } : {}),
    ...(Number.isFinite(raw.extraGames) && raw.extraGames > 0 ? { extraGames: Math.floor(raw.extraGames) } : {}),
  };
}

export interface PlayStatus {
  tier: Tier;
  state: GameState;
  /** 시작한 게임 수 */
  used: number;
  /** 남은 게임 수 (무제한이면 Infinity) */
  left: number;
  /** 다음 게임까지 남은 시간(ms). 0 이면 지금 바로 가능 */
  cooldownMs: number;
  /** 5만원(하루권)인데 첫 게임 날이 지나서 끝났는지 */
  expired: boolean;
  /** 지금 새 게임을 시작할 수 있는지 (횟수 남음 + 30분 지남) */
  canStartNew: boolean;
  /** 이미 시작했지만 랭킹 도전을 아직 안 한 게임이 있는지 */
  ladderPending: boolean;
  /** 이미 시작했지만 연습 게임을 아직 안 한 게임이 있는지 */
  practicePending: boolean;
  /** 지금 랭킹 도전을 할 수 있는지 */
  canLadder: boolean;
  /** 지금 연습 게임을 할 수 있는지 */
  canPractice: boolean;
}

export function playStatus(player: Player, now = Date.now()): PlayStatus {
  const tier = tierForPlayer(player);
  const state = readGameState(player);
  const last = state.sessions[state.sessions.length - 1];
  const used = state.sessions.length;
  // 테스트 번호(900번대)는 횟수·30분 대기 없이 계속 (lib/ticket.ts)
  const test = isTestTicket(player.ticket_code);
  // 5만원은 첫 게임을 한 **그날만** (한국 날짜). 날짜가 바뀌면 남은 게임이 있어도 끝 (10/2 Jin)
  const first = state.sessions[0];
  const expired = !test && !!tier.oneDay && !!first && kstDay(Date.parse(first.at)) !== kstDay(now);
  // ➕ 직원이 서비스로 더 준 게임 (`grantExtraGame`) — 하루권이 끝났어도 이건 쓸 수 있다
  const extra = state.extraGames ?? 0;
  const allowance = (expired ? Math.min(used, tier.games) : tier.games) + extra;
  const left = test ? Infinity : Math.max(0, allowance - used);
  const elapsed = last ? now - Date.parse(last.at) : Infinity;
  const waived = !!last && state.waivedAt === last.at;
  const cooldownMs = last && !test && !waived ? Math.max(0, COOLDOWN_MS - elapsed) : 0;
  const canStartNew = left > 0 && cooldownMs === 0;
  // 랭킹 도전을 시작했어도 판이 남았으면 아직 '할 수 있음' (이어하기)
  const ladderPending = !!last && (!last.ladder || !ladderComplete(last));
  const practicePending = !!last && !last.practice;
  return {
    tier,
    state,
    used,
    left,
    cooldownMs,
    expired,
    canStartNew,
    ladderPending,
    practicePending,
    canLadder: ladderPending || canStartNew,
    canPractice: practicePending || canStartNew,
  };
}

/** 서버에서 지금 기록을 다시 읽어옵니다. 다른 화면(다른 폰)에서 바뀌었을 수 있어서입니다. */
async function freshPlayer(playerId: string): Promise<Player | null> {
  const { data } = await supabase.from('players').select('*').eq('id', playerId).maybeSingle();
  return (data as Player) ?? null;
}

async function saveGameState(player: Player, game: GameState): Promise<Player> {
  const survey = { ...((player.survey as any) ?? {}), game };
  const { error } = await supabase.from('players').update({ survey }).eq('id', player.id);
  if (error) throw error;
  return { ...player, survey } as Player;
}

type Slot = 'ladder' | 'practice';

/**
 * 랭킹 도전 / 연습 게임을 **시작할 때** 부릅니다.
 * 이미 시작한 게임에 그 칸이 비어 있으면 거기 쓰고, 아니면 새 게임을 엽니다(= 1게임 사용).
 * 할 수 없으면 아이에게 보여줄 문구로 에러를 던집니다.
 */
export async function claimSlot(playerId: string, slot: Slot, run?: SavedLadder): Promise<Player> {
  const player = await freshPlayer(playerId);
  if (!player) throw new Error('참가 정보를 못 찾았어. 종이 QR 을 다시 찍어줘!');
  const status = playStatus(player);
  const sessions = [...status.state.sessions];
  const last = sessions[sessions.length - 1];
  const extra = slot === 'ladder' && run ? { ladderRun: run } : {};

  // 판이 남은 랭킹 도전이 있으면 새 게임을 열지 않는다 (이어하기)
  if (slot === 'ladder' && last?.ladder && !ladderComplete(last)) return player;

  if (last && !last[slot]) {
    sessions[sessions.length - 1] = { ...last, [slot]: true, ...extra };
  } else if (status.canStartNew) {
    sessions.push({ at: new Date().toISOString(), [slot]: true, ...extra });
  } else {
    throw new Error(blockedMessage(status));
  }
  return saveGameState(player, { ...status.state, sessions });
}

/** 랭킹 도전 한 판이 끝날 때마다 몇 판까지 갔는지 적는다. 실패해도 배틀은 그대로 간다. */
export async function saveLadderRun(playerId: string, run: SavedLadder): Promise<Player | null> {
  try {
    const player = await freshPlayer(playerId);
    if (!player) return null;
    const state = readGameState(player);
    const sessions = [...state.sessions];
    const last = sessions[sessions.length - 1];
    if (!last?.ladder) return null;
    sessions[sessions.length - 1] = { ...last, ladderRun: run };
    return await saveGameState(player, { ...state, sessions });
  } catch {
    return null;
  }
}

/**
 * 🛟 판 수가 안 적힌 랭킹 도전(10/3 이 수정 전에 시작한 것)을 battles 기록으로 되살린다.
 * 그 게임을 시작한 뒤 남은 랭킹 배틀 수를 세서, 3판이 안 됐으면 이어서 할 수 있게 적어둔다.
 * (연습·중간보스는 battles 에 안 남으므로 랭킹 도전 판만 세어진다)
 * 한 번 적으면 다시 안 센다. 실패하면 그대로 돌려준다.
 */
export async function repairLadderRun(player: Player): Promise<Player> {
  try {
    const state = readGameState(player);
    const sessions = [...state.sessions];
    const last = sessions[sessions.length - 1];
    if (!last?.ladder || last.ladderRun) return player;
    const { data, error } = await supabase
      .from('battles')
      .select('result')
      .eq('player_id', player.id)
      .gte('created_at', last.at)
      .limit(20);
    if (error) return player;
    const rows = data || [];
    const wins = rows.filter((r: any) => r.result === 'win').length;
    sessions[sessions.length - 1] = {
      ...last,
      ladderRun: { targets: [], index: wins, used: rows.length, log: [], bossAfter: null, bossDone: true },
    };
    return await saveGameState(player, { ...state, sessions });
  } catch {
    return player;
  }
}

/**
 * 🏁 이번 게임이 끝났는지 (자동 로그아웃 시계를 켤지). 배틀 준비 화면 · session-guard 가 같이 쓴다.
 * - 랭킹 도전을 지금 못 하면 끝 (연습 1판이 남았어도 — 연습은 덤)
 * - 마지막 게임의 랭킹 도전 3판을 다 했으면 횟수가 남아도 '이번 게임 끝' (다음 게임은 QR 로 다시, 10/3 저녁 Jin)
 * - 연습만 했거나 랭킹 도전 판이 남았으면 아직 아님 (10/3 Jin "1만원 아이가 연습·1판만 하면 끝나버려")
 */
export function gameIsOver(player: Player, now = Date.now()): boolean {
  const s = playStatus(player, now);
  const last = s.state.sessions[s.state.sessions.length - 1];
  return s.used > 0 && (!s.canLadder || ladderComplete(last));
}

/**
 * 다시 온 아이가 새 게임을 시작할 때 (QR 로 들어와 "새 곤충" 또는 "레벨업" 을 고른 순간).
 * 아직 안 쓴 게임이 남아 있으면 새로 열지 않고 그걸 이어갑니다.
 */
export async function checkIn(
  playerId: string,
  choice: { newInsect?: boolean; leveled?: boolean }
): Promise<Player> {
  const player = await freshPlayer(playerId);
  if (!player) throw new Error('참가 정보를 못 찾았어. 종이 QR 을 다시 찍어줘!');
  const status = playStatus(player);
  if (!status.canStartNew) throw new Error(blockedMessage(status));
  const sessions = [...status.state.sessions, { at: new Date().toISOString(), ...choice }];
  return saveGameState(player, { ...status.state, sessions });
}

/** 다시 온 아이가 이번 게임에서 새 곤충을 만들 수 있는지 */
export function canMakeNewInsect(player: Player, insectCount: number): boolean {
  if (insectCount === 0) return true; // 첫 방문
  const last = readGameState(player).sessions.slice(-1)[0];
  return !!last?.newInsect && !last.insectMade;
}

/** 새 곤충을 저장한 뒤 표시 (한 게임에 곤충 하나) */
export async function markInsectMade(playerId: string): Promise<void> {
  const player = await freshPlayer(playerId);
  if (!player) return;
  const state = readGameState(player);
  const sessions = [...state.sessions];
  const last = sessions[sessions.length - 1];
  if (!last?.newInsect) return;
  sessions[sessions.length - 1] = { ...last, insectMade: true };
  await saveGameState(player, { ...state, sessions });
}

/** 뱃지를 받은 것으로 적어둡니다. 이미 있으면 아무것도 안 합니다. 실패해도 게임은 계속됩니다. */
export async function awardBadges(playerId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const player = await freshPlayer(playerId);
    if (!player) return;
    const state = readGameState(player);
    const fresh = keys.filter((key) => !state.badges[key]);
    if (fresh.length === 0) return;
    const badges = { ...state.badges };
    const now = new Date().toISOString();
    fresh.forEach((key) => (badges[key] = now));
    await saveGameState(player, { ...state, badges });
  } catch {
    // 뱃지는 장식이라 실패해도 배틀을 멈추지 않습니다.
  }
}

/** 뱃지 개수를 적어둡니다 (상대로 나올 때 버프용). 바뀌었을 때만 저장. 실패해도 그만. */
export async function saveBadgeCount(playerId: string, count: number): Promise<void> {
  try {
    const player = await freshPlayer(playerId);
    if (!player) return;
    const state = readGameState(player);
    if (state.badgeCount === count) return;
    await saveGameState(player, { ...state, badgeCount: count });
  } catch {
    // 장식에 가까운 기록이라 실패해도 넘어갑니다.
  }
}

// ── 친구·가족 버프 ─────────────────────────────────────
/** 친구 버프: 배틀·다시 왔을 때 받는 경험치 × 1.1 */
export const FRIEND_XP_BONUS = 1.1;

export function hasFriendBuff(player: Pick<Player, 'survey'> | null | undefined): boolean {
  return (readGameState(player).friends ?? []).length > 0;
}

/** 경험치 배수 (친구 버프가 있으면 1.1) */
export function friendXpMultiplier(player: Pick<Player, 'survey'> | null | undefined): number {
  return hasFriendBuff(player) ? FRIEND_XP_BONUS : 1;
}

/**
 * 친구 번호를 적었을 때. 그 번호가 **이미 등록된 아이**면 양쪽에 서로의 번호를 적는다.
 * 같이 시작하지 않았어도 된다 (번호만 알고 오면 됨). 돌려주는 값은 친구 이름.
 * 안 되면 아이에게 보여줄 문구로 에러를 던진다.
 */
export async function linkFriend(playerId: string, friendTicket: string): Promise<{ name: string; me: Player; waiting?: boolean }> {
  const me = await freshPlayer(playerId);
  if (!me) throw new Error('내 번호를 못 찾았어. 처음 화면에서 다시 들어와줘!');
  if (friendTicket === me.ticket_code) throw new Error('그건 내 번호야! 친구나 가족 번호를 적어줘.');
  const { data: friend } = await supabase.from('players').select('*').eq('ticket_code', friendTicket).maybeSingle();
  const add = (list: string[] | undefined, t: string) => Array.from(new Set([...(list ?? []), t])).slice(0, 10);
  const myState = readGameState(me);
  const saved = await saveGameState(me, { ...myState, friends: add(myState.friends, friendTicket) });
  // 🔁 10/3 Jin: "형제가 동시에 만들 때 친구가 아직 등록 전이라 버프가 안 켜져"
  // → 친구가 아직 안 들어왔어도 **내 쪽엔 바로 적고**, 친구가 나중에 시작하면 그때 친구 쪽에도 적는다(adoptFriendLinks).
  if (!friend) return { name: friendTicket, me: saved, waiting: true };
  // 친구 쪽에도 적는다. 실패해도 내 버프는 그대로.
  try {
    const theirState = readGameState(friend as Player);
    await saveGameState(friend as Player, { ...theirState, friends: add(theirState.friends, me.ticket_code ?? '') });
  } catch {
    // 친구 쪽 기록은 덤
  }
  return { name: (friend as Player).display_name || friendTicket, me: saved, waiting: isPending(friend as Player) };
}

/**
 * 나를 먼저 친구로 적어둔 아이들을 내 친구 목록에도 넣는다 (서로 버프).
 * 시작 화면에서 등록이 끝났을 때 · 곤충 만들기 화면을 열 때 부른다. 실패해도 조용히 넘어간다.
 */
export async function adoptFriendLinks(player: Player): Promise<Player> {
  try {
    if (!player.ticket_code) return player;
    const { data } = await supabase
      .from('players')
      .select('ticket_code')
      .contains('survey', { game: { friends: [player.ticket_code] } })
      .limit(20);
    const theirs = (data || []).map((r: any) => r.ticket_code).filter((t: string) => t && t !== player.ticket_code);
    const state = readGameState(player);
    const missing = theirs.filter((t: string) => !(state.friends ?? []).includes(t));
    if (!missing.length) return player;
    return await saveGameState(player, { ...state, friends: Array.from(new Set([...(state.friends ?? []), ...missing])).slice(0, 10) });
  } catch {
    return player;
  }
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function blockedMessage(status: PlayStatus): string {
  if (status.expired && status.left <= 0) {
    return `${status.tier.price} 참가권은 첫날 하루만 쓸 수 있어! 카드·랭킹·뱃지는 계속 볼 수 있어.`;
  }
  if (status.left <= 0) {
    return `${status.tier.price} 참가권으로 할 수 있는 게임을 다 했어! 카드·랭킹·뱃지는 계속 볼 수 있어.`;
  }
  return `⏳ ${formatCountdown(status.cooldownMs)} 뒤에 다시 할 수 있어! (재참여는 30분 뒤)`;
}

/**
 * 아직 이름·설문을 안 한 "직원이 먼저 만든" 자리인지.
 * 직원이 금액을 먼저 올려주면 이름 없는 줄이 생긴다. 시작 화면은 이걸 **처음 온 아이**로 다룬다.
 */
export function isPending(player: Pick<Player, 'display_name'> | null | undefined): boolean {
  return !!player && !player.display_name?.trim();
}

/**
 * 직원 화면: 이 번호의 참가권을 바꿉니다 (`/admin/tier`).
 * 아이가 아직 시작 화면을 안 거쳤으면 **이름 없는 자리를 먼저 만들어 둡니다.**
 * 아이가 QR 을 찍으면 시작 화면이 그 자리에 이름·설문을 채웁니다 (app/start/page.tsx).
 */
export async function setTierForTicket(rawTicket: string, tier: TierKey): Promise<Player> {
  const ticket = normalizeTicket(rawTicket);
  if (!ticket) throw new Error('번호를 다시 확인해줘 (예: 14)');
  const { data: found, error: findError } = await supabase
    .from('players')
    .select('*')
    .eq('ticket_code', ticket)
    .maybeSingle();
  if (findError) throw findError;

  if (found) {
    const player = found as Player;
    const state = readGameState(player);
    return saveGameState(player, { ...state, tier });
  }

  const { data, error } = await supabase
    .from('players')
    .insert({ ticket_code: ticket, display_name: '', survey: { game: { sessions: [], badges: {}, tier } } })
    .select()
    .single();
  if (error) throw error;
  return data as Player;
}

/**
 * ➕ 직원이 게임 1개(3판)를 더 준다 (10/3 밤 Jin: "끝난 친구에게 서비스로 한 번 — 1만원을 한 번 더 누르면 1게임만 더").
 * 참가권 금액은 그대로 두고 `extraGames` 만 1 올린다 (3만원 아이를 1만원으로 내리지 않게).
 * 직원이 눈앞에서 주는 것이라 30분 대기도 같이 푼다.
 */
export async function grantExtraGame(playerId: string): Promise<Player> {
  const player = await freshPlayer(playerId);
  if (!player) throw new Error('참가 정보를 못 찾았어.');
  const state = readGameState(player);
  const last = state.sessions[state.sessions.length - 1];
  return saveGameState(player, {
    ...state,
    extraGames: (state.extraGames ?? 0) + 1,
    ...(last ? { waivedAt: last.at } : {}),
  });
}

/**
 * ⏩ 직원이 30분 대기를 풀어준다 (10/2 Jin: "부스가 한가하면 30분 전에도 참여").
 * 직원 암호 확인은 부르는 쪽(화면)이 `/api/admin-auth` 로 먼저 한다. 게임 횟수는 그대로 — 기다리는 시간만 없앤다.
 */
export async function waiveCooldown(playerId: string): Promise<Player> {
  const player = await freshPlayer(playerId);
  if (!player) throw new Error('참가 정보를 못 찾았어.');
  const state = readGameState(player);
  const last = state.sessions[state.sessions.length - 1];
  if (!last) return player;
  return saveGameState(player, { ...state, waivedAt: last.at });
}
