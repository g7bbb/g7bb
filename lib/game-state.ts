import { supabase } from './supabaseClient';
import { Player } from './types';
import { Tier, TierKey, TIERS, tierForPlayer } from './tiers';
import { normalizeTicket } from './ticket';

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
}

export interface GameState {
  sessions: PlaySession[];
  /** 뱃지 key → 처음 받은 시각 (ISO). 화면에서 바로 계산되는 뱃지는 여기 안 적는다. */
  badges: Record<string, string>;
  /** 직원이 올려준 참가권 (없으면 종이 번호 앞 글자로 정함) */
  tier?: TierKey;
}

export function readGameState(player: Pick<Player, 'survey'> | null | undefined): GameState {
  const raw = (player?.survey as any)?.game ?? {};
  return {
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    badges: raw.badges && typeof raw.badges === 'object' ? raw.badges : {},
    ...(raw.tier && TIERS[raw.tier as TierKey] ? { tier: raw.tier as TierKey } : {}),
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
  const left = Math.max(0, tier.games - used);
  const elapsed = last ? now - Date.parse(last.at) : Infinity;
  const cooldownMs = last ? Math.max(0, COOLDOWN_MS - elapsed) : 0;
  const canStartNew = left > 0 && cooldownMs === 0;
  const ladderPending = !!last && !last.ladder;
  const practicePending = !!last && !last.practice;
  return {
    tier,
    state,
    used,
    left,
    cooldownMs,
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
export async function claimSlot(playerId: string, slot: Slot): Promise<Player> {
  const player = await freshPlayer(playerId);
  if (!player) throw new Error('참가 정보를 찾지 못했어요. 종이 QR 을 다시 찍어줘!');
  const status = playStatus(player);
  const sessions = [...status.state.sessions];
  const last = sessions[sessions.length - 1];

  if (last && !last[slot]) {
    sessions[sessions.length - 1] = { ...last, [slot]: true };
  } else if (status.canStartNew) {
    sessions.push({ at: new Date().toISOString(), [slot]: true });
  } else {
    throw new Error(blockedMessage(status));
  }
  return saveGameState(player, { ...status.state, sessions });
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
  if (!player) throw new Error('참가 정보를 찾지 못했어요. 종이 QR 을 다시 찍어줘!');
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

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function blockedMessage(status: PlayStatus): string {
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
  if (!ticket) throw new Error('번호를 다시 확인해 주세요 (예: A-014)');
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
