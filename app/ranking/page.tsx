'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { loadVisitMap } from '@/lib/visit-count';
import TierFrame from '@/app/card/tier-frame';
import { BrandMark } from '@/app/brand-logo';
import PlayStatusCard from '@/app/play-status';
import { isTestPlayer, loadTestPlayerIds, sameWorld } from '@/lib/test-world';
import { getCurrentPlayer } from '@/lib/session';
import { loadKidNames } from '@/lib/kid-names';
import { awardBadges, playStatus } from '@/lib/game-state';
import { EnvironmentKey, Player } from '@/lib/types';
import { baseMoveFor } from '@/lib/special-moves';
import { ORIGIN_EFFECTS } from '@/lib/origins';
import { ENVIRONMENTS } from '@/lib/environments';

interface RankRow {
  player_id: string;
  insect_id: string;
  nickname: string;
  /** 아이 닉네임 — 곤충 이름 아래에 작게 (10/4 Jin) */
  kid?: string;
  best_score: number;
}

/**
 * 그림을 보여줄 상위 등수 (2026-09-29, Jin 요청 "랭킹에 이미지가 작게 나오면 좋겠다").
 *
 * ⚠️ **20명 전부에 그림을 넣지 않은 이유 — 속도다.**
 * 곤충 그림 한 장이 약 0.47MB라, 20명이면 한 번 열 때 9.4MB를 받아야 한다.
 * 부스 와이파이에서 몇 초씩 하얀 화면이 뜨고, 아이는 고장난 줄 알고 뒤로가기를 누른다.
 * 랭킹은 아이들이 **제일 자주 반복해서** 여는 화면이라 이게 제일 치명적이다.
 * 3명이면 1.4MB로 끝나고, 시상대처럼 보여서 오히려 눈에 더 잘 들어온다.
 *
 * 20명 전부 보여주고 싶으면 이 숫자만 올리는 게 아니라 **작은 썸네일 컬럼을 따로 만들어야 한다**
 * (`insects` 에 컬럼 추가 = 마이그레이션 필요). 행사 끝난 뒤에 할 일이다.
 */
const PODIUM_COUNT = 3;

const MEDALS = ['🥇', '🥈', '🥉'];

/** TIP 을 계산할 때 볼 상위 등수 */
const TIP_TOP = 10;

interface RankTip {
  count: number;
  attackShare: number; // 공격형 필살기 곤충 비율 (0~1)
  topOrigin: EnvironmentKey | null;
  topOriginShare: number;
  avgLevel: number;
}

/**
 * 랭킹 아래 TIP (2026-10-01 Jin: "게임이 끝나면 랭킹 화면에서 설명을 볼 수 있게.
 * 지금 랭킹에 있는 곤충들은 이런 속성이 70% 이상이야! 반대 속성을 올리면 이길 수 있어!!").
 * **실제 랭킹 데이터로 계산한다** — 상위 곤충들의 필살기 형(공격/수비), 제일 많은 출신지, 평균 레벨.
 */
function buildTip(insects: { species: string | null; origin: EnvironmentKey | null; level: number | null }[]): RankTip | null {
  if (insects.length === 0) return null;
  const attack = insects.filter((x) => baseMoveFor(x.species).kind === 'attack').length;
  const origins = new Map<EnvironmentKey, number>();
  insects.forEach((x) => x.origin && origins.set(x.origin, (origins.get(x.origin) ?? 0) + 1));
  const [topOrigin, topCount] = Array.from(origins.entries()).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return {
    count: insects.length,
    attackShare: attack / insects.length,
    topOrigin,
    topOriginShare: topCount / insects.length,
    avgLevel: insects.reduce((sum, x) => sum + (x.level ?? 1), 0) / insects.length,
  };
}

