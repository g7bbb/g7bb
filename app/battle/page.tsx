'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentPlayer } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import { ENVIRONMENTS } from '@/lib/environments';
import { BattleResult, SideRoll, resolveBattle, rollBattle } from '@/lib/battle-engine';
import { levelFromXp, xpGainForBattle } from '@/lib/insect-stats';
import { SpecialMove, specialMoveFor } from '@/lib/special-moves';
import { CoreStats, EnvironmentKey, Insect, Player } from '@/lib/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 필살기 버튼이 떠 있는 시간. 부스에서 어린 친구들도 누를 수 있도록 넉넉하게 둡니다.
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
}

export default function BattlePage() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [myInsect, setMyInsect] = useState<Insect | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [env, setEnv] = useState<EnvironmentKey>('meteor');

  // ─── 상대 고르기 ───
  const [opponents, setOpponents] = useState<OpponentSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // ─── 랭킹 도전 ───
  const [ladder, setLadder] = useState<LadderState | null>(null);

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
  const [chanceLeft, setChanceLeft] = useState(0);
  const [usedSpecial, setUsedSpecial] = useState(false);

  // 버튼을 눌렀는지 연출 루프 안에서 확인해야 해서 ref 로 둡니다.
  const specialRequested = useRef(false);
  const fxCounter = useRef(0);

  const myMove = myInsect ? specialMoveFor(myInsect.stats) : null;

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
    await sleep(170);

    setHitSide(target);
    setImpact({ id: nextFxId(), side: target, amount, crit });
    setShaking(true);
    if (target === 'A') setBarA((v) => clampBar(v - amount));
    else setBarB((v) => clampBar(v - amount));

    await sleep(430);
    setAttackSide(null);
    setHitSide(null);
    setShaking(false);
    await sleep(160);
  }

  /** 필살기 연출: 화면이 하얗게 번쩍이고 기술 이름이 크게 뜹니다. */
  async function playSpecial(side: 'A' | 'B', move: SpecialMove) {
    setSpecialFx({ id: nextFxId(), side, move });
    setShaking(true);
    await sleep(500);
    setShaking(false);
    await sleep(1000);
    setSpecialFx(null);
    await sleep(150);
  }

  /** 필살기 버튼이 떠 있는 동안 기다립니다. 누르면 즉시 true. */
  async function waitForChance(): Promise<boolean> {
    specialRequested.current = false;
    const start = Date.now();
    setChanceLeft(CHANCE_MS);

    while (Date.now() - start < CHANCE_MS) {
      if (specialRequested.current) {
        setChanceLeft(0);
        return true;
      }
      await sleep(70);
      setChanceLeft(Math.max(0, CHANCE_MS - (Date.now() - start)));
    }
    setChanceLeft(0);
    return false;
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
      if (!data) throw new Error('상대 곤충을 찾지 못했어요. 목록을 새로고침해 주세요.');

      const foe = data as Insect;
      setOpponent(foe);
      await runFight(foe);
    } catch (err: any) {
      setError(err.message || '배틀을 시작하지 못했어요.');
      setPhase(null);
    } finally {
      setStarting(false);
    }
  }

  async function runFight(foe: Insect) {
    if (!player || !myInsect) return;

    const mine = specialMoveFor(myInsect.stats);
    const theirs = specialMoveFor(foe.stats);

    // 운·크리티컬은 배틀 시작 때 한 번만 굴려둡니다.
    // 필살기 선택 뒤에 다시 굴리면 "필살기를 썼는데 더 나빠졌다"가 생길 수 있기 때문입니다.
    const rolls: { a: SideRoll; b: SideRoll } = rollBattle(
      myInsect.stats,
      myInsect.level,
      foe.stats,
      foe.level,
      env
    );

    // 화면 초기화
    setBattle(null);
    setUsedSpecial(false);
    setBarA(100);
    setBarB(100);
    setImpact(null);
    setSpecialFx(null);

    setPhase('intro');
    await sleep(1100);

    // 1라운드 — 탐색전
    setPhase('round');
    await exchange('A', PROBE_DAMAGE_B, false);
    await exchange('B', PROBE_DAMAGE_A, false);

    // 필살기 기회 (배틀당 한 번)
    setPhase('chance');
    const useMine = await waitForChance();
    setUsedSpecial(useMine);

    // 상대는 자기 필살기를 항상 씁니다. (안 그러면 내가 쓰기만 하면 무조건 이김)
    const final = resolveBattle(rolls.a, rolls.b, useMine ? mine.key : null, theirs.key);

    // 기록 저장은 연출이 도는 동안 뒤에서 진행합니다.
    const savePromise = saveResult(foe, final);

    setPhase('final');
    if (useMine) await playSpecial('A', mine);
    await playSpecial('B', theirs);

    // 마지막 공방 — 남은 차이만큼 한 번에 반영합니다.
    const winner = final.winner === 'B' ? 'B' : 'A';
    const loser = winner === 'A' ? 'B' : 'A';
    const currentA = clampBar(100 - PROBE_DAMAGE_A);
    const currentB = clampBar(100 - PROBE_DAMAGE_B);
    const deltaLoser =
      loser === 'A' ? currentA - final.survivalPercentA : currentB - final.survivalPercentB;

    setAttackSide(winner);
    await sleep(200);
    setHitSide(loser);
    setImpact({
      id: nextFxId(),
      side: loser,
      amount: Math.max(1, deltaLoser),
      crit: winner === 'A' ? final.a.crit : final.b.crit,
    });
    setShaking(true);
    setBarA(final.survivalPercentA);
    setBarB(final.survivalPercentB);
    await sleep(750);
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

    const won = final.winner === 'A';
    const gained = xpGainForBattle(won, myInsect.age_stage);
    const newXp = myInsect.xp + gained;
    const newLevel = levelFromXp(newXp);
    const didLevelUp = newLevel > myInsect.level;

    try {
      await supabase.from('battles').insert({
        player_id: player.id,
        insect_id: myInsect.id,
        opponent_insect_id: foe.id,
        environment: env,
        score: final.a.score,
        result: final.winner === 'A' ? 'win' : final.winner === 'B' ? 'lose' : 'draw',
      });
      await supabase
        .from('insects')
        .update({ xp: newXp, level: newLevel, battle_count: myInsect.battle_count + 1 })
        .eq('id', myInsect.id);
      setMyInsect({ ...myInsect, xp: newXp, level: newLevel, battle_count: myInsect.battle_count + 1 });
    } catch {
      // 기록 저장이 실패해도 연출과 결과는 그대로 보여줍니다. (부스에서 흐름이 끊기지 않도록)
    }

    return { xpGained: gained, leveledUp: didLevelUp };
  }

  // 랭킹 도전 시작: 지금 순위표의 위쪽 3명을 뽑아 **고정**합니다.
  // 도중에 다른 아이가 점수를 올려 순위가 바뀌어도 사다리는 흔들리지 않습니다.
  function startLadder() {
    if (opponents.length === 0) return;
    // 상위 3명을 낮은 순위부터(3위 → 2위 → 1위) 도전하도록 뒤집습니다.
    // 상대가 3명보다 적으면 있는 만큼만 도전합니다. (행사 초반에는 참가자가 몇 명 없습니다.)
    const targets = opponents.slice(0, LADDER_SIZE).reverse();
    const run: LadderState = { targets, index: 0, used: 0, log: [] };
    setLadder(run);
    startBattle(targets[0]);
  }

  function nextLadderBattle() {
    if (!ladder || ladderFinished(ladder)) return;
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
        <p>아직 만든 곤충이 없어요.</p>
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
              <p className={`text-5xl font-black ${specialFx.move.textColor} animate-special-name drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]`}>
                {specialFx.move.emoji}
              </p>
              <p className={`mt-2 text-3xl font-black ${specialFx.move.textColor} animate-special-name drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]`}>
                {specialFx.move.name}
              </p>
              <p className="mt-1 text-sm font-bold text-white animate-special-name">
                {specialFx.side === 'A' ? '내 곤충의 필살기!' : '상대의 필살기!'}
              </p>
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
            <p className="text-5xl font-black italic text-amber-400 animate-vs-slam">VS</p>
          ) : (
            <p className="text-2xl font-black italic text-amber-400/70">VS</p>
          )}
        </div>

        <Fighter
          insect={opponent}
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

        {/* 필살기 버튼 — 배틀당 딱 한 번 */}
        {phase === 'chance' && myMove && (
          <button
            onClick={() => {
              specialRequested.current = true;
            }}
            className="mt-2 w-full bg-amber-400 text-slate-900 font-black py-5 rounded-2xl text-xl animate-chance-pulse"
          >
            {myMove.emoji} 필살기 · {myMove.name}
            <span className="block mt-1 h-1.5 bg-slate-900/25 rounded-full overflow-hidden">
              <span
                className="block h-full bg-slate-900 transition-[width] duration-75 ease-linear"
                style={{ width: `${(chanceLeft / CHANCE_MS) * 100}%` }}
              />
            </span>
            <span className="block text-xs font-bold mt-1">지금 눌러!</span>
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
                  ? '💀 내 곤충이 버티지 못했어요'
                  : '🤝 무승부'}
            </p>
            <p className="text-sm text-emerald-400">
              +{xpGained} XP{leveledUp ? ' · 🆙 레벨업!' : ''}
            </p>
            {!usedSpecial && myMove && (
              <p className="text-xs text-amber-300">
                이번엔 필살기({myMove.name})를 못 썼어요. 다음엔 ⚡버튼이 뜨면 바로 눌러봐!
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
                  {ladder ? '처음부터 다시' : '다른 상대와 배틀'}
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

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold text-center">⚔️ 곤충 배틀</h1>

      <div className="bg-slate-800 rounded-xl px-4 py-3 flex justify-between text-sm">
        <span>내 곤충 Lv.{myInsect.level}</span>
        <span className="text-slate-400">XP {myInsect.xp} · 배틀 {myInsect.battle_count}회</span>
      </div>

      {/* 내 필살기 안내 — 배틀 중에 버튼이 뜬다는 것을 미리 알려줘야 놓치지 않습니다. */}
      {myMove && (
        <div className="bg-slate-800 rounded-2xl px-4 py-3 border border-amber-400/40">
          <p className="text-sm font-bold text-amber-300">
            {myMove.emoji} 내 필살기 · {myMove.name}
          </p>
          <p className="text-xs text-slate-400 mt-1">{myMove.description}</p>
          <p className="text-xs text-amber-200/80 mt-2">
            배틀 중에 ⚡버튼이 딱 한 번 뜨는데, 그때 바로 누르면 발동돼!
          </p>
        </div>
      )}

      <div>
        <p className="text-sm text-slate-400 mb-2">어떤 환경에서 배틀할까요?</p>
        <div className="grid grid-cols-3 gap-2">
          {ENVIRONMENTS.map((e) => (
            <button
              key={e.key}
              onClick={() => setEnv(e.key)}
              className={`rounded-xl py-3 text-sm font-semibold ${
                env === e.key ? 'bg-sky-500 text-slate-900' : 'bg-slate-800 text-slate-200'
              }`}
            >
              {e.emoji} {e.label}
            </button>
          ))}
        </div>
      </div>

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
            아직 상대할 다른 곤충이 없어요. 친구가 곤충을 만들면 도전할 수 있어!
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
              disabled={starting}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
            >
              {starting
                ? '상대를 데려오는 중...'
                : `⚔️ ${rankMedal(ladderTargets[0].rank)} ${ladderTargets[0].nickname}부터 도전!`}
            </button>
          </>
        )}
      </div>

      {/* 친구를 지정해서 붙고 싶을 때. 랭킹 도전과 달리 횟수 제한이 없습니다. */}
      {!showPicker ? (
        <button
          onClick={() => setShowPicker(true)}
          className="text-sm text-slate-400 underline self-center"
        >
          친구를 직접 골라서 붙기
        </button>
      ) : (
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-slate-400">누구랑 붙을까요? (랭킹 순)</p>
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
              ? '아직 상대할 다른 곤충이 없어요. 친구가 곤충을 만들면 여기에 나타나요!'
              : '그 이름을 가진 친구를 찾지 못했어요.'}
          </p>
        ) : (
          <>
            <ol className="flex flex-col gap-2">
              {filtered.slice(0, visibleCount).map((o, i) => {
                const move = specialMoveFor(o.stats);
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
          onClick={() => picked && startBattle(picked)}
          disabled={!picked || starting}
          className="w-full mt-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
        >
          {starting
            ? '상대를 데려오는 중...'
            : picked
              ? `⚔️ ${picked.nickname}와(과) 배틀!`
              : '상대를 골라주세요'}
        </button>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:${insect.mime_type};base64,${insect.image_base64}`}
          alt={label}
          className={`w-full max-h-[32vh] object-contain rounded-2xl bg-slate-950 ${
            hit ? 'animate-hit-flash' : attacking ? lunge : powered ? `animate-power-up ${powerColor}` : ''
          }`}
        />

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
            <span className="absolute left-1/2 top-1/2 text-6xl animate-impact-pop">
              {impact.crit ? '⚡' : '💥'}
            </span>
            <span
              className={`absolute left-1/2 top-[30%] text-3xl font-black animate-damage-float drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${
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
