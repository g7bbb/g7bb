'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentPlayer } from '@/lib/session';
import { Player } from '@/lib/types';
import { BADGES, BadgeDef, earnedBadges } from '@/lib/badges';
import { awardBadges, readGameState } from '@/lib/game-state';
import { tierForPlayer } from '@/lib/tiers';
import { findSpecies } from '@/lib/species';
import { hasAnyMutation } from '@/lib/mutations';
import { BrandMark } from '@/app/brand-logo';

// 내 뱃지 모음 (2026-10-01 Jin). 카드·종이의 QR 로 들어오면 바로 볼 수 있다.
// 뱃지 규칙은 lib/badges.ts.

/**
 * 대전 뱃지에 넣을 꿈돌이 그림 자리.
 * ⚠️ 꿈돌이는 대전시가 권리를 가진 캐릭터라 **공식 그림 파일을 받아서** 이 경로에 넣는다.
 * 파일이 없으면 🎡 로 대신 보인다 (그림이 깨져 보이지 않게).
 */
const DAEJEON_LOGO = '/badges/kkumdori.png';

export default function BadgesPage() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [earned, setEarned] = useState<Set<string> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const p = await getCurrentPlayer();
      if (!p) {
        router.push('/start');
        return;
      }
      setPlayer(p);

      const { data: insects } = await supabase
        .from('insects')
        .select('id, species, mutations, level, judge_rank')
        .eq('player_id', p.id);
      const ids = (insects || []).map((row: any) => row.id);

      const [{ count: battles }, { count: wins }, { count: hearts }, { data: scores }] = await Promise.all([
        supabase.from('battles').select('id', { count: 'exact', head: true }).eq('player_id', p.id),
        supabase.from('battles').select('id', { count: 'exact', head: true }).eq('player_id', p.id).eq('result', 'win'),
        ids.length
          ? supabase.from('hearts').select('insect_id', { count: 'exact', head: true }).in('insect_id', ids)
          : Promise.resolve({ count: 0 } as any),
        supabase.from('battles').select('player_id, score').order('score', { ascending: false }).limit(1000),
      ]);

      // 전체 랭킹 1~3위면 그 자리에서 뱃지를 남깁니다 (랭킹 화면과 같은 방식: 아이별 최고 점수).
      const order: string[] = [];
      (scores || []).forEach((row: any) => {
        if (!order.includes(row.player_id)) order.push(row.player_id);
      });
      const place = order.indexOf(p.id);
      const state = readGameState(p);
      if (place >= 0 && place < 3) {
        const key = `rank${place + 1}`;
        void awardBadges(p.id, [key]);
        state.badges[key] = state.badges[key] ?? new Date().toISOString();
      }

      setEarned(
        earnedBadges({
          insectCount: ids.length,
          sessions: state.sessions.length,
          battles: battles ?? 0,
          wins: wins ?? 0,
          maxLevel: Math.max(0, ...(insects || []).map((row: any) => row.level ?? 1)),
          hearts: hearts ?? 0,
          judged: (insects || []).some((row: any) => row.judge_rank),
          evolved: (insects || []).some((row: any) => row.mutations && hasAnyMutation(row.mutations, row.species)),
          mySpecies: (insects || []).some((row: any) => row.species && !findSpecies(row.species)),
          tierKey: tierForPlayer(p).key,
          stored: state.badges,
        })
      );
    })().catch((err) => setError(err?.message || '뱃지를 불러오지 못했어요.'));
  }, [router]);

  const total = BADGES.length;
  const got = earned ? BADGES.filter((b) => earned.has(b.key)).length : 0;

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-5 px-5 py-8">
      <h1 className="text-2xl font-bold text-center">
        <BrandMark size={32} className="mr-2 -mt-1" />내 뱃지
      </h1>

      {player && (
        <p className="text-center text-sm text-slate-400">
          <b className="text-slate-200">{player.display_name}</b> ({player.ticket_code})
        </p>
      )}

      {!earned && !error && <p className="text-center text-slate-400">뱃지를 모으는 중...</p>}
      {error && <p className="text-center text-red-400 text-sm">{error}</p>}

      {earned && (
        <>
          <div className="bg-slate-800 rounded-2xl p-4 text-center">
            <p className="text-3xl font-black">
              🏅 <span className="text-amber-300">{got}</span>
              <span className="text-slate-500 text-xl"> / {total}</span>
            </p>
            <div className="mt-2 h-2 rounded-full bg-slate-900 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(got / total) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-300" style={{ wordBreak: 'keep-all' }}>
              뱃지를 모을수록 재미있고 멋진 선물을 받을 수 있어!!
            </p>
          </div>

          {/* 행사 뱃지는 따로 크게 — 이번 행사에 온 아이 모두가 받는 첫 뱃지 */}
          <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-4" style={{ wordBreak: 'keep-all' }}>
            <DaejeonEmblem earned={earned.has('daejeon')} size={96} />
            <div>
              <p className="text-xs text-amber-300 font-bold">🎉 행사 기념 뱃지</p>
              <p className="text-lg font-black leading-tight">2026 대전 곤충축제</p>
              <p className="text-xs text-slate-400 mt-1">G7BB 배틀 시즌1에 참여한 친구만 받을 수 있어!</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {BADGES.map((badge) => (
              <BadgeTile key={badge.key} badge={badge} earned={earned.has(badge.key)} />
            ))}
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button onClick={() => router.push('/card')} className="flex-1 bg-slate-800 font-semibold py-3 rounded-xl">
          🃏 내 카드
        </button>
        <button onClick={() => router.push('/battle')} className="flex-1 bg-emerald-500 text-slate-900 font-bold py-3 rounded-xl">
          ⚔️ 배틀
        </button>
      </div>
    </main>
  );
}