export default function RankingPage() {
  const [tab, setTab] = useState<'today' | 'all'>('today');
  const [rows, setRows] = useState<RankRow[]>([]);
  // 상위 3명 곤충 그림 (insect_id → data URL). 아직 안 받아왔거나 그림이 없으면 비어 있습니다.
  const [podium, setPodium] = useState<Map<string, string>>(new Map());
  // 곤충 id → 그 아이의 몇 번째 곤충인지. 카드 등급 테두리를 입히는 데 씁니다.
  const [visits, setVisits] = useState<Map<string, number>>(new Map());
  const [levels, setLevels] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState<RankTip | null>(null);
  // 내 참가권·남은 게임·30분 대기 시계 (Jin 요청: "랭킹 옆에 본인 참여 가능 시간").
  const [me, setMe] = useState<Player | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // 🧪 누가 보는지(테스트 번호인지) 알아야 순위를 나눌 수 있어서, 확인이 끝난 뒤에 순위를 불러온다.
  const [meReady, setMeReady] = useState(false);

  useEffect(() => {
    getCurrentPlayer()
      .then(setMe)
      .catch(() => {})
      .finally(() => setMeReady(true));
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (meReady) loadRanking(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, meReady]);

  // 전체 랭킹 1~3위에 들면 그 뱃지를 영원히 남깁니다 (나중에 순위가 내려가도 "달성"은 남음).
  useEffect(() => {
    if (!me || tab !== 'all' || loading) return;
    const place = rows.findIndex((row) => row.player_id === me.id);
    if (place >= 0 && place < 3) void awardBadges(me.id, [`rank${place + 1}`]);
  }, [me, rows, tab, loading]);

  async function loadRanking(mode: 'today' | 'all') {
    setLoading(true);
    // 탭을 바꾸면 순위가 통째로 달라지므로, 앞 탭의 그림이 남아 엉뚱한 아이에게 붙지 않도록 비웁니다.
    setPodium(new Map());
    // battles 테이블은 insects를 insect_id(내 곤충), opponent_insect_id(상대 곤충) 두 방식으로 참조하므로
    // 어떤 외래키 관계를 쓸지 명시해야 합니다 (insect_id 기준으로 참여자 닉네임을 가져옴).
    let query = supabase
      .from('battles')
      .select('player_id, insect_id, score, insects!battles_insect_id_fkey(nickname), created_at')
      .order('score', { ascending: false })
      .limit(200);

    if (mode === 'today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfDay.toISOString());
    }

    // 🧪 테스트 번호(900번대)는 테스트 번호끼리만 순위를 매긴다 (lib/test-world.ts)
    const [{ data }, testIds] = await Promise.all([query, loadTestPlayerIds()]);
    const viewerIsTest = isTestPlayer(me);
    const best = new Map<string, RankRow>();
    (data || []).forEach((row: any) => {
      if (!sameWorld(row.player_id, testIds, viewerIsTest)) return;
      const nickname = row.insects?.nickname || '이름없음';
      const existing = best.get(row.player_id);
      if (!existing || row.score > existing.best_score) {
        best.set(row.player_id, {
          player_id: row.player_id,
          insect_id: row.insect_id,
          nickname,
          best_score: row.score,
        });
      }
    });

    const ranked = Array.from(best.values())
      .sort((a, b) => b.best_score - a.best_score)
      .slice(0, 20);
    const kids = await loadKidNames(ranked.map((r) => r.player_id));
    ranked.forEach((r) => (r.kid = kids.get(r.player_id) || ''));

    setRows(ranked);
    setLoading(false);

    // 그림은 **순위를 다 그린 뒤에** 따로 받아옵니다.
    // 같이 기다리면 그림 때문에 순위표 전체가 늦게 뜹니다. 이러면 그림이 나중에 스르륵 채워집니다.
    void loadPodiumImages(ranked.slice(0, PODIUM_COUNT));
    // 등급 테두리는 없어도 되는 장식이라 순위표를 먼저 그린 뒤 따로 받아옵니다.
    void loadVisitMap().then(setVisits);
    void loadTip(ranked.slice(0, TIP_TOP));
  }

  async function loadTip(top: RankRow[]) {
    const ids = top.map((row) => row.insect_id).filter(Boolean);
    if (ids.length === 0) {
      setTip(null);
      return;
    }
    // 그림은 빼고 필요한 칸만 (가볍게)
    const { data } = await supabase.from('insects').select('id, species, origin, level').in('id', ids);
    setTip(buildTip((data || []) as any));
    // 🆙 레벨 테두리용 (LV3 은 · LV5 금 · LV7 다이아)
    setLevels(new Map((data || []).map((r: any) => [r.id, r.level ?? 1])));
  }

  async function loadPodiumImages(top: RankRow[]) {
    const ids = top.map((row) => row.insect_id).filter(Boolean);
    if (ids.length === 0) return;

    const { data } = await supabase
      .from('insects')
      .select('id, image_base64, mime_type')
      .in('id', ids);

    const next = new Map<string, string>();
    (data || []).forEach((row: any) => {
      if (row.image_base64) {
        next.set(row.id, `data:${row.mime_type || 'image/jpeg'};base64,${row.image_base64}`);
      }
    });
    setPodium(next);
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-bold text-center"><BrandMark size={32} className="mr-2 -mt-1" />랭킹</h1>

      {me && <PlayStatusCard status={playStatus(me, now)} />}

      <div className="flex gap-2">
        <button
          onClick={() => setTab('today')}
          className={`flex-1 py-3 rounded-xl font-semibold ${
            tab === 'today' ? 'bg-amber-400 text-slate-900' : 'bg-slate-800'
          }`}
        >
          오늘의 랭킹
        </button>
        <button
          onClick={() => setTab('all')}
          className={`flex-1 py-3 rounded-xl font-semibold ${
            tab === 'all' ? 'bg-amber-400 text-slate-900' : 'bg-slate-800'
          }`}
        >
          전체 랭킹
        </button>
      </div>

      {loading ? (
        <p className="text-center text-slate-400">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-slate-400">아직 배틀 기록이 없어.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const onPodium = i < PODIUM_COUNT;
            const image = podium.get(row.insect_id);

            // 4위부터는 지금까지처럼 이름 + 점수만 (가볍게).
            if (!onPodium) {
              return (
                <li
                  key={row.player_id}
                  className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3"
                >
                  <span className="font-bold min-w-0 flex-1 truncate">
                    {i + 1}. 🐞 {row.nickname}
                    {me?.id === row.player_id && <span className="ml-1 text-xs text-emerald-300">(나)</span>}
                    {row.kid && <span className="block pl-5 text-xs font-normal text-slate-400 truncate">👦 {row.kid}</span>}
                  </span>
                  <span className="text-emerald-400 font-bold">{row.best_score}점</span>
                </li>
              );
            }

            return (
              <li
                key={row.player_id}
                className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3 ring-1 ring-amber-400/40"
              >
                {/* 그림은 나중에 도착하므로, 그 전에는 같은 크기의 빈 자리를 둡니다.
                    자리를 안 잡아두면 그림이 뜰 때 줄이 통째로 밀려서 보기 안 좋습니다. */}
                {/* 카드와 같은 등급 테두리를 둘러, 금색 아이는 랭킹에서도 금색으로 보입니다. */}
                <span className="relative shrink-0">
                <TierFrame visit={visits.get(row.insect_id) ?? 1} level={levels.get(row.insect_id)} round width={2} className="shrink-0">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={row.nickname} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">🐛</span>
                    )}
                  </div>
                </TierFrame>
                {/* 메달은 그림 모서리에 얹는다 — 폰(360px)에서 이름 칸을 넓게 쓰려고 (10/4) */}
                <span className="absolute -left-1.5 -top-1.5 text-2xl leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{MEDALS[i]}</span>
                </span>

                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">🐞 {row.nickname}</span>
                  {row.kid && <span className="block text-xs text-slate-400 truncate">👦 {row.kid}</span>}
                </span>

                <span className="text-emerald-400 font-bold shrink-0">{row.best_score}점</span>
              </li>
            );
          })}
        </ol>
      )}

      {/* TIP — 오늘의 랭킹·전체 랭킹 어느 쪽이든 아래에 보인다 */}
      {!loading && tip && <TipBox tip={tip} />}
      {/* 💡 1~5위 능력치를 자세히 + 내 곤충은 무엇을 올리면 되는지 (10/4 Jin) */}
      <Link href="/tips" className="text-center bg-sky-400 text-slate-900 font-black py-4 rounded-2xl text-lg" style={{ wordBreak: 'keep-all' }}>
        💡 승리 팁 보기 <span className="block text-sm font-bold">1~5위 능력치 · 나는 뭘 올리면 이겨?</span>
      </Link>
    </main>
  );
}

