'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { loadTestPlayerIds } from '@/lib/test-world';
import { useWakeLock } from '@/lib/wake-lock';
import { BOT_INSECTS } from '@/lib/bots';
import { baseMoveFor } from '@/lib/special-moves';
import { IMPACT_ART, MOVE_ART, TIMING_ART } from '@/lib/fx-art';
import { BrandLogo, BrandMark } from '@/app/brand-logo';
import { GAME_TITLE } from '@/lib/brand';

// 📺 대기 화면 홍보 영상 (2026-10-03 밤 Jin: "대기하는 태블릿·노트북에서 영상이 계속 나오다가 누르면 멈추고 게임 시작.
//    콰쾅 하는 거, 필살기 쓰는 거, 지금까지 만든 카드들이 확대됐다가 슉슉 지나가게")
//
// 진짜 동영상 파일이 아니라 **코드로 그리는 영상**이다 (Claude 컨테이너에서 영상을 녹화할 수 없어서).
// 그래서 아이들이 만든 **진짜 카드**가 들어가고, 새 곤충이 생기면 15분마다 새로 받아온다.
// 장면: ① 제목 → ② 배틀(하스스톤 공격·콰쾅·필살기·퍼펙트) → ③ 카드 행진 → ④ "눌러서 시작" → 반복.
// 소리는 없다 (폰·태블릿은 누르기 전에는 소리를 낼 수 없음).

interface ShowCard {
  id: string;
  nickname: string;
  species: string;
  level: number;
  src: string;
}

const SCENES = [
  { key: 'title', ms: 4500 },
  { key: 'battle', ms: 9000 },
  { key: 'parade', ms: 10500 },
  { key: 'cta', ms: 4500 },
] as const;

const REFRESH_MS = 15 * 60_000;

function botCards(): ShowCard[] {
  return BOT_INSECTS.map((b) => ({ id: b.id, nickname: b.nickname, species: b.species ?? '곤충', level: 1, src: b.image_url ?? '' }));
}

async function loadCards(): Promise<ShowCard[]> {
  try {
    const [{ data }, testIds] = await Promise.all([
      supabase
        .from('insects')
        .select('id, player_id, nickname, species, level, image_base64, mime_type')
        .order('created_at', { ascending: false })
        .limit(14),
      loadTestPlayerIds(),
    ]);
    const real = (data || [])
      .filter((r: any) => r.image_base64 && !testIds.has(r.player_id))
      .slice(0, 8)
      .map((r: any) => ({
        id: r.id,
        nickname: r.nickname || '곤충',
        species: r.species || '곤충',
        level: r.level ?? 1,
        src: `data:${r.mime_type || 'image/jpeg'};base64,${r.image_base64}`,
      }));
    // 아이들 카드가 모자라면 🤖 연습 곤충 그림으로 채운다
    return real.length >= 3 ? real : [...real, ...botCards()].slice(0, Math.max(3, real.length));
  } catch {
    return botCards();
  }
}

