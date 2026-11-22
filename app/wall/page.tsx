'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SEASON_FROM } from '@/lib/event-config';
import { isStaffTicket, isTestTicket } from '@/lib/ticket';
import { loadInsectImages } from '@/lib/image-cache';
import { auraClass, frameShines, levelTier } from '@/lib/card';
import { useWakeLock } from '@/lib/wake-lock';
import { EVENT_LIVE } from '@/lib/event-mode';
import { BrandMark } from '@/app/brand-logo';

// 🐞 곤충 벽 (/wall) — 이번 행사에서 아이들이 만든 곤충을 **전부 한 화면에** (11/22 Jin: "참여한 모든 아이들의 곤충을 한 화면에")
//
// - 몇 마리든 화면에 딱 맞게 칸 크기를 계산한다 (스크롤 없음). 적으면 크게, 많으면 작게.
// - 테두리는 레벨대로 (LV3 은 · LV5 금 · LV7 다이아, 앱 카드와 같은 규칙).
// - 7초마다 한 마리를 가운데 크게 + 👦 아이 닉네임 ("내 거 저기 있다!").
// - 그림은 12장씩 나눠 받고 기기에 저장(lib/image-cache) → 다시 열면 새 곤충 그림만 받는다.
// - 행사 중(EVENT_LIVE)에는 3분마다 새 곤충을 확인해서 쏙 추가. 테스트(900~)·직원(450~500) 번호는 뺀다.

const REFRESH_MS = 3 * 60_000;
const SPOT_EVERY_MS = 7000;
const SPOT_SHOW_MS = 3200;
const CHUNK = 12;

interface WallCard {
  id: string;
  nickname: string;
  species: string;
  level: number;
  kid: string;
}

async function loadList(): Promise<WallCard[]> {
  const { data } = await supabase
    .from('insects')
    .select('id, player_id, nickname, species, level, created_at')
    .gte('created_at', SEASON_FROM)
    .order('created_at', { ascending: true })
    .limit(600);
  const rows = data || [];
  const pids = Array.from(new Set(rows.map((r: any) => r.player_id))).filter(Boolean);
  const players = new Map<string, { name: string; ticket: string }>();
  for (let i = 0; i < pids.length; i += 100) {
    const { data: ps } = await supabase.from('players').select('id, display_name, ticket_code').in('id', pids.slice(i, i + 100));
    (ps || []).forEach((p: any) => players.set(p.id, { name: String(p.display_name || ''), ticket: String(p.ticket_code || '') }));
  }
  return rows
    .filter((r: any) => {
      const p = players.get(r.player_id);
      return p && !isTestTicket(p.ticket) && !isStaffTicket(p.ticket);
    })
    .map((r: any) => ({
      id: r.id,
      nickname: r.nickname || '곤충',
      species: r.species || '곤충',
      level: r.level ?? 1,
      kid: players.get(r.player_id)?.name || '',
    }));
}

/** n 장을 W×H 안에 4:5 카드로 꽉 차게 — 제일 크게 나오는 열 수를 고른다 */
function fitGrid(n: number, W: number, H: number, gap: number) {
  let best = { cols: 1, w: 0 };
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    const byW = (W - gap * (cols - 1)) / cols;
    const byH = ((H - gap * (rows - 1)) / rows) * 0.8;
    const w = Math.min(byW, byH);
    if (w > best.w) best = { cols, w };
  }
  return { cols: best.cols, w: Math.max(20, Math.floor(best.w)) };
}

