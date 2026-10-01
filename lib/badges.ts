// ─────────────────────────────────────────────────────────────
// 업적 뱃지 (2026-10-01 Jin: "내 QR 로 접속하면 지금까지 이룬 업적이 뱃지로 보이게, 좀 많아도 좋다")
//
// 뱃지는 두 종류다.
//   1) **그때그때 계산하는 것** — 곤충 수, 참여 횟수, 승리 수, 하트 수 등. 저장하지 않는다.
//   2) **그 순간에만 알 수 있는 것** — 퍼펙트, 회피, 랭킹 1~3위 달성 등.
//      일어난 순간 `players.survey.game.badges` 에 적어둔다 (lib/game-state.ts `awardBadges`).
//      랭킹은 나중에 내려가도 "달성" 은 남아야 해서 저장한다.
//
// 🔁 2026-10-01 저녁 Jin: 뱃지 개수에 **선물·버프**를 붙였다 (아래 BADGE_MILESTONES).
//   10개 → 대전 뱃지 실물 선물 + HP +10% · 15개 → 수비력 +15% · 20개 → 필살기 공격 +10% · 전부 → 선물.
//   ⚠️ 참가권 뱃지(골드·다이아)는 **개수에 안 센다** — 돈을 내면 버프가 빨리 오는 구조가 되고,
//      "전부 모으기" 가 10만원 참가권 없이는 불가능해지기 때문.
//
// 뱃지를 더하고 싶으면 아래 BADGES 에 한 줄 넣고, 받는 조건을 `earnedBadges` 나
// 배틀 화면의 `awardBadges([...])` 에 더하면 된다.
// ─────────────────────────────────────────────────────────────

import { findSpecies } from './species';

export interface BadgeDef {
  key: string;
  emoji: string;
  name: string;
  /** 어떻게 받는지 (못 받은 뱃지 아래에 힌트로 보여줌) */
  how: string;
  /** 특별 디자인 뱃지 (대전 행사 뱃지) */
  special?: 'daejeon';
  /** 참가권 뱃지 — 보여주기만 하고 개수에는 안 센다 */
  paid?: boolean;
}