function BadgeTile({ badge, earned }: { badge: BadgeDef; earned: boolean }) {
  return (
    <div
      className={`rounded-2xl p-2 flex flex-col items-center text-center gap-1 ${
        earned ? 'bg-slate-800 ring-2 ring-amber-400/60' : 'bg-slate-900 opacity-60'
      }`}
      style={{ wordBreak: 'keep-all' }}
    >
      {badge.special === 'daejeon' ? (
        <DaejeonBadge earned={earned} />
      ) : (
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl ${
            earned ? 'bg-gradient-to-br from-amber-300 to-amber-600 shadow-lg' : 'bg-slate-800 grayscale'
          }`}
        >
          {earned ? badge.emoji : '🔒'}
        </div>
      )}
      <p className={`text-[11px] font-bold leading-tight ${earned ? 'text-slate-100' : 'text-slate-400'}`}>
        {badge.name}
      </p>
      {!earned && <p className="text-[9px] text-slate-500 leading-tight">{badge.how}</p>}
    </div>
  );
}

/**
 * 대전 행사 뱃지 — 우리 곤충본부 마스코트 + 엑스포 느낌(궤도 고리·별) + "대전" 글씨.
 *
 * 2026-10-01 Jin: 꿈돌이를 넣을지 정하기 전에 "꿈돌이 없는 우리 디자인"을 먼저 보기로 했다.
 * 꿈돌이는 대전시 캐릭터라 쓰려면 허락이 필요하다. `public/badges/kkumdori.png` 를 넣으면
 * 가운데 마스코트 자리가 그 그림으로 바뀐다 (없으면 우리 마스코트).
 */
function DaejeonEmblem({ earned, size }: { earned: boolean; size: number }) {
  const [hasLogo, setHasLogo] = useState(true);
  const u = size / 100; // 100 기준으로 그린 뒤 크기만 맞춘다
  return (
    <div
      className={`relative rounded-full shrink-0 ${earned ? '' : 'grayscale opacity-70'}`}
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 35% 30%, #3b5bdb, #1e2a78 55%, #0b1033)',
        boxShadow: earned ? `0 0 0 ${3 * u}px #fcd34d, 0 0 0 ${5 * u}px #b45309, 0 0 ${18 * u}px rgba(252,211,77,0.45)` : `0 0 0 ${3 * u}px #475569`,
      }}
    >
      {/* 궤도 고리 — 엑스포 느낌 */}
      <div
        className="absolute rounded-[50%] border-amber-300"
        style={{ left: 8 * u, right: 8 * u, top: 34 * u, height: 26 * u, borderWidth: 2 * u, transform: 'rotate(-18deg)' }}
      />
      {/* 별 */}
      {[
        [18, 20, 9],
        [76, 16, 7],
        [82, 62, 6],
      ].map(([x, y, s], k) => (
        <span key={k} className="absolute text-amber-200 leading-none" style={{ left: x * u, top: y * u, fontSize: s * u }}>
          ✦
        </span>
      ))}
      {/* 가운데 마스코트 */}
      <div className="absolute flex justify-center" style={{ left: 0, right: 0, top: 14 * u }}>
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={DAEJEON_LOGO}
            alt="꿈돌이"
            style={{ height: 46 * u, width: 'auto' }}
            onError={() => setHasLogo(false)}
          />
        ) : (
          <BrandMark size={46 * u} />
        )}
      </div>
      {/* 대전 글씨 */}
      <div
        className="absolute left-0 right-0 text-center font-black text-white leading-none"
        // Jin (2026-10-01): "대전 글씨가 좀 더 두꺼워서 잘 보였으면" → 크게 + 진한 남색 외곽선
        style={{
          top: 62 * u,
          fontSize: 25 * u,
          fontWeight: 900,
          WebkitTextStroke: `${2.4 * u}px #0b1033`,
          paintOrder: 'stroke fill',
          textShadow: `0 ${1.5 * u}px ${4 * u}px rgba(0,0,0,0.9)`,
          letterSpacing: 1 * u,
        }}
      >
        대전
      </div>
    </div>
  );
}

function DaejeonBadge({ earned }: { earned: boolean }) {
  return <DaejeonEmblem earned={earned} size={56} />;
}
