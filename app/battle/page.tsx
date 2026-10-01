'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentPlayer } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import { ENVIRONMENTS } from '@/lib/environments';
import { ORIGIN_EFFECTS, MATCHUP_BONUS, weakTo } from '@/lib/origins';
import { awardBadges, blockedMessage, claimSlot, playStatus } from '@/lib/game-state';
import PlayStatusCard from '@/app/play-status';
import { BattleResult, SideRoll, barPercents, resolveBattle, rollBattle } from '@/lib/battle-engine';
import { statsForInsect } from '@/lib/insect-stats';
import { BASE_CRIT, addXp, battleXpRate, critChance, defenseXpGain, levelProgress, xpDisplay } from '@/lib/leveling';
import {
  PERFECT_AT_MS,
  SpecialMove,
  TimingTier,
  judgeTiming,
  movesFor,
  baseMoveFor,
  SpecialMoveKey,
} from '@/lib/special-moves';
import { playPerfect, playSound, playTap, unlockAudio, SoundName } from '@/lib/sfx';
import { loadVisitMap } from '@/lib/visit-count';
import TierFrame from '@/app/card/tier-frame';
import FxText, { FxImage } from './fx-text';
import { TIMING_ART, MOVE_ART, IMPACT_ART } from '@/lib/fx-art';
import { CoreStats, EnvironmentKey, Insect, Player } from '@/lib/types';
import { BrandMark } from '@/app/brand-logo';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 배틀 연출을 이 배수만큼 늘립니다. 1이면 예전 속도, 2면 두 배 천천히.
 *
 * Jin 요청 (2026-09-29): "글씨 효과가 너무 빨리 없어진다. 나타나고 없어지는 속도를
 * 2배로 느리게, 배틀 시간 자체도 2배 길게."
 *
 * ⚠️ **화면(CSS) 쪽도 같이 늘려야 합니다.** `app/globals.css` 의 효과 글씨
 * 애니메이션 시간(`special-name`, `judge-pop`, `impact-pop`, `damage-float`)이
 * 여기와 짝이 맞아야 합니다. 한쪽만 늘리면 글자가 사라진 뒤에 기다리거나,
 * 글자가 떠 있는 채로 다음 장면이 겹칩니다.
 */
const BATTLE_PACE = 2;

/** 연출용 멈춤. 폴링 같은 내부 대기에는 쓰지 않습니다(그건 그대로 `sleep`). */
const pause = (ms: number) => sleep(ms * BATTLE_PACE);

// 필살기 버튼이 떠 있는 시간. 부스에서 어린 친구들도 누를 수 있도록 넉넉하게 둡니다.
//
// ⚠️ **여기는 일부러 `BATTLE_PACE` 를 곱하지 않았습니다.** 이 4초는 리듬게임 판정과
// 맞물려 있어(2초에 고리가 정확히 겹치도록 브라우저로 재서 맞춘 값),
// 늘리면 `PERFECT_AT_MS` 와 고리 애니메이션까지 다시 재야 합니다.
// 연출만 느려지고 누르는 타이밍은 그대로인 게 아이들에게도 덜 헷갈립니다.
const CHANCE_MS = 4000;

// 1라운드(탐색전)에서 깎이는 고정 수치. 최종 수치는 필살기까지 계산한 뒤에 정해집니다.
const PROBE_DAMAGE_A = 7;
const PROBE_DAMAGE_B = 8;

// ── 랭킹 도전 (2026-09-18) ──────────────────────────────────────
// 랭킹 3위 → 2위 → 1위를 차례로 올라가는 방식입니다.
// 이기면 위로 올라가고, 지면 같은 상대에게 다시 붙습니다. 기회는 총 3번.
//
// 부스에서 이 방식이 좋은 이유: 아이마다 도전 횟수가 똑같아서 공평하고,
// "몇 위까지 올라갔나"라는 목표가 생겨서 무한정 붙는 것보다 이야깃거리가 됩니다.
const LADDER_SIZE = 3;
const LADDER_BATTLES = 3;

/** 상대 고르기 목록에 쓰는 가벼운 정보. 이미지(base64)는 무거워서 여기선 안 받아옵니다. */
interface OpponentSummary {
  id: string;
  player_id: string;
  nickname: string;
  species: string | null;
  level: number;
  stats: CoreStats;
  bestScore: number;
  rank: number;
}

/** 랭킹 도전 진행 상황. 자유 대결일 때는 null 입니다. */
interface LadderState {
  /** 도전할 상대들. 낮은 순위부터 = [3위, 2위, 1위] */
  targets: OpponentSummary[];
  /** 지금 도전 중인 targets 인덱스 */
  index: number;
  /** 지금까지 치른 배틀 수 */
  used: number;
  log: { rank: number; nickname: string; won: boolean }[];
}

/** 배틀 화면에서 쓰는 효과음 — 시작 버튼을 누를 때 미리 받아둡니다 */
const BATTLE_SOUNDS: SoundName[] = ['special', 'win', 'lose', 'levelUp', 'gameOver'];

function ladderFinished(ladder: LadderState): boolean {
  return ladder.used >= LADDER_BATTLES || ladder.index >= ladder.targets.length;
}

type FightPhase = 'intro' | 'round' | 'chance' | 'final' | 'done';

interface ImpactFx {
  id: number;
  side: 'A' | 'B';
  amount: number; // 양수면 깎임, 음수면 회복
  crit: boolean;
}

interface SpecialFx {
  id: number;
  side: 'A' | 'B';
  move: SpecialMove;
  /** 맞는 쪽이 회피력으로 피했는지 */
  dodged: boolean;
  /** 기술 이름 아래 한 줄 ("🛡️ 막았다! 되받아치기!") */
  caption?: string;
}

const envOf = (key: EnvironmentKey | null | undefined) => ENVIRONMENTS.find((e) => e.key === key);

/** 받침이 있으면 앞의 조사, 없으면 뒤의 조사 (기온상승"이" / 저지대"가") */
function josa(word: string, withBatchim: string, without: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? withBatchim : without);
}