export const BADGES: BadgeDef[] = [
  { key: 'daejeon', emoji: '🎡', name: '대전 곤충박람회', how: '2026 대전 곤충박람회에 참가하기', special: 'daejeon' },
  { key: 'firstInsect', emoji: '🐣', name: '첫 곤충 탄생', how: '내 곤충을 처음 만들기' },
  { key: 'play1', emoji: '🎮', name: '첫 게임', how: '게임에 처음 참여하기' },
  { key: 'revisit', emoji: '🔁', name: '또 왔다!', how: 'QR 로 다시 와서 게임하기' },
  { key: 'play3', emoji: '🌟', name: '단골 곤충러', how: '게임 3번 참여하기' },
  { key: 'play5', emoji: '🏵️', name: '곤충 마스터', how: '게임 5번 참여하기' },
  { key: 'firstBattle', emoji: '⚔️', name: '첫 배틀', how: '배틀 한 번 해보기' },
  { key: 'firstWin', emoji: '🎉', name: '첫 승리', how: '배틀에서 처음 이기기' },
  { key: 'win5', emoji: '🔥', name: '5승 달성', how: '배틀에서 5번 이기기' },
  { key: 'win10', emoji: '💥', name: '10승 달성', how: '배틀에서 10번 이기기' },
  { key: 'rank3', emoji: '🥉', name: '3위 달성', how: '전체 랭킹 3위 안에 들기' },
  { key: 'rank2', emoji: '🥈', name: '2위 달성', how: '전체 랭킹 2위 안에 들기' },
  { key: 'rank1', emoji: '🥇', name: '1위 달성', how: '전체 랭킹 1위 하기' },
  { key: 'beatTop1', emoji: '👑', name: '왕을 쓰러뜨려라', how: '랭킹 도전에서 1위 곤충 이기기' },
  { key: 'ladderClear', emoji: '🏔️', name: '정상 정복', how: '랭킹 도전 3위→2위→1위 전부 이기기' },
  { key: 'perfect', emoji: '✨', name: '퍼펙트!', how: '필살기 타이밍을 퍼펙트로 맞추기' },
  { key: 'dodge', emoji: '💨', name: '쏙 피했다', how: '상대 필살기를 회피하기' },
  { key: 'critWin', emoji: '⚡', name: '크리티컬 승리', how: '크리티컬이 터진 배틀에서 이기기' },
  { key: 'matchupWin', emoji: '🧭', name: '상성 박사', how: '상성이 유리한 상대를 이기기' },
  { key: 'giantSlayer', emoji: '🗡️', name: '거인 사냥꾼', how: '나보다 레벨 높은 곤충 이기기' },
  { key: 'practice', emoji: '🎯', name: '연습벌레', how: '랭커와 연습 게임 해보기' },
  { key: 'levelUp', emoji: '🆙', name: '레벨업!', how: '다시 와서 곤충 키우기' },
  { key: 'level3', emoji: '🌀', name: '두 번째 필살기', how: '곤충 레벨 3 되기' },
  { key: 'level5', emoji: '🌈', name: '레벨 5', how: '곤충 레벨 5 되기' },
  { key: 'collector2', emoji: '🎨', name: '곤충 수집가', how: '곤충 2마리 만들기' },
  { key: 'collector3', emoji: '🖼️', name: '곤충 박사', how: '곤충 3마리 만들기' },
  { key: 'evolved', emoji: '🧬', name: '상상 진화', how: '특별 진화(턱·날개·다리·더듬이·발톱 더 그리기) 하기' },
  { key: 'mySpecies', emoji: '🔍', name: '나만의 곤충', how: '목록에 없는 곤충을 직접 적어서 만들기' },
  { key: 'heart1', emoji: '💖', name: '첫 하트', how: '친구에게 하트 받기' },
  { key: 'heart10', emoji: '💘', name: '인기 곤충', how: '하트 10개 받기' },
  { key: 'beauty', emoji: '🌸', name: '예쁜 곤충 입상', how: '예쁜 곤충 랭킹 1~4위' },
  // 곤충 도장 깨기 (2026-10-01 Jin: "자기 곤충으로 각 곤충을 이겼을 때도 업적") — 랭킹 도전·연습 모두
  { key: 'beat_rhino', emoji: '🦏', name: '장수풍뎅이 격파', how: '장수풍뎅이를 배틀에서 이기기' },
  { key: 'beat_stag', emoji: '🦌', name: '사슴벌레 격파', how: '사슴벌레를 배틀에서 이기기' },
  { key: 'beat_mantis', emoji: '🥋', name: '사마귀 격파', how: '사마귀를 배틀에서 이기기' },
  { key: 'beat_bee', emoji: '🐝', name: '벌 격파', how: '벌을 배틀에서 이기기' },
  { key: 'beat_butterfly', emoji: '🦋', name: '나비 격파', how: '나비를 배틀에서 이기기' },
  { key: 'beat_other', emoji: '🐞', name: '기타 곤충 격파', how: '목록에 없는 곤충(기타 곤충)을 이기기' },
  { key: 'beatAll', emoji: '🏆', name: '곤충 도장 깨기', how: '여섯 종류 곤충을 모두 이기기' },
  { key: 'gold', emoji: '🥇', name: '골드 회원', how: '5만원 이상 참가권 (개수에는 안 세)', paid: true },
  { key: 'diamond', emoji: '💎', name: '다이아 회원', how: '10만원 다이아 참가권 (개수에는 안 세)', paid: true },
];

/** 곤충 종류(저장된 한글 이름) → 도장 깨기 키. 목록에 없는 이름(물방개 등)은 기타 곤충. */
export function speciesBeatKey(species: string | null | undefined): string {
  return findSpecies(species)?.key ?? 'other';
}

/** 개수에 세는 뱃지 (참가권 뱃지 빼고) */
export const COUNTED_BADGES = BADGES.filter((b) => !b.paid);
export const COUNTED_TOTAL = COUNTED_BADGES.length;

export function countBadges(earned: Set<string>): number {
  return COUNTED_BADGES.filter((b) => earned.has(b.key)).length;
}

// ── 뱃지 개수 보상 (2026-10-01 Jin) ──────────────────────────────
export interface BadgeMilestone {
  count: number;
  emoji: string;
  title: string;
  /** 선물(현장에서 받는 것)인지, 배틀 버프인지 */
  kind: 'gift' | 'buff';
  text: string;
}