function ShowCardFace({ card, className = '', style }: { card: ShowCard; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`attract-card ${className}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={card.src} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <span className="absolute left-[4%] top-[3%] rounded-md bg-black/60 px-[0.5em] py-[0.15em] text-[0.8em] font-black text-amber-200">
        LV.{card.level}
      </span>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-[6%] pb-[4%] pt-[20%]">
        <p className="truncate text-[1.25em] font-black text-white leading-tight">{card.nickname}</p>
        <p className="truncate text-[0.75em] font-bold text-slate-300">{card.species}</p>
      </div>
    </div>
  );
}

export default function AttractShow({ onClose }: { onClose: () => void }) {
  // 📺 영상이 나오는 동안 화면이 꺼지지 않게 (10/4 Jin, lib/wake-lock.ts)
  useWakeLock(true);
  const [cards, setCards] = useState<ShowCard[]>(() => botCards());
  const [scene, setScene] = useState(0);
  const [loop, setLoop] = useState(0);

  useEffect(() => {
    let alive = true;
    const pull = () => loadCards().then((c) => alive && c.length && setCards(c));
    pull();
    const id = window.setInterval(pull, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setScene((s) => {
        const next = (s + 1) % SCENES.length;
        if (next === 0) setLoop((l) => l + 1);
        return next;
      });
    }, SCENES[scene].ms);
    return () => window.clearTimeout(id);
  }, [scene]);

  // 반복할 때마다 배틀하는 두 마리를 바꾼다
  const a = cards[(loop * 2) % cards.length];
  const b = cards[(loop * 2 + 1) % cards.length] ?? cards[0];
  const key = SCENES[scene].key;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="화면을 눌러서 시작하기"
      onClick={onClose}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClose()}
      className="attract-root fixed inset-0 z-[100] overflow-hidden select-none cursor-pointer"
    >
      <div className="attract-rays" aria-hidden />

      {/* 위: 게임 이름 (항상) */}
      <div className="absolute top-[3vmin] inset-x-0 flex items-center justify-center gap-[1.5vmin] text-white">
        <BrandMark size={48} />
        <span className="text-[4.2vmin] font-black tracking-tight">{GAME_TITLE}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center" key={`${key}-${loop}`}>
        {key === 'title' && <TitleScene />}
        {key === 'battle' && a && b && <BattleScene a={a} b={b} />}
        {key === 'parade' && <ParadeScene cards={cards} />}
        {key === 'cta' && <CtaScene />}
      </div>

      {/* 아래: 눌러서 시작 (항상) */}
      <div className="absolute bottom-[4vmin] inset-x-0 flex justify-center">
        <span className="attract-tap rounded-full bg-amber-400 px-[4vmin] py-[1.6vmin] text-[3.6vmin] font-black text-slate-900 shadow-[0_0_40px_rgba(251,191,36,0.7)]">
          👆 화면을 눌러서 시작!
        </span>
      </div>
    </div>
  );
}

function TitleScene() {
  return (
    <div className="attract-zoom flex flex-col items-center gap-[2vmin] text-center px-[4vmin]">
      <BrandLogo size={220} />
      <p className="attract-gold text-[8vmin] font-black leading-none">곤충 배틀!</p>
      <p className="text-[3.8vmin] font-bold text-white" style={{ wordBreak: 'keep-all' }}>
        🖍️ 내가 그린 곤충이 <span className="text-amber-300">AI 곤충</span>으로 변신!
      </p>
      <p className="text-[3vmin] font-bold text-slate-300" style={{ wordBreak: 'keep-all' }}>
        ⚔️ 친구 곤충이랑 배틀해서 랭킹 1위에 도전!
      </p>
    </div>
  );
}

/** 배틀 시연 — 하스스톤식 공격·콰쾅·필살기·퍼펙트를 정해진 순서로 보여준다 */
function BattleScene({ a, b }: { a: ShowCard; b: ShowCard }) {
  const [attack, setAttack] = useState<'A' | 'B' | null>(null);
  const [hit, setHit] = useState<'A' | 'B' | null>(null);
  const [hpA, setHpA] = useState(100);
  const [hpB, setHpB] = useState(100);
  const [fx, setFx] = useState<{ id: number; side: 'A' | 'B'; text: string; crit?: boolean } | null>(null);
  const [special, setSpecial] = useState(false);
  const [perfect, setPerfect] = useState(false);
  const [win, setWin] = useState(false);
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const move = baseMoveFor(a.species);

  useEffect(() => {
    // 두 카드 사이 거리를 재서 날아가는 거리로 (하스스톤처럼 상대 카드 위로 부딪힌다)
    const setDist = () => {
      if (!aRef.current || !bRef.current) return;
      const ra = aRef.current.getBoundingClientRect();
      const rb = bRef.current.getBoundingClientRect();
      const dx = (rb.left + rb.width / 2 - (ra.left + ra.width / 2)) * 0.7;
      aRef.current.style.setProperty('--hs-dx', `${Math.round(dx)}px`);
      bRef.current.style.setProperty('--hs-dx', `${Math.round(-dx)}px`);
    };
    setDist();
    const timers: number[] = [];
    let n = 0;
    const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    const strike = (start: number, who: 'A' | 'B', dmg: number, crit = false) => {
      at(start, () => setAttack(who));
      at(start + 280, () => {
        const target = who === 'A' ? 'B' : 'A';
        setHit(target);
        setFx({ id: ++n, side: target, text: `-${dmg}`, crit });
        if (target === 'B') setHpB((v) => Math.max(0, v - dmg));
        else setHpA((v) => Math.max(0, v - dmg));
      });
      at(start + 700, () => {
        setAttack(null);
        setHit(null);
      });
    };
    strike(900, 'A', 22);
    strike(2000, 'B', 18);
    at(3200, () => setSpecial(true));
    at(4000, () => setPerfect(true));
    at(5000, () => {
      setSpecial(false);
      setPerfect(false);
    });
    strike(5300, 'A', 45, true);
    strike(6600, 'A', 33);
    at(7300, () => setWin(true));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const side = (who: 'A' | 'B', card: ShowCard, hp: number, ref: React.RefObject<HTMLDivElement>) => (
    <div className="flex flex-col items-center gap-[1.5vmin]">
      <div
        ref={ref}
        className={`relative ${attack === who ? 'z-20 attract-hs' : 'z-0'} ${hit === who ? 'animate-hit-flash' : ''}`}
      >
        <ShowCardFace card={card} className="attract-battle-card" />
        {fx?.side === who && (
          <div key={fx.id} className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {IMPACT_ART ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={IMPACT_ART.src} alt="콰쾅!" className="w-[80%] animate-impact-pop" />
            ) : (
              <span className="text-[12vmin] animate-impact-pop">💥</span>
            )}
            <span className={`absolute left-1/2 top-[18%] text-[6vmin] font-black animate-damage-float ${fx.crit ? 'text-amber-300' : 'text-rose-300'}`}>
              {fx.crit ? '⚡' : ''}
              {fx.text}
            </span>
          </div>
        )}
      </div>
      <div className="w-[min(34vw,37vh)] h-[1.6vmin] rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full transition-all duration-500 ${who === 'A' ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${hp}%` }} />
      </div>
    </div>
  );

  return (
    <div className="relative w-full flex items-center justify-center gap-[4vmin] px-[3vmin]">
      {side('A', a, hpA, aRef)}
      <span className="attract-gold text-[9vmin] font-black animate-vs-slam">VS</span>
      {side('B', b, hpB, bRef)}

      {special && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-white/80 animate-special-flash" />
          {MOVE_ART[move.key] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={MOVE_ART[move.key]!.src} alt={move.name} className="relative h-[22vmin] animate-special-name" />
          ) : (
            <p className="relative text-[10vmin] font-black text-amber-300 animate-special-name">
              {move.emoji} {move.name}
            </p>
          )}
          <p className="relative mt-[1vmin] text-[3.5vmin] font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">⚡ 필살기 발동!</p>
          {perfect &&
            (TIMING_ART.perfect ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={TIMING_ART.perfect.src} alt="퍼펙트!" className="relative mt-[2vmin] h-[16vmin] animate-judge-pop" />
            ) : (
              <p className="relative mt-[2vmin] text-[8vmin] font-black text-amber-300 animate-judge-pop">✨ 퍼펙트!</p>
            ))}
        </div>
      )}

      {win && (
        <p className="absolute bottom-[-14vmin] inset-x-0 text-center attract-gold text-[8vmin] font-black animate-pop">
          🎉 {a.nickname} 승리!
        </p>
      )}
    </div>
  );
}