function TipBox({ tip }: { tip: RankTip }) {
  const pct = (n: number) => Math.round(n * 100);
  const attackMost = tip.attackShare >= 0.5;
  const share = attackMost ? tip.attackShare : 1 - tip.attackShare;
  const origin = ENVIRONMENTS.find((e) => e.key === tip.topOrigin);
  // 제일 많은 출신지를 이기는 출신지 (상성)
  const counterKey = tip.topOrigin
    ? (Object.keys(ORIGIN_EFFECTS) as EnvironmentKey[]).find((k) => ORIGIN_EFFECTS[k].beats === tip.topOrigin)
    : undefined;
  const counter = ENVIRONMENTS.find((e) => e.key === counterKey);
  return (
    <section className="bg-sky-500/10 border-2 border-sky-400/50 rounded-2xl p-4 flex flex-col gap-2" style={{ wordBreak: 'keep-all' }}>
      <p className="text-lg font-black text-sky-300">💡 TIP!</p>
      <p className="text-base leading-relaxed">
        지금 랭킹 TOP{tip.count} 곤충들은{' '}
        <b className={attackMost ? 'text-rose-300' : 'text-sky-300'}>
          {attackMost ? '⚔️ 공격형' : '🛡️ 수비형'} 필살기가 {pct(share)}%
        </b>
        야!{' '}
        {attackMost ? (
          <>
            레벨업을 해서 반대 속성인 <b className="text-sky-300">🛡️ 수비력</b>을 올리면 막아내고 이길 수 있어!!
          </>
        ) : (
          <>
            레벨업을 해서 반대 속성인 <b className="text-rose-300">⚔️ 공격력</b>을 올리면 뚫고 이길 수 있어!!
          </>
        )}
      </p>
      {origin && counter && tip.topOriginShare >= 0.4 && (
        <p className="text-base leading-relaxed">
          그리고 {pct(tip.topOriginShare)}%가 <b>{origin.emoji} {origin.label}</b> 출신이야.{' '}
          <b className="text-emerald-300">{counter.emoji} {counter.label}</b> 곤충이 상성으로 더 세! (새 곤충 만들 때 골라봐)
        </p>
      )}
      <p className="text-sm text-slate-300">
        랭킹 곤충 평균 <b>LV.{tip.avgLevel.toFixed(1)}</b> — 레벨이 낮으면 🔥역전 찬스로 크리티컬이 더 잘 터져!
      </p>
      <p className="text-base font-black text-amber-300">⏳ 30분 뒤에 또 해보자!!</p>
    </section>
  );
}