export default function BattlePage() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [myInsect, setMyInsect] = useState<Insect | null>(null);
  // 곤충 id → 그 아이의 몇 번째 곤충인지. 카드 등급 테두리용 (없어도 되는 장식).
  const [visits, setVisits] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 출신지 상성 안내 (예: "💧물근처가 🌡️기온상승을 이겨!"). 상성이 없으면 null.
  const [edgeNote, setEdgeNote] = useState<{ text: string; good: boolean } | null>(null);

  // ─── 상대 고르기 ───
  const [opponents, setOpponents] = useState<OpponentSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // ─── 랭킹 도전 ───
  const [ladder, setLadder] = useState<LadderState | null>(null);
  // 연습 게임(랭커와 1판)인지. 연습은 점수·경험치를 남기지 않습니다.
  // 연출 루프(runFight)가 시작할 때의 값을 봐야 해서 state 가 아니라 ref 로 둡니다.
  const practiceRef = useRef(false);
  // 30분 대기 시계를 1초마다 다시 그립니다.
  const [now, setNow] = useState(() => Date.now());

  // ─── 배틀 진행 ───
  const [opponent, setOpponent] = useState<Insect | null>(null);
  const [phase, setPhase] = useState<FightPhase | null>(null);
  const [battle, setBattle] = useState<BattleResult | null>(null);
  const [xpGained, setXpGained] = useState(0);
  const [leveledUp, setLeveledUp] = useState(false);
  const [starting, setStarting] = useState(false);

  // ─── 연출 상태 ───
  const [barA, setBarA] = useState(100);
  const [barB, setBarB] = useState(100);
  const [attackSide, setAttackSide] = useState<'A' | 'B' | null>(null);
  const [hitSide, setHitSide] = useState<'A' | 'B' | null>(null);
  const [impact, setImpact] = useState<ImpactFx | null>(null);
  const [specialFx, setSpecialFx] = useState<SpecialFx | null>(null);
  const [shaking, setShaking] = useState(false);
  const [chanceId, setChanceId] = useState(0);
  const [timing, setTiming] = useState<TimingTier | null>(null);
  const [usedSpecial, setUsedSpecial] = useState(false);

  // 버튼을 눌렀는지 연출 루프 안에서 확인해야 해서 ref 로 둡니다.
  const specialRequested = useRef(false);
  const fxCounter = useRef(0);
  // 타이밍 판정용. 버튼이 뜬 시각과, 눌렀을 때의 판정 결과를 담습니다.
  const chanceStart = useRef(0);
  const timingResult = useRef<TimingTier | null>(null);

  // 필살기 기회가 LV3부터 **두 번** 오므로, 지금 뜬 기회가 어떤 기술인지 따로 담습니다.
  const [chanceMove, setChanceMove] = useState<SpecialMove | null>(null);
  /** 필살기 버튼 위에 띄울 안내 ("🎁 보너스! 필살기 한 번 더!", "🛡️ 상대가 공격해! 지금 막아!") */
  const [chanceNote, setChanceNote] = useState<string | null>(null);
  /** 상대보다 레벨이 낮아서 크리티컬이 잘 터지는 배틀인지 (VS 화면 안내) */
  const [underdogNote, setUnderdogNote] = useState('');
  // 준비 화면에서 "내 기술"을 미리 보여줄 때 쓰는 기본기.
  const myMove = myInsect ? baseMoveFor(myInsect.species) : null;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    getCurrentPlayer().then((p) => {
      if (!p) {
        router.push('/start');
        return;
      }
      setPlayer(p);
      loadMyInsect(p.id);
    });
  }, [router]);

  async function loadMyInsect(playerId: string) {
    setLoading(true);
    const { data } = await supabase
      .from('insects')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setMyInsect(data as Insect | null);
    setLoading(false);
    // 등급 테두리는 장식이라 배틀 화면을 먼저 띄운 뒤 따로 받아옵니다.
    void loadVisitMap().then(setVisits);
  }

  // 상대 목록은 "랭킹 순"으로 보여줍니다.
  // 이미지가 빠져 있어 300명이 있어도 목록 자체는 가볍습니다. 고른 상대의 그림만 나중에 따로 받아옵니다.
  //
  // 내 곤충까지 **같이 불러와서 순위를 매긴 뒤에** 나만 빼냅니다.
  // 처음부터 나를 빼고 순위를 매기면, 내가 1등일 때 2등이 "1위"로 표시돼 버립니다.
  const loadOpponents = useCallback(async (playerId: string) => {
    setListLoading(true);
    const [{ data: rows }, { data: scores }] = await Promise.all([
      supabase
        .from('insects')
        .select('id, player_id, nickname, species, level, stats')
        .limit(400),
      supabase.from('battles').select('insect_id, score').order('score', { ascending: false }).limit(1000),
    ]);

    const best = new Map<string, number>();
    (scores || []).forEach((row: any) => {
      const current = best.get(row.insect_id) ?? 0;
      if (row.score > current) best.set(row.insect_id, row.score);
    });

    const list: OpponentSummary[] = (rows || []).map((row: any) => ({
      id: row.id,
      player_id: row.player_id,
      nickname: row.nickname || '이름없음',
      species: row.species,
      level: row.level ?? 1,
      stats: row.stats,
      bestScore: best.get(row.id) ?? 0,
      rank: 0, // 정렬 직후에 채웁니다.
    }));

    list.sort((a, b) => b.bestScore - a.bestScore || b.level - a.level);
    list.forEach((item, i) => {
      item.rank = i + 1;
    });
    // 순위를 다 매긴 다음에 내 곤충을 뺍니다. 남은 순위 번호는 전체 기준 그대로입니다.
    setOpponents(list.filter((item) => item.player_id !== playerId));
    setListLoading(false);
  }, []);

  useEffect(() => {
    if (player) loadOpponents(player.id);
  }, [player, loadOpponents]);

  // 결과가 뜨면 효과음: 이김/짐 → (레벨업) → (게임이 끝났으면) 게임 끝
  // 배틀 결과·사다리·레벨업이 한 번에 바뀌므로 여기서 한꺼번에 보고 한 배틀에 한 번만 틉니다.
  const soundedBattle = useRef<BattleResult | null>(null);
  useEffect(() => {
    if (phase !== 'done' || !battle || soundedBattle.current === battle) return;
    soundedBattle.current = battle;
    let at = 0;
    if (battle.winner === 'A') playSound('win');
    else if (battle.winner === 'B') playSound('lose');
    if (leveledUp) playSound('levelUp', (at += 1000));
    const over = practiceRef.current || (ladder ? ladderFinished(ladder) : false);
    if (over) playSound('gameOver', at + 1300);
  }, [phase, battle, ladder, leveledUp]);

  // ───────────────────────────────────────────────
  // 연출 도우미
  // ───────────────────────────────────────────────
  function nextFxId() {
    fxCounter.current += 1;
    return fxCounter.current;
  }

  /** 한쪽이 달려들어 때리는 한 합. */
  async function exchange(attacker: 'A' | 'B', amount: number, crit: boolean) {
    const target = attacker === 'A' ? 'B' : 'A';

    setAttackSide(attacker);
    await pause(170);

    setHitSide(target);
    setImpact({ id: nextFxId(), side: target, amount, crit });
    setShaking(true);
    if (target === 'A') setBarA((v) => clampBar(v - amount));
    else setBarB((v) => clampBar(v - amount));

    await pause(430);
    setAttackSide(null);
    setHitSide(null);
    setShaking(false);
    await pause(160);
  }

  /** 필살기 연출: 화면이 하얗게 번쩍이고 기술 이름이 크게 뜹니다. */
  async function playSpecial(side: 'A' | 'B', move: SpecialMove, dodged = false, caption?: string) {
    playSound('special');
    setSpecialFx({ id: nextFxId(), side, move, dodged, caption });
    setShaking(true);
    await pause(500);
    setShaking(false);
    await pause(1000);
    setSpecialFx(null);
    await pause(150);
  }

  /**
   * 필살기 버튼이 떠 있는 동안 기다립니다. 누르면 판정 등급을, 안 누르면 null 을 돌려줍니다.
   *
   * 고리가 줄어드는 그림은 CSS가 그리고(60fps), 여기서는 "눌렀나"만 확인합니다.
   * 매 프레임 setState 로 고리를 그리면 폰에서 버벅여 타이밍 게임이 성립하지 않습니다.
   */
  async function waitForChance(): Promise<TimingTier | null> {
    specialRequested.current = false;
    timingResult.current = null;
    setTiming(null);
    setChanceId((v) => v + 1); // 고리 애니메이션을 처음부터 다시 돌립니다.

    // 고리가 **화면에 실제로 그려진** 뒤부터 시간을 잽니다.
    // 여기서 바로 재면 React가 아직 버튼을 그리기 전이라, 아이가 보는 고리보다
    // 판정 시계가 몇십 ms 앞서 갑니다. 타이밍 게임에서는 그게 그대로 억울함이 됩니다.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
    chanceStart.current = performance.now();

    while (performance.now() - chanceStart.current < CHANCE_MS) {
      if (specialRequested.current) return timingResult.current;
      await sleep(50);
    }
    return null;
  }

  /** 아이가 필살기 버튼을 눌렀을 때. 누른 순간으로 등급을 매깁니다. */
  function pressSpecial() {
    if (specialRequested.current) return; // 한 배틀에 한 번만
    const tier = judgeTiming(performance.now() - chanceStart.current);
    timingResult.current = tier;
    setTiming(tier);
    specialRequested.current = true;

    // 퍼펙트에만 "키잉!" 을 주고 나머지는 짧은 틱만 줍니다. 그래야 퍼펙트가 특별해집니다.
    // 터치한 그 순간에 호출해야 폰에서 소리가 납니다 (브라우저 정책).
    if (tier.key === 'perfect') playPerfect();
    else playTap(tier.key === 'ok' ? 500 : 800);
  }

  // ───────────────────────────────────────────────
  // 배틀 시작
  // ───────────────────────────────────────────────
  async function startBattle(summary: OpponentSummary) {
    if (!player || !myInsect) return;
    setStarting(true);
    setError('');
    try {
      // 고른 상대의 그림만 이때 받아옵니다.
      const { data, error: fetchError } = await supabase
        .from('insects')
        .select('*')
        .eq('id', summary.id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) throw new Error('상대 곤충을 못 찾았어. 화면을 새로고침해줘!');

      const foe = data as Insect;
      setOpponent(foe);
      await runFight(foe);
    } catch (err: any) {
      setError(err.message || '배틀을 시작 못 했어. 다시 눌러줘!');
      setPhase(null);
    } finally {
      setStarting(false);
    }
  }

  async function runFight(foe: Insect) {
    if (!player || !myInsect) return;

    // 필살기는 **곤충 종류**로 정해지고, LV3부터 반대 형 공통기가 하나 더 열립니다.
    const myMoves = movesFor(myInsect.species, myInsect.level);
    const foeMoves = movesFor(foe.species, foe.level);

    // 운·크리티컬은 배틀 시작 때 한 번만 굴려둡니다.
    // 필살기 선택 뒤에 다시 굴리면 "필살기를 썼는데 더 나빠졌다"가 생길 수 있기 때문입니다.
    //
    // 능력치는 저장된 값이 아니라 **입력값에서 다시 계산**합니다 (공식이 바뀌어도 모두 같은 규칙으로 싸우게).
    const rolls: { a: SideRoll; b: SideRoll } = rollBattle(
      { stats: statsForInsect(myInsect), level: myInsect.level, origin: myInsect.origin ?? null },
      { stats: statsForInsect(foe), level: foe.level, origin: foe.origin ?? null }
    );

    // 출신지 상성을 VS 화면에서 알려줍니다.
    const mine = envOf(myInsect.origin);
    const theirs = envOf(foe.origin);
    const bonus = Math.round(MATCHUP_BONUS * 100);
    setEdgeNote(
      rolls.a.matchup === 1 && mine && theirs
        ? { text: `${mine.emoji}${josa(mine.label, '이', '가')} ${theirs.emoji}${josa(theirs.label, '을', '를')} 이겨! (내 힘 +${bonus}%)`, good: true }
        : rolls.a.matchup === -1 && mine && theirs
          ? { text: `${theirs.emoji}${josa(theirs.label, '이', '가')} ${mine.emoji}${josa(mine.label, '을', '를')} 이겨! (상대 힘 +${bonus}%)`, good: false }
          : null
    );

    // 상대보다 레벨이 낮으면 크리티컬이 더 잘 터진다 (역전 찬스, lib/leveling.ts)
    const myCrit = critChance(myInsect.level, foe.level);
    setUnderdogNote(
      myCrit > BASE_CRIT ? `🔥 역전 찬스! 레벨이 낮아서 크리티컬 확률 +${Math.round((myCrit - BASE_CRIT) * 100)}%` : ''
    );

    // 화면 초기화
    setBattle(null);
    setUsedSpecial(false);
    setTiming(null);
    setBarA(100);
    setBarB(100);
    setImpact(null);
    setSpecialFx(null);

    setPhase('intro');
    await pause(1100);

    // 1라운드 — 탐색전
    setPhase('round');
    await exchange('A', PROBE_DAMAGE_B, false);
    await exchange('B', PROBE_DAMAGE_A, false);

    // ─────────────────────────────────────────────────────────────
    // 필살기 순서 (2026-10-01 Jin: "수비 필살기는 상대가 공격할 때 터져야 하고,
    // 공격 필살기를 쓰면 상대 HP 가 그때 달아야 해. 지금은 필살기 다 쓰고 HP 가 한 번에 달아")
    //
    //   ① 내 공격 차례: 공격형 필살기 버튼 → 터지면 **바로 상대 HP 가 깎인다**
    //      (상대가 수비형이면 이때 상대 방패가 터져서 덜 깎이고)
    //   ② 상대 공격 차례: 상대가 공격할 때 **내 수비형 필살기 버튼**이 뜬다 → 막고 되받아친다
    //   ③ 마지막 한 방: 진 쪽 HP 가 0 이 된다
    //
    // ⚠️ 승패 계산(resolveBattle)은 예전과 똑같다. 바뀐 건 **보여주는 순서와 HP 바가 깎이는 때**뿐이다.
    //    중간에 깎는 양은 연출용이라, 마지막에 진 쪽 0 / 이긴 쪽은 남은 만큼으로 맞춘다.
    // ─────────────────────────────────────────────────────────────
    const usedKeys: SpecialMoveKey[] = [];
    let bestTier: TimingTier | null = null;
    let extraA: SpecialMoveKey | null = null;
    const extraB: SpecialMoveKey | null = rolls.b.bonus ? baseMoveFor(foe.species).key : null;

    // 지금 HP 바 (연출용). 중간에는 15% 아래로 안 내려간다 — 0 은 마지막 한 방에서만.
    const FLOOR = 15;
    let curA = clampBar(100 - PROBE_DAMAGE_A);
    let curB = clampBar(100 - PROBE_DAMAGE_B);
    async function hit(attacker: 'A' | 'B', amount: number, crit: boolean) {
      const target = attacker === 'A' ? curB : curA;
      const dmg = Math.max(0, Math.min(Math.round(amount), target - FLOOR));
      if (attacker === 'A') curB -= dmg;
      else curA -= dmg;
      await exchange(attacker, dmg, crit);
    }
    /** 필살기 한 방이 HP 를 얼마나 깎는 것처럼 보일지 (보통 25 안팎, 크리 37 안팎) */
    const hitSize = (crit: boolean) => (crit ? 37 : 25);

    /** 내가 누르는 필살기 버튼 한 번. 누르면 판정을 돌려준다. */
    async function myChance(move: SpecialMove, note: string | null): Promise<TimingTier | null> {
      setChanceNote(note);
      setChanceMove(move);
      setPhase('chance');
      const tier = await waitForChance();
      setChanceNote(null);
      setPhase('final');
      if (!tier) return null;
      // 타이밍 보너스는 **제일 잘 누른 것 하나만** 적용합니다 (두 번 다 곱하면 최대 1.8배가 되어 무너짐).
      if (!bestTier || tier.scoreMultiplier > bestTier.scoreMultiplier) bestTier = tier;
      // 판정 글자(`퍼펙트!` 등)를 끝까지 보여주고 넘어갑니다 (judge-pop 2초와 짝).
      await pause(1000);
      return tier;
    }

    const myBase = baseMoveFor(myInsect.species);
    const foeBase = baseMoveFor(foe.species);
    // 🎁 "필살기 한 번 더!" — 레벨이 낮을수록 잘 걸린다 (LV1 50%). 기본기가 한 번 더. 크리 없음·회피 불가.
    const myAttacks = [
      ...myMoves.filter((m) => m.kind === 'attack').map((move) => ({ move, bonus: false })),
      ...(rolls.a.bonus && myBase.kind === 'attack' ? [{ move: myBase, bonus: true }] : []),
    ];
    const myGuards = [
      ...myMoves.filter((m) => m.kind === 'defense').map((move) => ({ move, bonus: false })),
      ...(rolls.a.bonus && myBase.kind === 'defense' ? [{ move: myBase, bonus: true }] : []),
    ];
    const foeAttacks = [
      ...foeMoves.filter((m) => m.kind === 'attack').map((move) => ({ move, bonus: false })),
      ...(extraB && foeBase.kind === 'attack' ? [{ move: foeBase, bonus: true }] : []),
    ];
    const foeGuards = [
      ...foeMoves.filter((m) => m.kind === 'defense').map((move) => ({ move, bonus: false })),
      ...(extraB && foeBase.kind === 'defense' ? [{ move: foeBase, bonus: true }] : []),
    ];

    // ① 내 공격 차례 ─────────────────────────────
    let foeGuardShown = false;
    for (const { move, bonus } of myAttacks) {
      const tier = await myChance(move, bonus ? '🎁 보너스! 필살기 한 번 더!' : null);
      if (!tier) continue;
      if (bonus) extraA = move.key;
      else usedKeys.push(move.key);
      const dodged = !bonus && rolls.b.dodged; // "한 번 더" 는 회피로 못 피한다
      await playSpecial('A', move, dodged);
      if (dodged) continue;
      // 상대가 수비형이면 내 공격을 맞는 이 순간에 방패가 터진다
      let guard = 1;
      if (!foeGuardShown && foeGuards.length) {
        foeGuardShown = true;
        for (const g of foeGuards) await playSpecial('B', g.move, false, '🛡️ 상대가 막았다!');
        guard = 0.5;
      }
      await hit('A', hitSize(rolls.a.crit && !bonus) * guard, rolls.a.crit && !bonus);
    }
    // 내가 공격을 못 했어도 상대 수비형은 되받아치기를 한다 (계산에도 들어가 있음)
    if (!foeGuardShown && foeGuards.length) {
      foeGuardShown = true;
      for (const g of foeGuards) await playSpecial('B', g.move, false, '💥 상대가 되받아쳤다!');
      await hit('B', 12, false);
    }

    // ② 상대 공격 차례 — 내 수비형 필살기는 **상대가 공격할 때** 버튼이 뜬다 ───
    // 상대에게 공격형 필살기가 없으면 평범한 공격 한 번에 맞춰 막는다.
    const incoming = foeAttacks.length ? foeAttacks : myGuards.length ? [{ move: null, bonus: false }] : [];
    const guards = [...myGuards];
    for (let i = 0; i < incoming.length; i++) {
      const { move, bonus } = incoming[i];
      const dodged = !!move && !bonus && rolls.a.dodged;
      if (move) await playSpecial('B', move, dodged);
      if (dodged) continue;
      // 마지막 공격이면 남은 방패를 다 쓴다 (방패가 공격보다 많을 때)
      const mine = i === incoming.length - 1 ? guards.splice(0) : guards.splice(0, 1);
      let guard = 1;
      for (const g of mine) {
        const tier = await myChance(
          g.move,
          g.bonus ? '🎁 보너스! 한 번 더 막아!' : move ? '🛡️ 상대가 공격해! 지금 막아!' : '🛡️ 상대가 덤벼! 지금 막아!'
        );
        if (!tier) continue;
        if (g.bonus) extraA = g.move.key;
        else usedKeys.push(g.move.key);
        await playSpecial('A', g.move, false, '🛡️ 막았다! 되받아치기!');
        guard *= 0.5;
      }
      await hit('B', (move ? hitSize(rolls.b.crit && !bonus) : 14) * guard, !!move && rolls.b.crit && !bonus);
      if (guard < 1) await hit('A', 10, false); // 막아낸 힘으로 되받아치기
    }

    setUsedSpecial(usedKeys.length > 0 || !!extraA);

    // 상대는 자기 필살기를 항상 씁니다. (안 그러면 내가 쓰기만 하면 무조건 이김)
    const final = resolveBattle(
      rolls.a,
      rolls.b,
      usedKeys,
      foeMoves.map((m) => m.key),
      (bestTier as TimingTier | null)?.scoreMultiplier ?? 1,
      undefined,
      { a: extraA, b: extraB }
    );

    // 기록 저장은 연출이 도는 동안 뒤에서 진행합니다.
    const savePromise = saveResult(foe, final);

    // 이번 배틀에서 생긴 뱃지 (lib/badges.ts). 실패해도 배틀은 그대로 갑니다.
    const iWon = final.winner === 'A';
    const earned = ['firstBattle'];
    if (iWon) earned.push('firstWin');
    if ((bestTier as TimingTier | null)?.key === 'perfect') earned.push('perfect');
    if (final.a.dodged) earned.push('dodge');
    if (iWon && final.a.crit) earned.push('critWin');
    if (iWon && final.a.matchup === 1) earned.push('matchupWin');
    if (iWon && foe.level > myInsect.level) earned.push('giantSlayer');
    if (practiceRef.current) earned.push('practice');
    if (ladder && iWon) {
      const target = ladder.targets[ladder.index];
      if (target?.rank === 1) earned.push('beatTop1');
      if (ladder.index + 1 >= ladder.targets.length) earned.push('ladderClear');
    }
    void awardBadges(player.id, earned);

    // ③ 마지막 한 방 — 진 쪽은 0, 이긴 쪽은 이긴 만큼만 남는다 (`barPercents`).
    // 중간에 이미 더 깎였으면 다시 올라가지 않게 지금 값과 비교해 낮은 쪽을 쓴다.
    const bars = barPercents(final);
    const winner = final.winner === 'B' ? 'B' : 'A';
    const loser = winner === 'A' ? 'B' : 'A';
    const endA = final.winner === 'draw' ? Math.min(curA, bars.a) : winner === 'A' ? Math.min(curA, Math.max(1, bars.a)) : 0;
    const endB = final.winner === 'draw' ? Math.min(curB, bars.b) : winner === 'B' ? Math.min(curB, Math.max(1, bars.b)) : 0;
    const deltaLoser = loser === 'A' ? curA - endA : curB - endB;

    setPhase('final');
    setAttackSide(winner);
    await pause(200);
    setHitSide(loser);
    setImpact({
      id: nextFxId(),
      side: loser,
      amount: Math.max(1, deltaLoser),
      crit: winner === 'A' ? final.a.crit : final.b.crit,
    });
    setShaking(true);
    setBarA(endA);
    setBarB(endB);
    await pause(750);
    setAttackSide(null);
    setHitSide(null);
    setShaking(false);

    const saved = await savePromise;
    setXpGained(saved.xpGained);
    setLeveledUp(saved.leveledUp);
    setBattle(final);

    // 랭킹 도전 중이면 한 칸 올라가거나 제자리에 남습니다.
    // 자유 대결(ladder === null)일 때는 아무 일도 일어나지 않습니다.
    const won = final.winner === 'A';
    setLadder((prev) => {
      if (!prev) return prev;
      const target = prev.targets[prev.index];
      return {
        ...prev,
        index: won ? prev.index + 1 : prev.index,
        used: prev.used + 1,
        log: [...prev.log, { rank: target.rank, nickname: target.nickname, won }],
      };
    });

    setPhase('done');
  }

  async function saveResult(foe: Insect, final: BattleResult) {
    if (!player || !myInsect) return { xpGained: 0, leveledUp: false };
    // 연습 게임은 기록을 남기지 않습니다 (랭킹 점수·경험치 둘 다).
    if (practiceRef.current) return { xpGained: 0, leveledUp: false };

    // 경험치: LV1 100%(바로 레벨업) · LV2 70% · LV3 49% … LV3 부터는 지면 절반 (lib/leveling.ts)
    const gain = addXp(myInsect.level, myInsect.xp, battleXpRate(myInsect.level, final.winner === 'A'));
    const gained = gain.shown; // 화면에 보여줄 XP 숫자 (레벨이 높을수록 커짐)
    const newXp = gain.xp;
    const newLevel = gain.level;
    const didLevelUp = gain.levelsUp > 0;

    try {
      await supabase.from('battles').insert({
        player_id: player.id,
        insect_id: myInsect.id,
        opponent_insect_id: foe.id,
        // 예전에는 배틀마다 고른 환경을 적었다. 이제는 내 곤충의 출신지를 적는다.
        environment: myInsect.origin ?? 'meteor',
        score: final.a.score,
        result: final.winner === 'A' ? 'win' : final.winner === 'B' ? 'lose' : 'draw',
      });
      await supabase
        .from('insects')
        .update({ xp: newXp, level: newLevel, battle_count: myInsect.battle_count + 1 })
        .eq('id', myInsect.id);
      setMyInsect({ ...myInsect, xp: newXp, level: newLevel, battle_count: myInsect.battle_count + 1 });

      // 수비한 곤충(상대)도 경험치를 조금 받는다 — 내 쪽의 20%, 하루 레벨 1개까지 (lib/leveling.ts)
      // 실패해도 배틀 결과에는 영향이 없다.
      try {
        const { data: fresh } = await supabase.from('insects').select('level, xp, stats').eq('id', foe.id).maybeSingle();
        if (fresh) {
          const stats = (fresh as any).stats ?? {};
          const d = defenseXpGain((fresh as any).level ?? 1, (fresh as any).xp ?? 0, final.winner === 'B', stats.defense);
          if (d) {
            await supabase
              .from('insects')
              .update({ level: d.gain.level, xp: d.gain.xp, stats: { ...stats, defense: d.record } })
              .eq('id', foe.id);
          }
        }
      } catch {
        // 수비 경험치는 덤이라 실패해도 넘어갑니다.
      }
    } catch {
      // 기록 저장이 실패해도 연출과 결과는 그대로 보여줍니다. (부스에서 흐름이 끊기지 않도록)
    }

    return { xpGained: gained, leveledUp: didLevelUp };
  }

  // 랭킹 도전 시작: 지금 순위표의 위쪽 3명을 뽑아 **고정**합니다.
  // 도중에 다른 아이가 점수를 올려 순위가 바뀌어도 사다리는 흔들리지 않습니다.
  async function startLadder() {
    if (!player || opponents.length === 0) return;
    // 아이가 누른 바로 이 순간에 소리를 깨워둡니다 (폰은 터치 순간에만 소리를 켤 수 있음).
    unlockAudio(BATTLE_SOUNDS);
    // 랭킹 도전 1번 = 1게임. 시작하는 순간 게임 하나를 씁니다 (lib/game-state.ts).
    setError('');
    try {
      setPlayer(await claimSlot(player.id, 'ladder'));
    } catch (err: any) {
      setError(err.message || '지금은 랭킹 도전을 할 수 없어.');
      return;
    }
    practiceRef.current = false;
    // 상위 3명을 낮은 순위부터(3위 → 2위 → 1위) 도전하도록 뒤집습니다.
    // 상대가 3명보다 적으면 있는 만큼만 도전합니다. (행사 초반에는 참가자가 몇 명 없습니다.)
    const targets = opponents.slice(0, LADDER_SIZE).reverse();
    const run: LadderState = { targets, index: 0, used: 0, log: [] };
    setLadder(run);
    startBattle(targets[0]);
  }

  /** 랭커와 연습 게임 — 게임당 1판, 기록은 안 남습니다 (Jin 요청 2026-10-01). */
  async function startPractice(target: OpponentSummary) {
    if (!player) return;
    unlockAudio(BATTLE_SOUNDS);
    setError('');
    try {
      setPlayer(await claimSlot(player.id, 'practice'));
    } catch (err: any) {
      setError(err.message || '지금은 연습 게임을 할 수 없어.');
      return;
    }
    practiceRef.current = true;
    setLadder(null);
    startBattle(target);
  }

  function nextLadderBattle() {
    if (!ladder || ladderFinished(ladder)) return;
    unlockAudio();
    // 여기서 화면을 비우면 상대 그림을 받아오는 동안 준비 화면이 한 번 번쩍입니다.
    // 결과 카드를 띄워둔 채로 다음 상대를 불러오고, 연출은 runFight 가 알아서 초기화합니다.
    startBattle(ladder.targets[ladder.index]);
  }

  function resetStage() {
    setPhase(null);
    setBattle(null);
    setOpponent(null);
    setImpact(null);
    setSpecialFx(null);
    setBarA(100);
    setBarB(100);
  }

  function backToSetup() {
    resetStage();
    setLadder(null);
    if (player) loadOpponents(player.id);
  }

  // ───────────────────────────────────────────────
  // 화면
  // ───────────────────────────────────────────────
  if (loading) {
    return (
      <main className="max-w-md mx-auto min-h-screen flex items-center justify-center">불러오는 중...</main>
    );
  }

  if (!myInsect) {
    return (
      <main className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <p>아직 만든 곤충이 없어.</p>
        <button
          onClick={() => router.push('/upload')}
          className="bg-emerald-500 text-slate-900 font-bold py-3 px-6 rounded-2xl"
        >
          📸 곤충 만들러 가기
        </button>
      </main>
    );
  }

  // ─── 배틀 화면 ───
  if (phase && opponent) {
    return (
      <main
        className={`max-w-md mx-auto min-h-screen flex flex-col gap-2 px-4 py-5 relative overflow-hidden ${
          shaking ? 'animate-screen-shake' : ''
        }`}
      >
        {/* 필살기 섬광은 화면 전체를 덮습니다 */}
        {specialFx && (
          <div key={`flash-${specialFx.id}`} className="fixed inset-0 z-40 pointer-events-none">
            <div className={`absolute inset-0 ${specialFx.move.flashColor} animate-special-flash`} />
            <div className="absolute inset-0 bg-white/80 animate-special-flash" />
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`absolute left-1/2 top-1/2 w-40 h-40 rounded-full border-4 ${specialFx.move.textColor} animate-special-ring`}
                style={{ animationDelay: `${i * 0.18}s`, borderColor: 'currentColor' }}
              />
            ))}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className={`text-[3.625rem] leading-none font-black ${specialFx.move.textColor} animate-special-name drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]`}>
                {specialFx.move.emoji}
              </p>
              <div className="mt-2 flex justify-center animate-special-name drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                <FxText
                  art={MOVE_ART[specialFx.move.key]}
                  text={specialFx.move.name}
                  height={120}
                  textClassName={`text-3xl font-black ${specialFx.move.textColor}`}
                />
              </div>
              <p className="mt-1 text-sm font-bold text-white animate-special-name">
                {specialFx.side === 'A' ? '내 곤충의 필살기!' : '상대의 필살기!'}
              </p>
              {specialFx.caption && (
                <p className="mt-3 px-4 text-center text-2xl font-black text-amber-200 whitespace-nowrap animate-special-name drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                  {specialFx.caption}
                </p>
              )}
              {/* 회피 — 맞는 쪽의 회피력으로 필살기를 통째로 피했을 때 */}
              {specialFx.dodged && (
                <p className="mt-4 px-4 text-center text-3xl font-black text-sky-300 whitespace-nowrap animate-special-name drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                  💨 {specialFx.side === 'A' ? '상대가' : '내 곤충이'} 피했다!
                </p>
              )}
            </div>
          </div>
        )}

        {/* 랭킹 도전 중이면 지금 몇 번째 도전인지, 누구와 붙는지 위에 띄웁니다. */}
        {ladder && opponent && (
          <div className="flex items-center justify-between text-xs bg-slate-800 rounded-xl px-3 py-2">
            <span className="font-bold text-amber-300">
              🏆 랭킹 도전 {Math.min(phase === 'done' ? ladder.used : ladder.used + 1, LADDER_BATTLES)}/
              {LADDER_BATTLES}
            </span>
            <span className="text-slate-300">
              {rankMedal(ladder.targets[Math.min(ladder.index, ladder.targets.length - 1)].rank)}{' '}
              {ladder.targets[Math.min(ladder.index, ladder.targets.length - 1)].nickname}
            </span>
          </div>
        )}

        <Fighter
          insect={myInsect}
          visit={visits.get(myInsect.id) ?? 1}
          label="내 곤충"
          side="A"
          attacking={attackSide === 'A'}
          hit={hitSide === 'A'}
          powered={specialFx?.side === 'A'}
          powerColor={specialFx?.side === 'A' ? specialFx.move.textColor : ''}
          impact={impact?.side === 'A' ? impact : null}
          barPercent={barA}
          barColor="bg-emerald-400"
          crit={phase === 'done' && !!battle?.a.crit}
        />

        <div className="text-center">
          {phase === 'intro' ? (
            <p className="text-[3.625rem] leading-none font-black italic text-amber-400 animate-vs-slam">VS</p>
          ) : (
            <p className="text-2xl font-black italic text-amber-400/70">VS</p>
          )}
          {edgeNote && (
            <p
              className={`mt-1 text-xs font-bold ${edgeNote.good ? 'text-emerald-300' : 'text-rose-300'}`}
              style={{ wordBreak: 'keep-all' }}
            >
              ⚡ 상성! {edgeNote.text}
            </p>
          )}
          {underdogNote && phase !== 'done' && (
            <p className="mt-1 text-xs font-bold text-amber-300" style={{ wordBreak: 'keep-all' }}>
              {underdogNote}
            </p>
          )}
        </div>

        <Fighter
          insect={opponent}
          visit={visits.get(opponent.id) ?? 1}
          label="상대 곤충"
          side="B"
          attacking={attackSide === 'B'}
          hit={hitSide === 'B'}
          powered={specialFx?.side === 'B'}
          powerColor={specialFx?.side === 'B' ? specialFx.move.textColor : ''}
          impact={impact?.side === 'B' ? impact : null}
          barPercent={barB}
          barColor="bg-rose-400"
          crit={phase === 'done' && !!battle?.b.crit}
        />

        {/* 필살기 버튼 — 배틀당 딱 한 번.
            큰 고리가 줄어들다가 가운데 목표 고리와 겹치는 순간(2초)이 퍼펙트입니다. */}
        {phase === 'chance' && chanceMove && (
          <button
            onClick={pressSpecial}
            className="mt-2 w-full bg-slate-900/60 rounded-2xl py-4 select-none"
          >
            {chanceNote && (
              <p className="text-base font-black text-amber-300 animate-pop">{chanceNote}</p>
            )}
            <p className={`text-sm font-bold ${chanceMove.textColor}`}>
              {chanceMove.emoji} {chanceMove.name}
              <span className="ml-1 text-[0.6875rem] text-slate-400">
                ({chanceMove.kind === 'attack' ? '공격' : '수비'})
              </span>
            </p>

            <div className="relative h-36 my-1">
              {/* 목표 고리 — 여기에 겹칠 때 눌러야 퍼펙트 */}
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-4 border-amber-300 animate-timing-target" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-amber-400/10" />

              {/* 줄어드는 고리 — CSS가 60fps로 그립니다 */}
              {!timing && (
                <span
                  key={chanceId}
                  className="absolute left-1/2 top-1/2 w-24 h-24 rounded-full border-4 border-white animate-timing-ring"
                  style={{ animationDuration: `${CHANCE_MS}ms` }}
                />
              )}

              {/* 판정 결과 */}
              {timing && (
                <div className="absolute left-1/2 top-1/2 animate-judge-pop drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  <FxText
                    art={TIMING_ART[timing.key]}
                    text={`${timing.emoji} ${timing.label}`}
                    height={130}
                    textClassName={`text-4xl font-black whitespace-nowrap ${timing.textColor}`}
                  />
                </div>
              )}

              {!timing && (
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl">
                  {chanceMove.emoji}
                </span>
              )}
            </div>

            <p className="text-xs font-bold text-slate-200">
              {timing
                ? timing.scoreMultiplier > 1
                  ? `위력 +${Math.round((timing.scoreMultiplier - 1) * 100)}%!`
                  : '필살기 발동!'
                : '고리가 딱 겹칠 때 눌러!'}
            </p>
          </button>
        )}

        {phase === 'round' && (
          <p className="text-center text-sm text-slate-400 mt-1">서로 살펴보는 중...</p>
        )}
        {phase === 'final' && !specialFx && (
          <p className="text-center text-sm text-slate-400 mt-1">마지막 공격!</p>
        )}

        {phase === 'done' && battle && (
          <div className="flex flex-col gap-3 bg-slate-800 rounded-2xl p-4 text-center animate-pop mt-2">
            {(battle.a.crit || battle.b.crit) && (
              <p className="text-2xl font-black text-amber-400">💥 크리티컬!</p>
            )}
            <p className="text-lg font-bold">
              {battle.winner === 'A'
                ? '🎉 내 곤충 생존 성공!'
                : battle.winner === 'B'
                  ? '💀 내 곤충이 버티지 못했어…'
                  : '🤝 무승부'}
            </p>
            {practiceRef.current ? (
              <p className="text-sm text-sky-300" style={{ wordBreak: 'keep-all' }}>🎯 연습 게임이라 점수·경험치는 안 남아. 실력만 쑥쑥!</p>
            ) : (
              <p className="text-sm text-emerald-400">
                +{xpGained} XP{leveledUp ? ' · 🆙 레벨업!' : ''}
              </p>
            )}
            {usedSpecial && timing && myMove && (
              <p className={`text-xs ${timing.textColor}`}>
                {timing.emoji} {timing.label} {myMove.name}
                {timing.scoreMultiplier > 1
                  ? ` · 위력 +${Math.round((timing.scoreMultiplier - 1) * 100)}%`
                  : ' · 타이밍을 맞추면 더 세져!'}
              </p>
            )}
            {!usedSpecial && myMove && (
              <p className="text-xs text-amber-300">
                이번엔 필살기({myMove.name})를 못 썼어. 다음엔 고리가 겹칠 때 눌러봐!
              </p>
            )}
            {/* 랭킹 도전 중이면 다음 상대를, 끝났으면 성적표를 보여줍니다. */}
            {ladder && (
              <div className="bg-slate-900 rounded-xl px-3 py-3 flex flex-col gap-2">
                <ol className="flex flex-col gap-1 text-sm">
                  {ladder.log.map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="text-slate-300">
                        {rankMedal(item.rank)} {item.nickname}
                      </span>
                      <span className={item.won ? 'text-emerald-400' : 'text-rose-400'}>
                        {item.won ? '이김' : '짐'}
                      </span>
                    </li>
                  ))}
                </ol>

                {ladderFinished(ladder) ? (
                  <p className="text-sm font-bold text-amber-300 mt-1">
                    {ladder.index >= ladder.targets.length
                      ? '👑 전부 이겼다! 최고 기록이야'
                      : `도전 끝! ${LADDER_BATTLES}번 다 썼어`}
                  </p>
                ) : (
                  <p className="text-sm text-slate-300 mt-1">
                    {battle.winner === 'A'
                      ? `다음 상대는 ${rankMedal(ladder.targets[ladder.index].rank)} ${ladder.targets[ladder.index].nickname}!`
                      : `한 번 더! ${rankMedal(ladder.targets[ladder.index].rank)} ${ladder.targets[ladder.index].nickname}에게 다시 도전`}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              {ladder && !ladderFinished(ladder) ? (
                <button
                  onClick={nextLadderBattle}
                  disabled={starting}
                  className="flex-1 bg-emerald-500 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-xl"
                >
                  {battle.winner === 'A' ? '⬆️ 다음 도전' : '🔁 다시 도전'}
                </button>
              ) : (
                <button
                  onClick={backToSetup}
                  className="flex-1 bg-sky-500 text-slate-900 font-bold py-3 rounded-xl"
                >
                  {ladder ? '처음으로' : '돌아가기'}
                </button>
              )}
              <button
                onClick={() => router.push('/ranking')}
                className="flex-1 bg-amber-400 text-slate-900 font-bold py-3 rounded-xl"
              >
                🏆 랭킹
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ─── 준비 화면 (환경 고르기 + 상대 고르기) ───
  const filtered = opponents.filter((o) =>
    search.trim() ? o.nickname.toLowerCase().includes(search.trim().toLowerCase()) : true
  );
  const picked = opponents.find((o) => o.id === pickedId) ?? null;
  // 도전 순서대로(3위 → 2위 → 1위) 미리 보여줍니다.
  const ladderTargets = opponents.slice(0, LADDER_SIZE).reverse();
  const status = player ? playStatus(player, now) : null;

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold text-center"><BrandMark size={32} className="mr-2 -mt-1" />G7BB 배틀</h1>

      {/* 곤충 이름 (안 지었으면 "내 곤충") + 레벨 + XP 숫자 (Jin 10/1) */}
      <div className="bg-slate-800 rounded-2xl px-4 py-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-black truncate">
            {myInsect.nickname && myInsect.nickname !== player?.display_name ? myInsect.nickname : '내 곤충'}{' '}
            <span className="text-emerald-300">Lv.{myInsect.level}</span>
          </span>
          <span className="shrink-0 text-xs text-slate-400">배틀 {myInsect.battle_count}회</span>
        </div>
        {(() => {
          const x = xpDisplay(myInsect.level, myInsect.xp);
          return (
            <div>
              <div className="flex justify-between text-xs font-bold">
                <span className="text-amber-300">XP {x.have} / {x.need}</span>
                <span className="text-slate-400">다음 레벨까지 {x.left} XP</span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-slate-900 overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.round(levelProgress(myInsect.level, myInsect.xp) * 100)}%` }} />
              </div>
            </div>
          );
        })()}
      </div>

      {status && <PlayStatusCard status={status} />}

      {/* 내 필살기 안내 — 배틀 중에 버튼이 뜬다는 것을 미리 알려줘야 놓치지 않습니다. */}
      {myMove && (
        // Jin 10/1: 2배 이상 크게
        <div className="bg-slate-800 rounded-2xl px-5 py-5 border-2 border-amber-400/60" style={{ wordBreak: 'keep-all' }}>
          <p className="text-sm font-bold text-amber-300/90">⚡ 내 필살기</p>
          <p className={`mt-1 text-3xl font-black leading-tight ${myMove.textColor}`}>
            {myMove.emoji} {myMove.name}
          </p>
          <p className="text-base text-slate-200 mt-2">
            {myMove.description} <span className="text-slate-400">({myMove.kind === 'attack' ? '공격형' : '수비형'})</span>
          </p>
          <p className="text-sm text-amber-200/90 mt-3 leading-relaxed">
            배틀 중에 고리가 줄어드는 버튼이 떠.
            <b className="text-amber-300"> 고리가 가운데 동그라미랑 겹칠 때</b> 누르면 ✨퍼펙트! 위력이 확 세져.
            {myMove.kind === 'defense' && ' 수비형은 상대가 공격할 때 버튼이 떠!'}
          </p>
        </div>
      )}

      {/* 배틀 환경 고르기는 없앴습니다 (2026-09-30). 이제는 곤충의 **출신지**가 상성을 정합니다.
          같은 이름(운석충돌 등)이 "환경"과 "출신지" 두 뜻으로 쓰이면 헷갈립니다. */}
      <OriginInfo origin={myInsect.origin} />

      {/* 기본 방식: 랭킹 3위 → 2위 → 1위 사다리 */}
      <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3 border border-emerald-500/40">
        <div>
          <p className="font-bold text-emerald-300">🏆 랭킹 도전</p>
          <p className="text-xs text-slate-400 mt-1">
            3위 → 2위 → 1위 차례로 올라가기! 이기면 위로, 지면 한 번 더.
            기회는 <b className="text-slate-200">{LADDER_BATTLES}번</b>이야.
          </p>
        </div>

        {listLoading ? (
          <p className="text-sm text-slate-400">순위 불러오는 중...</p>
        ) : ladderTargets.length === 0 ? (
          <p className="text-sm text-slate-400">
            아직 상대할 다른 곤충이 없어. 친구가 곤충을 만들면 도전할 수 있어!
          </p>
        ) : (
          <>
            <ol className="flex flex-col gap-1.5">
              {ladderTargets.map((o, i) => (
                <li key={o.id} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 w-4 text-xs">{i + 1}</span>
                  <span className="w-7 text-center">{rankMedal(o.rank)}</span>
                  <span className="flex-1 truncate font-semibold">{o.nickname}</span>
                  <span className="text-xs text-slate-400 shrink-0">Lv.{o.level}</span>
                  <span className="text-xs text-emerald-400 shrink-0 w-14 text-right">
                    {o.bestScore > 0 ? `${o.bestScore}점` : '기록없음'}
                  </span>
                </li>
              ))}
            </ol>

            <button
              onClick={startLadder}
              disabled={starting || !status?.canLadder}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
            >
              {starting
                ? '상대를 데려오는 중...'
                : `⚔️ ${rankMedal(ladderTargets[0].rank)} ${ladderTargets[0].nickname}부터 도전!`}
            </button>
            {status && !status.canLadder && (
              <p className="text-xs text-amber-300 text-center" style={{ wordBreak: 'keep-all' }}>
                {blockedMessage(status)}
              </p>
            )}
          </>
        )}
      </div>

      {/* 랭커와 연습 게임 — 게임당 1판, 점수·경험치는 안 남습니다 (2026-10-01 Jin).
          예전에는 횟수 제한 없는 "친구랑 붙기"였는데, 그대로 두면 게임 횟수 제한을 피해 가는 구멍이 됩니다. */}
      {!showPicker ? (
        <button
          onClick={() => setShowPicker(true)}
          className="text-sm text-slate-300 underline self-center"
        >
          🎯 랭커와 연습 게임 (게임당 1판)
        </button>
      ) : (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-slate-400">누구랑 연습할까? (랭킹 순 · 기록 안 남음)</p>
          <button
            onClick={() => {
              const pool = filtered.length > 0 ? filtered : opponents;
              if (pool.length === 0) return;
              setPickedId(pool[Math.floor(Math.random() * pool.length)].id);
            }}
            className="text-xs bg-slate-800 px-3 py-1.5 rounded-full font-semibold"
          >
            🎲 아무나
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(20);
          }}
          placeholder="친구 이름으로 찾기"
          className="w-full bg-slate-800 rounded-xl px-4 py-3 text-sm mb-2"
        />

        {listLoading ? (
          <p className="text-center text-slate-400 py-6">상대를 불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-400 py-6 text-sm">
            {opponents.length === 0
              ? '아직 상대할 다른 곤충이 없어. 친구가 곤충을 만들면 여기에 나타나!'
              : '그 이름을 가진 친구를 못 찾았어.'}
          </p>
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {filtered.slice(0, visibleCount).map((o, i) => {
                const move = baseMoveFor(o.species);
                return (
                  <li key={o.id}>
                    <button
                      onClick={() => setPickedId(o.id)}
                      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left border-2 ${
                        pickedId === o.id
                          ? 'bg-sky-500/20 border-sky-500'
                          : 'bg-slate-800 border-transparent'
                      }`}
                    >
                      <span className="w-8 shrink-0 text-center font-bold text-amber-400">
                        {rankMedal(o.rank)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold truncate">{o.nickname}</span>
                        <span className="block text-xs text-slate-400 truncate">
                          Lv.{o.level} · {o.species || '곤충'} · {move.emoji}
                          {move.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-emerald-400">
                        {o.bestScore > 0 ? `${o.bestScore}점` : '기록없음'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {filtered.length > visibleCount && (
              <button
                onClick={() => setVisibleCount((v) => v + 20)}
                className="w-full mt-2 bg-slate-800 py-3 rounded-xl text-sm font-semibold"
              >
                더 보기 ({filtered.length - visibleCount}명 더)
              </button>
            )}
          </>
        )}

        <button
          onClick={() => picked && startPractice(picked)}
          disabled={!picked || starting || !status?.canPractice}
          className="w-full mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
        >
          {starting
            ? '상대를 데려오는 중...'
            : picked
              ? `🎯 ${picked.nickname}와(과) 연습 게임!`
              : '상대를 골라줘'}
        </button>
        {status && !status.canPractice && (
          <p className="mt-2 text-xs text-amber-300 text-center" style={{ wordBreak: 'keep-all' }}>
            이번 게임의 연습은 이미 했어. {blockedMessage(status)}
          </p>
        )}
      </div>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </main>
  );
}

/** 1~3위는 메달로, 그 아래는 숫자로 보여줍니다. */
function rankMedal(rank: number): string {
  return rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `${rank}위`;
}

function clampBar(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

interface FighterProps {
  insect: Insect;
  /** 그 아이의 몇 번째 곤충인지. 카드 등급 테두리를 입히는 데 씁니다. */
  visit: number;
  label: string;
  side: 'A' | 'B';
  attacking: boolean;
  hit: boolean;
  powered: boolean;
  powerColor: string;
  impact: ImpactFx | null;
  barPercent: number;
  barColor: string;
  crit: boolean;
}

function Fighter({
  insect,
  visit,
  label,
  side,
  attacking,
  hit,
  powered,
  powerColor,
  impact,
  barPercent,
  barColor,
  crit,
}: FighterProps) {
  // 내 곤충(위쪽)은 아래로, 상대(아래쪽)는 위로 달려들어야 서로 부딪히는 느낌이 납니다.
  const lunge = side === 'A' ? 'animate-lunge-down' : 'animate-lunge-up';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-full">
        {/* 카드와 같은 등급 테두리를 둘러, 금색·홀로그램 곤충이 배틀에서도 티가 납니다.
            ⚠️ 움직임(공격·피격)은 **테두리째** 걸어야 합니다. 그림에만 걸면 곤충만 액자 밖으로
            튀어나가 보입니다. 그래서 애니메이션 클래스를 테두리 쪽에 둡니다. */}
        <TierFrame
          visit={visit}
          width={3}
          className={`w-full ${
            hit ? 'animate-hit-flash' : attacking ? lunge : powered ? `animate-power-up ${powerColor}` : ''
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${insect.mime_type};base64,${insect.image_base64}`}
            alt={label}
            className="w-full max-h-[32vh] object-contain bg-slate-950"
          />
        </TierFrame>

        {/* 타격 순간 이펙트 */}
        {impact && (
          <div key={impact.id} className="absolute inset-0 pointer-events-none">
            <span
              className={`absolute left-1/2 top-1/2 w-24 h-24 rounded-full border-4 ${
                impact.crit ? 'border-amber-300' : 'border-white'
              } animate-impact-burst`}
            />
            <span
              className={`absolute left-1/2 top-1/2 h-2 w-3/4 rounded-full ${
                impact.crit ? 'bg-amber-300' : 'bg-white'
              } animate-slash-sweep`}
            />
            {/* 크리티컬은 ⚡ 로 남겨둡니다 — 보통 타격과 확실히 달라 보여야 합니다. */}
            {IMPACT_ART && !impact.crit ? (
              // key 를 때릴 때마다 바꿔서 기울기를 새로 뽑습니다.
              <span
                key={impact.id}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-impact-pop"
              >
                <FxImage art={IMPACT_ART} alt="콰쾅!" height={130} />
              </span>
            ) : (
              <span className="absolute left-1/2 top-1/2 text-7xl animate-impact-pop">
                {impact.crit ? '⚡' : '💥'}
              </span>
            )}
            <span
              className={`absolute left-1/2 top-[30%] text-4xl font-black animate-damage-float drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${
                impact.amount < 0 ? 'text-emerald-300' : impact.crit ? 'text-amber-300' : 'text-rose-300'
              }`}
            >
              {impact.amount < 0 ? `+${-impact.amount}` : `-${impact.amount}`}
            </span>
          </div>
        )}
      </div>

      <div className="w-full">
        <HpBar
          label={`${label}${crit ? ' ⚡크리티컬' : ''}`}
          percent={barPercent}
          color={barColor}
        />
      </div>
    </div>
  );
}

function HpBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1 text-sm">
        <span>{label}</span>
        <span className="font-bold">{percent}%</span>
      </div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-700 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** 준비 화면: 내 출신지가 누구에게 강하고 누구에게 약한지 */
function OriginInfo({ origin }: { origin: EnvironmentKey | null | undefined }) {
  const me = envOf(origin);
  if (!origin || !me) return null;
  const effect = ORIGIN_EFFECTS[origin];
  const beats = envOf(effect.beats);
  const loses = envOf(weakTo(origin));
  return (
    // Jin 10/1: 크게
    <div className="bg-slate-800 rounded-2xl px-5 py-4" style={{ wordBreak: 'keep-all' }}>
      <p className="text-sm font-bold text-slate-400">🗺️ 내 출신지</p>
      <p className="mt-1 text-2xl font-black">
        {me.emoji} {me.label}
      </p>
      {beats || loses ? (
        <div className="mt-2 flex flex-col gap-1 text-base font-semibold">
          {beats && (
            <p className="text-emerald-300">
              💪 {beats.emoji} {beats.label} 친구한테 강해!
            </p>
          )}
          {loses && (
            <p className="text-rose-300">
              😣 {loses.emoji} {loses.label} 친구는 조심해!
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-base text-slate-300">누구한테도 강하지도 약하지도 않아. 든든한 선택!</p>
      )}
    </div>
  );
}