export default function WallPage() {
  useWakeLock(EVENT_LIVE);
  const [cards, setCards] = useState<WallCard[]>([]);
  const [imgs, setImgs] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [spot, setSpot] = useState<string | null>(null);
  const firstIds = useRef<Set<string> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, h: 700 });

  // 목록 → 그림 12장씩 (받는 대로 칸에 나타남)
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const list = await loadList();
        if (!alive) return;
        if (!firstIds.current) firstIds.current = new Set(list.map((c) => c.id));
        setCards(list);
        setLoaded(true);
        for (let i = 0; i < list.length; i += CHUNK) {
          const got = await loadInsectImages(list.slice(i, i + CHUNK).map((c) => c.id));
          if (!alive) return;
          setImgs((prev) => {
            const next = new Map(prev);
            got.forEach((src, id) => next.set(id, src));
            return next;
          });
        }
      } catch {
        setLoaded(true);
      }
    };
    void pull();
    const id = EVENT_LIVE ? window.setInterval(pull, REFRESH_MS) : 0;
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  // 칸 크기는 화면 크기에 맞춰
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = useMemo(() => cards.filter((c) => imgs.has(c.id)), [cards, imgs]);

  // 🔦 7초마다 한 마리 크게
  useEffect(() => {
    if (shown.length < 2) return;
    const id = window.setInterval(() => {
      const pick = shown[Math.floor(Math.random() * shown.length)];
      setSpot(pick.id);
      window.setTimeout(() => setSpot(null), SPOT_SHOW_MS);
    }, SPOT_EVERY_MS);
    return () => window.clearInterval(id);
  }, [shown]);

  const gap = Math.max(6, Math.round(Math.min(box.w, box.h) * 0.012));
  // 칸은 전체 마리 수로 정한다 — 그림을 받는 동안 칸 크기가 계속 바뀌어 화면이 들썩이지 않게
  const { cols, w } = fitGrid(cards.length, box.w, box.h, gap);
  const font = Math.max(9, w * 0.085);
  const spotCard = spot ? shown.find((c) => c.id === spot) : null;

  return (
    <main className="fixed inset-0 bg-slate-950 text-white flex flex-col overflow-hidden" style={{ wordBreak: 'keep-all' }}>
      <div className="attract-rays opacity-40" aria-hidden />

      {/* 위: 제목 + 마리 수 */}
      <header className="relative z-10 flex items-center justify-center gap-[1.6vmin] pt-[2.4vmin] pb-[1.6vmin] px-4">
        <BrandMark size={44} />
        <p className="text-[4.4vmin] font-black">
          🐞 오늘 우리가 만든 <span className="text-amber-300">AI 곤충들</span>
        </p>
        {cards.length > 0 && (
          <span className="rounded-full bg-amber-400 px-[1.8vmin] py-[0.4vmin] text-[3vmin] font-black text-slate-900">{cards.length}마리</span>
        )}
      </header>

      {/* 가운데: 곤충 벽 */}
      <div ref={boxRef} className="relative z-10 flex-1 mx-[2vmin] flex items-center justify-center">
        {loaded && cards.length === 0 && (
          <p className="text-[4vmin] font-bold text-slate-400">아직 만든 곤충이 없어. 첫 번째 곤충의 주인공이 되어봐! 🖍️</p>
        )}
        <div className="grid justify-center content-center" style={{ gridTemplateColumns: `repeat(${cols}, ${w}px)`, gap }}>
          {cards.map((c, i) => {
            const src = imgs.get(c.id);
            // 그림을 아직 못 받은 칸은 흐린 빈 칸 (받으면 그 자리에 쏙)
            if (!src)
              return (
                <div
                  key={c.id}
                  className="rounded-[0.6vmin] bg-slate-800/50 border border-slate-700/60"
                  style={{ width: w, aspectRatio: '4 / 5', borderRadius: Math.max(4, Math.round(w * 0.06)) }}
                />
              );
            const tier = levelTier(c.level);
            const fresh = firstIds.current && !firstIds.current.has(c.id);
            return (
              // 바깥 = 둥실 움직임, 안쪽 = 레벨 테두리·후광 (둘 다 animation 을 써서 한 칸에 두면 하나가 지워진다)
              <div key={c.id} className="wall-card" style={{ width: w, animationDelay: `${Math.min(i, 60) * 25}ms, ${(i * 0.37) % 3}s` }}>
              <div
                className={`${frameShines(tier) ? 'holo-frame' : ''} ${auraClass(tier)} ${fresh ? 'wall-new' : ''}`}
                style={{
                  width: w,
                  aspectRatio: '4 / 5',
                  padding: Math.max(2, Math.round(w * 0.03)),
                  background: tier.frame,
                  borderRadius: Math.max(4, Math.round(w * 0.06)),
                  fontSize: font,
                  ['--aura-scale' as any]: 0.5,
                }}
              >
                <div className="relative w-full h-full overflow-hidden bg-slate-900" style={{ borderRadius: Math.max(3, Math.round(w * 0.045)) }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  {w >= 70 && (
                    <span className="absolute left-[5%] top-[4%] rounded bg-black/60 px-[0.4em] text-[0.75em] font-black text-amber-200">LV.{c.level}</span>
                  )}
                  {w >= 90 && (
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-[6%] pb-[4%] pt-[22%]">
                      <p className="truncate font-black leading-tight">{c.nickname}</p>
                    </div>
                  )}
                </div>
              </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 아래 */}
      <footer className="relative z-10 py-[1.8vmin] text-center text-[3vmin] font-black text-amber-200">
        🤖 AI를 재미있게 배우는 G7BB! · 📷 종이에 그리고 QR을 찍으면 너도 여기에!
      </footer>

      {/* 🔦 한 마리 크게 */}
      {spotCard && imgs.get(spotCard.id) && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/75 pointer-events-none">
          <div className="wall-spot flex flex-col items-center gap-[1.6vmin]">
            <div
              className={`${frameShines(levelTier(spotCard.level)) ? 'holo-frame' : ''} aura aura-gold`}
              style={{ padding: '0.9vmin', background: levelTier(spotCard.level).frame, borderRadius: '2.4vmin' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgs.get(spotCard.id)} alt="" className="block w-[min(44vw,52vh)] aspect-[4/5] object-cover rounded-[1.8vmin]" />
            </div>
            <p className="text-[5vmin] font-black text-white drop-shadow">🐞 {spotCard.nickname}</p>
            <p className="text-[3.2vmin] font-bold text-amber-200">
              {spotCard.kid ? `👦 ${spotCard.kid} · ` : ''}LV.{spotCard.level} · {spotCard.species}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
