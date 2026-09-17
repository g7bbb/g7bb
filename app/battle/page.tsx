'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentPlayer } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import { Player } from '@/lib/types';
import { ENVIRONMENTS } from '@/lib/environments';
import { calculateBattle, BattleResult } from '@/lib/battle-engine';
import { levelFromXp, xpGainForBattle } from '@/lib/insect-stats';
import { EnvironmentKey, Insect } from '@/lib/types';

interface ResultState {
  opponent: Insect;
  battle: BattleResult;
  xpGained: number;
  leveledUp: boolean;
}

export default function BattlePage() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [myInsect, setMyInsect] = useState<Insect | null>(null);
  const [env, setEnv] = useState<EnvironmentKey>('meteor');
  const [loading, setLoading] = useState(true);
  const [battling, setBattling] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ResultState | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hitSide, setHitSide] = useState<'A' | 'B' | null>(null);
  const [barA, setBarA] = useState(100);
  const [barB, setBarB] = useState(100);

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

  // 공격을 주고받는 것처럼 보이도록, 최종 결과를 바로 보여주지 않고 몇 차례 "타격" 연출을 재생한 뒤 결과를 공개합니다.
  async function playHitSequence(finalA: number, finalB: number) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const rounds = 2;

    setRevealed(false);
    setHitSide(null);
    setBarA(100);
    setBarB(100);
    await sleep(400);

    for (let i = 1; i <= rounds; i++) {
      const stepB = Math.round(100 - ((100 - finalB) * i) / rounds);
      setHitSide('B');
      setBarB(stepB);
      await sleep(320);
      setHitSide(null);
      await sleep(220);

      const stepA = Math.round(100 - ((100 - finalA) * i) / rounds);
      setHitSide('A');
      setBarA(stepA);
      await sleep(320);
      setHitSide(null);
      await sleep(220);
    }

    setBarA(finalA);
    setBarB(finalB);
    setRevealed(true);
  }

  async function handleBattle() {
    if (!player || !myInsect) return;
    setBattling(true);
    setError('');
    setResult(null);
    try {
      const { data: opponents, error: oppError } = await supabase
        .from('insects')
        .select('*')
        .neq('player_id', player.id)
        .limit(50);

      if (oppError) throw oppError;
      if (!opponents || opponents.length === 0) {
        setError('아직 상대할 다른 곤충이 없어요. 다른 친구가 곤충을 만들면 다시 시도해보세요!');
        return;
      }

      const opponent = opponents[Math.floor(Math.random() * opponents.length)] as Insect;
      const battle = calculateBattle(myInsect.stats, myInsect.level, opponent.stats, opponent.level, env);
      const won = battle.winner === 'A';
      const xpGained = xpGainForBattle(won, myInsect.age_stage);
      const newXp = myInsect.xp + xpGained;
      const newLevel = levelFromXp(newXp);
      const leveledUp = newLevel > myInsect.level;

      const { error: insertError } = await supabase.from('battles').insert({
        player_id: player.id,
        insect_id: myInsect.id,
        opponent_insect_id: opponent.id,
        environment: env,
        score: battle.a.score,
        result: battle.winner === 'A' ? 'win' : battle.winner === 'B' ? 'lose' : 'draw',
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('insects')
        .update({ xp: newXp, level: newLevel, battle_count: myInsect.battle_count + 1 })
        .eq('id', myInsect.id);
      if (updateError) throw updateError;

      setMyInsect({ ...myInsect, xp: newXp, level: newLevel, battle_count: myInsect.battle_count + 1 });
      setResult({ opponent, battle, xpGained, leveledUp });
      await playHitSequence(battle.survivalPercentA, battle.survivalPercentB);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBattling(false);
    }
  }

  function resetBattle() {
    setResult(null);
    setRevealed(false);
    setHitSide(null);
    setBarA(100);
    setBarB(100);
  }

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

  // 배틀이 시작되면(결과가 생기면) 다른 화면 요소 없이 곤충 이미지들만 보이는 전용 화면으로 전환합니다.
  if (result) {
    return (
      <main className="max-w-md mx-auto min-h-screen flex flex-col gap-3 px-4 py-6">
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${myInsect.mime_type};base64,${myInsect.image_base64}`}
            alt="내 곤충"
            className={`w-full max-h-[38vh] object-contain rounded-2xl bg-slate-950 transition-all duration-150 ${
              hitSide === 'A' ? 'brightness-50 animate-shake' : ''
            }`}
          />
          <div className="w-full">
            <HpBar label={`내 곤충${revealed && result.battle.a.crit ? ' ⚡크리티컬' : ''}`} percent={barA} color="bg-emerald-400" />
          </div>
        </div>

        <div className="text-center text-3xl font-black italic text-amber-400">VS</div>

        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${result.opponent.mime_type};base64,${result.opponent.image_base64}`}
            alt="상대 곤충"
            className={`w-full max-h-[38vh] object-contain rounded-2xl bg-slate-950 transition-all duration-150 ${
              hitSide === 'B' ? 'brightness-50 animate-shake' : ''
            }`}
          />
          <div className="w-full">
            <HpBar label={`상대 곤충${revealed && result.battle.b.crit ? ' ⚡크리티컬' : ''}`} percent={barB} color="bg-rose-400" />
          </div>
        </div>

        {revealed && (
          <div className="flex flex-col gap-3 bg-slate-800 rounded-2xl p-4 text-center animate-pop mt-2">
            {(result.battle.a.crit || result.battle.b.crit) && (
              <p className="text-2xl font-black text-amber-400">💥 크리티컬!</p>
            )}
            <p className="text-lg font-bold">
              {result.battle.winner === 'A'
                ? '🎉 내 곤충 생존 성공!'
                : result.battle.winner === 'B'
                ? '💀 내 곤충이 버티지 못했어요'
                : '🤝 무승부'}
            </p>
            <p className="text-sm text-emerald-400">
              +{result.xpGained} XP{result.leveledUp ? ' · 🆙 레벨업!' : ''}
            </p>
            <div className="flex gap-2">
              <button
                onClick={resetBattle}
                className="flex-1 bg-sky-500 text-slate-900 font-bold py-3 rounded-xl"
              >
                다시 배틀하기
              </button>
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

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold text-center">⚔️ 곤충 배틀</h1>

      <div className="bg-slate-800 rounded-xl px-4 py-3 flex justify-between text-sm">
        <span>내 곤충 Lv.{myInsect.level}</span>
        <span className="text-slate-400">XP {myInsect.xp} · 배틀 {myInsect.battle_count}회</span>
      </div>

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

      <button
        onClick={handleBattle}
        disabled={battling}
        className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
      >
        {battling ? '배틀 중...' : '랜덤 상대와 배틀하기'}
      </button>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </main>
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