export const BADGE_MILESTONES: BadgeMilestone[] = [
  { count: 10, emoji: '🎁', title: '대전 뱃지 선물', kind: 'gift', text: '진짜 대전 뱃지를 부스에서 받을 수 있어!' },
  { count: 10, emoji: '💚', title: 'HP +10%', kind: 'buff', text: '내 곤충의 HP가 올라가!' },
  { count: 15, emoji: '🛡️', title: '수비력 +15%', kind: 'buff', text: '내 곤충의 수비력이 올라가!' },
  { count: 20, emoji: '⚡', title: '필살기 공격 +10%', kind: 'buff', text: '내 곤충의 필살기가 더 세져!' },
  { count: COUNTED_TOTAL, emoji: '👑', title: '뱃지 올클리어 선물', kind: 'gift', text: '이번 행사 뱃지를 전부 모으면 특별한 선물이 있어!' },
];

/** 뱃지 개수로 받는 배틀 버프 (누적: 20개면 셋 다) */
export interface BadgePerks {
  hp: number;
  def: number;
  /** 공격형 필살기 위력 배수 */
  special: number;
}

export const BADGE_PERK_HP = 0.1;
export const BADGE_PERK_DEF = 0.15;
export const BADGE_PERK_SPECIAL = 0.1;

export function badgePerks(count: number): BadgePerks {
  const n = Number.isFinite(count) ? count : 0;
  return {
    hp: n >= 10 ? 1 + BADGE_PERK_HP : 1,
    def: n >= 15 ? 1 + BADGE_PERK_DEF : 1,
    special: n >= 20 ? 1 + BADGE_PERK_SPECIAL : 1,
  };
}

/** 이번에 넘은 보상들 (before 개수 → after 개수) */
export function milestonesCrossed(before: number, after: number): BadgeMilestone[] {
  return BADGE_MILESTONES.filter((m) => before < m.count && after >= m.count);
}

/** 다음 보상까지 */
export function nextMilestone(count: number): BadgeMilestone | null {
  return BADGE_MILESTONES.find((m) => m.count > count) ?? null;
}

/** 그때그때 계산하는 뱃지를 정하는 데 필요한 사실들 */
export interface BadgeFacts {
  insectCount: number;
  sessions: number;
  battles: number;
  wins: number;
  maxLevel: number;
  hearts: number;
  judged: boolean;
  evolved: boolean;
  mySpecies: boolean;
  tierKey: string;
  /** 이긴 상대 곤충 종류 키들 (rhino·stag…·other). 도장 깨기 뱃지 */
  beatSpecies?: string[];
  /** 저장된 뱃지 (lib/game-state.ts) */
  stored: Record<string, string>;
}

export function earnedBadges(f: BadgeFacts): Set<string> {
  const got = new Set<string>(Object.keys(f.stored));
  got.add('daejeon'); // 번호를 받고 들어온 아이는 모두 행사 참가자
  if (f.insectCount >= 1) got.add('firstInsect');
  if (f.insectCount >= 2) got.add('collector2');
  if (f.insectCount >= 3) got.add('collector3');
  if (f.sessions >= 1) got.add('play1');
  if (f.sessions >= 2) got.add('revisit');
  if (f.sessions >= 3) got.add('play3');
  if (f.sessions >= 5) got.add('play5');
  if (f.battles >= 1) got.add('firstBattle');
  if (f.wins >= 1) got.add('firstWin');
  if (f.wins >= 5) got.add('win5');
  if (f.wins >= 10) got.add('win10');
  if (f.maxLevel >= 3) got.add('level3');
  if (f.maxLevel >= 5) got.add('level5');
  if (f.hearts >= 1) got.add('heart1');
  if (f.hearts >= 10) got.add('heart10');
  if (f.judged) got.add('beauty');
  if (f.evolved) got.add('evolved');
  if (f.mySpecies) got.add('mySpecies');
  (f.beatSpecies ?? []).forEach((key) => got.add(`beat_${key}`));
  if (['rhino', 'stag', 'mantis', 'bee', 'butterfly', 'other'].every((k) => got.has(`beat_${k}`))) got.add('beatAll');
  if (f.tierKey === 'C' || f.tierKey === 'D') got.add('gold');
  if (f.tierKey === 'D') got.add('diamond');
  // 1위를 했으면 2위·3위 "안에 든" 것도 맞으므로 같이 켭니다.
  if (got.has('rank1')) got.add('rank2');
  if (got.has('rank2')) got.add('rank3');
  return got;
}
