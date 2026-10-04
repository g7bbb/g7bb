'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isTestPlayer, loadTestPlayerIds, sameWorld } from '@/lib/test-world';
import { loadKidNames } from '@/lib/kid-names';
import { loadInsectImages } from '@/lib/image-cache';
import { useWakeLock } from '@/lib/wake-lock';
import { BrandMark } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';

// 📺 실시간 전체 랭킹 — 부스 모니터용 (2026-10-03 Jin: "영상 옆에 띄워놓게. 가로 20cm 정도, 길게. 지나가면서 아이들이 보게")
//
// - 20초마다 다시 불러온다. 순위가 바뀌면 그 줄이 잠깐 반짝인다.
// - 줄이 화면보다 길면 천천히 아래로 흘렀다가 맨 위로 돌아온다 (아무도 안 만져도 전부 보이게).
// - 1~3위만 그림을 보여준다. 그림은 1~3위가 바뀔 때만 새로 받는다 (전송량 아끼기).
// - 테스트 번호(900번대)는 빠진다 (/ranking 과 같은 규칙). 음악·자동 로그아웃 없음.
// - 🃏 한 바퀴 돌 때마다(맨 위에서) 3위 → 2위 → 1위 카드를 0.8초씩 크게 보여준다 (10/4 Jin).

const REFRESH_MS = 20_000;
/**
 * 화면 통째로 새로 불러오는 간격 (10/4 Jin 사진: 모니터가 옛날 화면 그대로라 아이 닉네임이 안 나옴).
 * 숫자는 20초마다 바뀌지만 **화면 모양(새 기능)** 은 페이지를 다시 열어야 들어온다 → 10분마다 스스로 새로고침.
 */
const RELOAD_MS = 10 * 60_000;
const SHOW = 50;
/** 🃏 1~3위 카드를 크게 보여주는 시간 (10/4 Jin: "3위까지는 약 0.8초 동안 카드를") */
const SPOT_MS = 800;
/**
 * 흐르는 속도 (1초에 몇 px) — 10/4 Jin: "1~3위가 가장 느리게, 10위까지는 지금 속도로, 10위 아래는 1.5배".
 * 랭킹 칸 맨 위에 걸친 줄이 몇 위인지로 정한다.
 */
const SPEED_TOP3 = 16;
const SPEED_TOP10 = 28; // 원래 속도
const SPEED_REST = 42; // 원래 속도 × 1.5
/** 줄이 짧아 흐르지 않을 때도 이 간격으로 1~3위 카드를 다시 보여준다 */
const SPOT_EVERY_MS = 30_000;

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
  /** 지금 크게 보여주는 순위 (0 = 1위), 없으면 null */
  const [spot, setSpot] = useState<number | null>(null);
  const rowsRef = useRef<Row[]>([]);
  const imagesRef = useRef<Map<string, string>>(new Map());
  const rowsAt = useRef(0);
  rowsRef.current = rows;
  imagesRef.current = images;
  // 부스 모니터라 화면이 꺼지지 않게 (lib/wake-lock.ts)
  useWakeLock(true);

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

      if (!rowsAt.current && ranked.length) rowsAt.current = performance.now();
      setRows(ranked);
      setUpdated(new Date());

      // 1~3위 그림 — 바뀌었을 때만
      const top = ranked.slice(0, 3).map((r) => r.insect_id);
      const key = top.join(',');
      if (key && key !== podiumKey.current) {
        podiumKey.current = key;
        // 기기에 저장해둔 그림은 다시 안 받는다 (lib/image-cache.ts)
        setImages(await loadInsectImages(top));
      }
    } catch {
      // 한 번 실패해도 다음 새로고침 때 다시 받는다 (화면은 그대로 둔다)
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    const reload = window.setTimeout(() => window.location.reload(), RELOAD_MS);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(reload);
    };
  }, [load]);

  // 줄이 칸보다 길면 **랭킹 칸만** 천천히 흘려 보여준다 (위 제목 띠는 고정 — 10/3 밤 Jin)
  // 한 바퀴 시작(맨 위)마다 먼저 3위 → 2위 → 1위 카드를 0.8초씩 띄우고, 그동안은 멈춰 있는다 (10/4 Jin)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let pauseUntil = last + 1500;
    let needSpot = true;
    let lastSpot = 0;
    let pos = 0; // scrollTop 은 정수로 잘려서 느린 속도가 안 쌓이므로 따로 센다
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));

    /** 1~3위 카드 차례로 — 걸리는 시간(ms)을 돌려준다 */
    const showTop3 = () => {
      const n = Math.min(3, rowsRef.current.length);
      for (let k = 0; k < n; k++) later(k * SPOT_MS, () => setSpot(n - 1 - k)); // 3위 → 2위 → 1위
      later(n * SPOT_MS, () => setSpot(null));
      return n * SPOT_MS;
    };

    const step = (now: number) => {
      const el = listRef.current;
      if (el && now > pauseUntil) {
        const max = el.scrollHeight - el.clientHeight;
        // 그림이 오기 전에 카드를 띄우면 빈 칸이 나오므로 조금(최대 5초) 기다린다
        const ready = rowsRef.current.length > 0 && (imagesRef.current.size > 0 || now - rowsAt.current > 5000);
        if (max <= 20 && now - lastSpot > SPOT_EVERY_MS) needSpot = true;
        if (needSpot && ready) {
          needSpot = false;
          lastSpot = now;
          pauseUntil = now + showTop3() + 1500;
        } else if (!needSpot && max > 20) {
          // 칸 맨 위가 4위 줄 위쪽이면 1~3위, 11위 줄 위쪽이면 4~10위를 지나는 중
          const box = el.getBoundingClientRect().top;
          const topOf = (rank: number) => {
            const row = el.querySelector<HTMLElement>(`[data-rank="${rank}"]`);
            return row ? row.getBoundingClientRect().top - box + el.scrollTop : Infinity;
          };
          const speed = pos < topOf(4) ? SPEED_TOP3 : pos < topOf(11) ? SPEED_TOP10 : SPEED_REST;
          pos = Math.min(max, pos + ((now - last) / 1000) * speed);
          el.scrollTop = pos;
          if (pos >= max - 1) {
            pauseUntil = now + 6000;
            later(4000, () => {
              pos = 0;
              el.scrollTo({ top: 0, behavior: 'smooth' });
              needSpot = true; // 맨 위로 돌아오면 다시 1~3위 카드부터
            });
          }
        }
      }
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
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
              data-rank={i + 1}
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
              data-rank={j + 4}
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

      {spot !== null && rows[spot] && <SpotCard row={rows[spot]} rank={spot} image={images.get(rows[spot].insect_id)} />}

      <p className="shrink-0 text-center text-slate-400 font-bold">🐛 종이에 곤충을 그리고 QR을 찍으면 너도 도전할 수 있어! 🐞</p>
    </main>
  );
}

