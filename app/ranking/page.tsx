'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface RankRow {
  player_id: string;
  insect_id: string;
  nickname: string;
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

export default function RankingPage() {
  const [tab, setTab] = useState<'today' | 'all'>('today');
  const [rows, setRows] = useState<RankRow[]>([]);
  // 상위 3명 곤충 그림 (insect_id → data URL). 아직 안 받아왔거나 그림이 없으면 비어 있습니다.
  const [podium, setPodium] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRanking(tab);
  }, [tab]);

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

    const { data } = await query;
    const best = new Map<string, RankRow>();
    (data || []).forEach((row: any) => {
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

    setRows(ranked);
    setLoading(false);

    // 그림은 **순위를 다 그린 뒤에** 따로 받아옵니다.
    // 같이 기다리면 그림 때문에 순위표 전체가 늦게 뜹니다. 이러면 그림이 나중에 스르륵 채워집니다.
    void loadPodiumImages(ranked.slice(0, PODIUM_COUNT));
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
      <h1 className="text-2xl font-bold text-center">🏆 랭킹</h1>

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
        <p className="text-center text-slate-400">아직 배틀 기록이 없어요.</p>
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
                  <span className="font-bold">
                    {i + 1}. {row.nickname}
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
                <div className="w-14 h-14 shrink-0 rounded-full overflow-hidden bg-slate-700 flex items-center justify-center">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={row.nickname} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">🐛</span>
                  )}
                </div>

                <span className="text-2xl shrink-0">{MEDALS[i]}</span>

                <span className="font-bold flex-1 truncate">{row.nickname}</span>

                <span className="text-emerald-400 font-bold shrink-0">{row.best_score}점</span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
