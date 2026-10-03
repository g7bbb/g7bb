'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isTestPlayer, loadTestPlayerIds, sameWorld } from '@/lib/test-world';
import { BrandMark } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';

// 📺 실시간 전체 랭킹 — 부스 모니터용 (2026-10-03 Jin: "영상 옆에 띄워놓게. 가로 20cm 정도, 길게. 지나가면서 아이들이 보게")
//
// - 20초마다 다시 불러온다. 순위가 바뀌면 그 줄이 잠깐 반짝인다.
// - 줄이 화면보다 길면 천천히 아래로 흘렀다가 맨 위로 돌아온다 (아무도 안 만져도 전부 보이게).
// - 1~3위만 그림을 보여준다. 그림은 1~3위가 바뀔 때만 새로 받는다 (전송량 아끼기).
// - 테스트 번호(900번대)는 빠진다 (/ranking 과 같은 규칙). 음악·자동 로그아웃 없음.

const REFRESH_MS = 20_000;
const SHOW = 50;

interface Row {
  player_id: string;
  insect_id: string;
  nickname: string;
  species: string | null;
  level: number;
  score: number;
}

export default function LivePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [updated, setUpdated] = useState<Date | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const prevRank = useRef<Map<string, number>>(new Map());
  const podiumKey = useRef('');
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [{ data }, testIds] = await Promise.all([
        supabase
          .from('battles')
          .select('player_id, insect_id, score, insects!battles_insect_id_fkey(nickname, species, level)')
          .order('score', { ascending: false })
          .limit(1000),
        loadTestPlayerIds(),
      ]);
      const best = new Map<string, Row>();
      (data || []).forEach((r: any) => {
        if (!sameWorld(r.player_id, testIds, isTestPlayer(null))) return;
        const cur = best.get(r.player_id);
        if (!cur || r.score > cur.score) {
          best.set(r.player_id, {
            player_id: r.player_id,
            insect_id: r.insect_id,
            nickname: r.insects?.nickname || '이름없음',
            species: r.insects?.species ?? null,
            level: r.insects?.level ?? 1,
            score: Math.round(r.score),
          });
        }
      });
      const ranked = Array.from(best.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, SHOW);

      // 순위가 오른 줄 반짝이기
      const up = new Set<string>();
      ranked.forEach((r, i) => {
        const before = prevRank.current.get(r.player_id);
        if (prevRank.current.size && (before === undefined || before > i)) up.add(r.player_id);
      });
      prevRank.current = new Map(ranked.map((r, i) => [r.player_id, i]));
      setFlash(up);
      window.setTimeout(() => setFlash(new Set()), 4000);

      setRows(ranked);
      setUpdated(new Date());

      // 1~3위 그림 — 바뀌었을 때만
      const top = ranked.slice(0, 3).map((r) => r.insect_id);
      const key = top.join(',');
      if (key && key !== podiumKey.current) {
        podiumKey.current = key;
        const { data: imgs } = await supabase.from('insects').select('id, image_base64, mime_type').in('id', top);
        const next = new Map<string, string>();
        (imgs || []).forEach((i: any) => {
          if (i.image_base64) next.set(i.id, `data:${i.mime_type || 'image/jpeg'};base64,${i.image_base64}`);
        });
        setImages(next);
      }
    } catch {
      // 한 번 실패해도 다음 새로고침 때 다시 받는다 (화면은 그대로 둔다)
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // 줄이 화면보다 길면 천천히 흘려 보여준다
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let pauseUntil = last + 4000;
    const step = (now: number) => {
      const el = document.scrollingElement || document.documentElement;
      const max = el.scrollHeight - window.innerHeight;
      if (max > 20 && now > pauseUntil) {
        el.scrollTop += ((now - last) / 1000) * 28; // 1초에 28px
        if (el.scrollTop >= max - 1) {
          pauseUntil = now + 5000;
          window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 4000);
        }
      }
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;

  return (
    <main className="min-h-screen px-4 py-5 flex flex-col gap-4" style={{ wordBreak: 'keep-all' }}>
      <header className="text-center">
        <p className="text-3xl font-black">
          <BrandMark size={40} className="mr-2 -mt-1" />
          실시간 랭킹
        </p>
        <p className="mt-1 text-slate-300 font-bold">{GAME_TITLE} · 2026 대전 곤충박람회</p>
        <p className="mt-1 text-xs text-slate-500">
          {updated ? `${updated.getHours()}시 ${String(updated.getMinutes()).padStart(2, '0')}분 기준 · 20초마다 바뀌어요` : '불러오는 중...'}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-center text-slate-400 text-xl py-10">아직 배틀 기록이 없어. 첫 번째 주인공이 되어봐!</p>
      ) : (
        <div ref={listRef} className="flex flex-col gap-2.5">
          {/* 1~3위 — 그림과 함께 크게 */}
          {rows.slice(0, 3).map((r, i) => (
            <div
              key={r.player_id}
              className={`flex items-center gap-3 rounded-2xl p-3 border-2 ${
                i === 0 ? 'border-amber-300 bg-amber-400/15' : i === 1 ? 'border-slate-300 bg-slate-300/10' : 'border-orange-400 bg-orange-400/10'
              } ${flash.has(r.player_id) ? 'animate-pulse' : ''}`}
            >
              <span className="text-5xl w-14 text-center shrink-0">{medal(i)}</span>
              {images.get(r.insect_id) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images.get(r.insect_id)} alt="" className="w-28 h-28 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-28 h-28 rounded-xl bg-slate-800 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-black truncate">{r.nickname}</p>
                <p className="text-sm text-slate-300 truncate">
                  LV.{r.level} · {r.species || '곤충'}
                </p>
                <p className="text-2xl font-black text-emerald-300">{r.score}점</p>
              </div>
            </div>
          ))}
          {/* 4위부터 — 한 줄씩 */}
          {rows.slice(3).map((r, j) => (
            <div
              key={r.player_id}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 bg-slate-800 ${flash.has(r.player_id) ? 'ring-2 ring-emerald-400' : ''}`}
            >
              <span className="w-10 text-center text-xl font-black text-amber-300 shrink-0">{j + 4}</span>
              <span className="flex-1 min-w-0 truncate text-xl font-bold">{r.nickname}</span>
              <span className="text-sm text-slate-400 shrink-0">LV.{r.level}</span>
              <span className="w-24 text-right text-xl font-black text-emerald-300 shrink-0">{r.score}점</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-slate-400 font-bold mt-2">🐛 종이에 곤충을 그리고 QR을 찍으면 너도 도전할 수 있어! 🐞</p>
    </main>
  );
}