/** 🃏 1~3위 카드 크게 (0.8초) — 등수마다 금·은·동 테두리, 1위는 왕관·금빛 햇살 */
function SpotCard({ row, rank, image }: { row: Row; rank: number; image?: string }) {
  const king = rank === 0;
  const frame = [
    'linear-gradient(145deg, #fff7c2, #d4a017 30%, #fde68a 52%, #b45309 78%, #fef3c7)',
    'linear-gradient(145deg, #f8fafc, #94a3b8 35%, #e2e8f0 55%, #64748b 80%, #f1f5f9)',
    'linear-gradient(145deg, #fed7aa, #c2410c 35%, #fdba74 55%, #9a3412 80%, #ffedd5)',
  ][rank];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 pointer-events-none" style={{ wordBreak: 'keep-all' }}>
      {/* key 로 등수가 바뀔 때마다 애니메이션을 처음부터 */}
      <div key={rank} className="live-spot relative flex flex-col items-center" style={{ animationDuration: `${SPOT_MS}ms` }}>
        {king && <div className="top3-rays" aria-hidden />}
        <p className="relative text-[min(9vw,6.5vh)] font-black leading-none text-white drop-shadow-[0_0_12px_rgba(0,0,0,0.9)]">
          {king && <span className="top3-crown mr-1">👑</span>}
          {['🥇', '🥈', '🥉'][rank]} {rank + 1}위
        </p>
        <div
          className={`relative mt-[1.5vh] rounded-2xl p-[0.9vmin] holo-frame ${king ? 'aura aura-gold' : ''}`}
          style={{ background: frame }}
        >
          <div className="relative overflow-hidden rounded-xl bg-slate-800" style={{ width: 'min(64vw, 46vh)', aspectRatio: '4 / 5' }}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[20vmin]">🐞</div>
            )}
            <span className="absolute left-[4%] top-[3%] rounded-lg bg-black/65 px-[0.5em] py-[0.15em] text-[min(4.5vw,3.2vh)] font-black text-amber-200">
              LV.{row.level}
            </span>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-[6%] pb-[4%] pt-[22%]">
              <p className="truncate text-[min(7vw,5vh)] font-black text-white leading-tight">🐞 {row.nickname}</p>
              <p className="truncate text-[min(4.2vw,3vh)] font-bold text-slate-200">
                {row.kid ? `👦 ${row.kid} · ` : ''}{row.species || '곤충'}
              </p>
              <p className="text-[min(6.5vw,4.6vh)] font-black text-emerald-300 leading-tight">{row.score}점</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
