'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isTestPlayer, loadTestPlayerIds, sameWorld } from '@/lib/test-world';
import { loadKidNames } from '@/lib/kid-names';
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
  /** 아이 닉네임 — 곤충 이름 옆에 작게 (10/4 Jin) */
  kid?: string;
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
      const kids = await loadKidNames(ranked.map((r) => r.player_id));
      ranked.forEach((r) => (r.kid = kids.get(r.player_id) || ''));

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

  // 줄이 칸보다 길면 **랭킹 칸만** 천천히 흘려 보여준다 (위 제목 띠는 고정 — 10/3 밤 Jin)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let pauseUntil = last + 4000;
    let pos = 0; // scrollTop 은 정수로 잘려서 느린 속도가 안 쌓이므로 따로 센다
    const step = (now: number) => {
      const el = listRef.current;
      if (el) {
        const max = el.scrollHeight - el.clientHeight;
        if (max > 20 && now > pauseUntil) {
          pos = Math.min(max, pos + ((now - last) / 1000) * 28); // 1초에 28px
          el.scrollTop = pos;
          if (pos >= max - 1) {
            pauseUntil = now + 9000;
            window.setTimeout(() => {
              pos = 0;
              el.scrollTo({ top: 0, behavior: 'smooth' });
            }, 4000);
          }
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
    <main className="h-screen overflow-hidden px-4 py-4 flex flex-col gap-3" style={{ wordBreak: 'keep-all' }}>
      {/* 🏆 위 제목 띠 — 움직이지 않는다 (10/3 밤 Jin: "로고 넣어서 테두리, 이 글씨는 안 없어지게 고정") */}
      <header className="shrink-0 relative rounded-3xl p-[3px] bg-gradient-to-r from-amber-300 via-yellow-100 to-amber-500 shadow-[0_0_30px_rgba(251,191,36,0.45)]">
        <div className="rounded-[1.35rem] bg-slate-950 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-3">
            <BrandMark size={56} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[2rem] leading-tight font-black tracking-tight">
                <span className="text-amber-300">G7BB 배틀</span> 실시간 랭킹
              </p>
              <p className="text-sm text-slate-300 font-bold">{GAME_TITLE} · 2026 대전 곤충박람회</p>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse mr-1.5 align-middle" />
            {updated ? `LIVE · ${updated.getHours()}시 ${String(updated.getMinutes()).padStart(2, '0')}분 기준 · 20초마다 바뀌어요` : '불러오는 중...'}
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="flex-1 text-center text-slate-400 text-xl py-10">아직 배틀 기록이 없어. 첫 번째 주인공이 되어봐!</p>
      ) : (
        <div ref={listRef} className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2.5 [&>*]:shrink-0">
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
                <p className="text-2xl font-black truncate">🐞 {r.nickname}</p>
                <p className="text-sm text-slate-300 truncate">
                  {r.kid ? `👦 ${r.kid} · ` : ''}LV.{r.level} · {r.species || '곤충'}
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
              <span className="flex-1 min-w-0 truncate text-xl font-bold">
                🐞 {r.nickname}
                {r.kid && <span className="ml-2 text-sm font-normal text-slate-400">👦 {r.kid}</span>}
              </span>
              <span className="text-sm text-slate-400 shrink-0">LV.{r.level}</span>
              <span className="w-24 text-right text-xl font-black text-emerald-300 shrink-0">{r.score}점</span>
            </div>
          ))}
        </div>
      )}

      <p className="shrink-0 text-center text-slate-400 font-bold">🐛 종이에 곤충을 그리고 QR을 찍으면 너도 도전할 수 있어! 🐞</p>
    </main>
  );
}