/** 지금까지 만든 카드들이 하나씩 크게 확대됐다가 슉 지나간다 */
function ParadeScene({ cards }: { cards: ShowCard[] }) {
  const list = cards.slice(0, 7);
  const each = 10500 / Math.max(list.length, 1);
  return (
    <div className="relative w-full h-full">
      <p className="absolute top-[12vmin] inset-x-0 text-center text-[4.5vmin] font-black text-white" style={{ wordBreak: 'keep-all' }}>
        🃏 친구들이 만든 곤충 카드!
      </p>
      {list.map((c, i) => (
        <div
          key={c.id}
          className="attract-parade absolute left-1/2 top-1/2"
          style={{ animationDelay: `${i * each}ms`, animationDuration: `${each * 1.15}ms` }}
        >
          <ShowCardFace card={c} className="attract-parade-card" />
        </div>
      ))}
    </div>
  );
}

function CtaScene() {
  return (
    <div className="attract-zoom flex flex-col items-center gap-[2.5vmin] text-center px-[5vmin]" style={{ wordBreak: 'keep-all' }}>
      <p className="text-[5vmin] font-black text-white">🖍️ 종이에 곤충을 그리고</p>
      <p className="text-[5vmin] font-black text-white">📷 종이 QR을 찍으면</p>
      <p className="attract-gold text-[9vmin] font-black leading-tight">너도 배틀 시작!</p>
      <p className="text-[3vmin] font-bold text-slate-300">🥇 랭킹 1위는 왕사슴벌레 산란 사육세트! 100위까지 선물 🎁</p>
    </div>
  );
}
