'use client';

import { useEffect, useRef, useState } from 'react';
import { loadSeasonInsects, RosterInsect } from '@/lib/roster';
import { loadInsectImages } from '@/lib/image-cache';
import { cutoutInsect } from '@/lib/cutout';
import { findSpecies } from '@/lib/species';
import { useWakeLock } from '@/lib/wake-lock';
import { EVENT_LIVE } from '@/lib/event-mode';
import { BrandMark } from '@/app/brand-logo';

// 🌋 곤충 필드 (/field) — 아이들 곤충이 **진짜 캐릭터처럼** 한 필드에 모여 돌아다닌다 (11/22 Jin)
//
// - 곤충 그림에서 곤충만 오려내(lib/cutout.ts, 브라우저 안 AI) 필드 위에 세운다. 머리 위에 이름 + HP 바.
// - 아래쪽 땅(앞뒤 깊이가 있는 띠) 위를 걸어 다닌다. 아래로 올수록(앞쪽) 크게, 겹치면 앞쪽이 위.
// - 나비·벌은 땅에서 조금 떠서 날아다닌다 (그림자는 땅에).
// - 필드: 🌋 용암 · 🌌 우주 · 🕳️ 블랙홀 — 위 버튼으로 바꾸거나 45초마다 저절로. 블랙홀은 가운데로 끌려간다.
// - ⏭️ 다음 단계: 한파·고온 같은 환경이 HP 를 깎는 생존 시뮬레이션 (지금 HP 바는 꽉 찬 상태).

type FieldKey = 'lava' | 'space' | 'blackhole';
const FIELDS: { key: FieldKey; emoji: string; label: string }[] = [
  { key: 'lava', emoji: '🌋', label: '용암' },
  { key: 'space', emoji: '🌌', label: '우주' },
  { key: 'blackhole', emoji: '🕳️', label: '블랙홀' },
];
const AUTO_FIELD_MS = 45_000;
const FLYERS = new Set(['butterfly', 'bee']);
/** 땅(걸어 다니는 띠)이 화면 높이의 어디부터 어디까지인지 */
const BELT_TOP = 0.5;
const BELT_BOTTOM = 0.94;

interface Bug {
  info: RosterInsect;
  src: string;
  ratio: number; // 너비/높이
  x: number;
  y: number; // 0~1 (띠 안 깊이)
  tx: number;
  ty: number;
  speed: number;
  face: 1 | -1;
  fly: boolean;
  phase: number;
  wait: number;
  hp: number;
}

export default function FieldPage() {
  useWakeLock(EVENT_LIVE);
  const [field, setField] = useState<FieldKey>('lava');
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(0);
  const bugs = useRef<Bug[]>([]);
  const [, setTick] = useState(0); // 곤충 수가 바뀔 때만 다시 그린다 (움직임은 아래 rAF 가 직접)
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const box = useRef<HTMLDivElement>(null);
  const fieldRef = useRef(field);
  fieldRef.current = field;

  // 곤충 데려오기: 목록 → 그림 → 오려내기 (하나씩 필드에 등장)
  useEffect(() => {
    let alive = true;
    (async () => {
      let list: RosterInsect[] = [];
      try {
        list = await loadSeasonInsects();
      } catch {
        list = [];
      }
      if (!alive) return;
      setTotal(list.length);
      for (let i = 0; i < list.length; i += 6) {
        const part = list.slice(i, i + 6);
        const imgs = await loadInsectImages(part.map((r) => r.id));
        for (const info of part) {
          const src = imgs.get(info.id);
          if (!src || !alive) continue;
          const cut = await cutoutInsect(info.id, src);
          if (!alive) return;
          if (!cut) continue;
          const key = findSpecies(info.species)?.key ?? 'other';
          bugs.current.push({
            info,
            src: cut.src,
            ratio: cut.w / cut.h,
            x: Math.random(),
            y: Math.random(),
            tx: Math.random(),
            ty: Math.random(),
            speed: 0.03 + Math.random() * 0.04,
            face: Math.random() < 0.5 ? 1 : -1,
            fly: FLYERS.has(key),
            phase: Math.random() * 6.28,
            wait: 0,
            hp: 1,
          });
          setReady(bugs.current.length);
          setTick((t) => t + 1);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 필드 저절로 바꾸기
  useEffect(() => {
    const id = window.setInterval(() => {
      setField((f) => FIELDS[(FIELDS.findIndex((x) => x.key === f) + 1) % FIELDS.length].key);
    }, AUTO_FIELD_MS);
    return () => window.clearInterval(id);
  }, []);

  // 움직임 (초당 60번, React 를 거치지 않고 transform 만 바꾼다)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const el = box.current;
      const W = el?.clientWidth ?? 1200;
      const H = el?.clientHeight ?? 700;
      const n = Math.max(1, bugs.current.length);
      // 곤충이 많을수록 작게 (화면 높이의 9~22%)
      const baseH = H * Math.max(0.09, Math.min(0.22, 0.22 / Math.sqrt(n / 6)));
      const pull = fieldRef.current === 'blackhole';
      for (const b of bugs.current) {
        if (b.wait > 0) b.wait -= dt;
        else {
          const dx = b.tx - b.x;
          const dy = b.ty - b.y;
          const dist = Math.hypot(dx, dy * 0.6);
          if (dist < 0.01) {
            b.wait = 0.5 + Math.random() * 2.5;
            b.tx = pull ? 0.5 + (Math.random() - 0.5) * 0.5 : Math.random();
            b.ty = Math.random();
          } else {
            const v = (b.speed * (b.fly ? 1.4 : 1) * dt) / dist;
            b.x += dx * Math.min(1, v);
            b.y += dy * Math.min(1, v);
            if (Math.abs(dx) > 0.002) b.face = dx > 0 ? 1 : -1;
          }
        }
        b.phase += dt * (b.fly ? 9 : b.wait > 0 ? 2 : 7);
        const node = nodes.current.get(b.info.id);
        if (!node) continue;
        const depth = 0.65 + 0.55 * b.y; // 앞쪽(아래)일수록 크게
        const h = baseH * depth;
        const w = h * b.ratio;
        const px = 40 + b.x * (W - 80);
        const py = H * (BELT_TOP + (BELT_BOTTOM - BELT_TOP) * b.y);
        const lift = b.fly ? h * (0.35 + 0.08 * Math.sin(b.phase)) : Math.abs(Math.sin(b.phase)) * h * 0.025;
        node.style.transform = `translate(${px - w / 2}px, ${py - h}px)`;
        node.style.width = `${w}px`;
        node.style.height = `${h}px`;
        node.style.zIndex = String(10 + Math.round(b.y * 1000));
        const body = node.firstElementChild as HTMLElement | null; // 위: 이름·HP + 그림
        if (body) body.style.transform = `translateY(${-lift}px)`;
        const img = node.querySelector('img');
        if (img) img.style.transform = `scaleX(${b.face}) rotate(${b.fly ? Math.sin(b.phase) * 3 : Math.sin(b.phase) * 1.5}deg)`;
        const label = node.querySelector<HTMLElement>('[data-label]');
        if (label) label.style.fontSize = `${Math.max(10, Math.min(18, h * 0.12))}px`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cur = FIELDS.find((f) => f.key === field)!;

  return (
    <main className={`field-root field-${field} fixed inset-0 overflow-hidden text-white select-none`} style={{ wordBreak: 'keep-all' }}>
      {/* 배경 (필드마다) */}
      <div className="field-sky absolute inset-0" aria-hidden />
      <div className="field-deco absolute inset-0" aria-hidden />
      <div className="field-ground absolute inset-x-0 bottom-0" style={{ top: `${BELT_TOP * 100 - 4}%` }} aria-hidden />

      {/* 위: 제목 + 필드 고르기 */}
      <header className="absolute top-0 inset-x-0 z-[2000] flex flex-wrap items-center justify-center gap-[1.4vmin] pt-[2vmin] px-4">
        <BrandMark size={40} />
        <p className="text-[3.8vmin] font-black drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
          {cur.emoji} <span className="text-amber-300">{cur.label} 필드</span>에 모인 우리 곤충들
        </p>
        <span className="rounded-full bg-amber-400 px-[1.6vmin] py-[0.3vmin] text-[2.6vmin] font-black text-slate-900">
          {ready}
          {total > ready ? ` / ${total}` : ''}마리
        </span>
        <div className="flex gap-1.5">
          {FIELDS.map((f) => (
            <button
              key={f.key}
              onClick={() => setField(f.key)}
              className={`rounded-full px-3 py-1 text-[2.2vmin] font-black border ${f.key === field ? 'bg-white text-slate-900 border-white' : 'bg-black/40 border-white/40'}`}
            >
              {f.emoji} {f.label}
            </button>
          ))}
        </div>
      </header>
      {total > ready && (
        <p className="absolute top-[11vmin] inset-x-0 z-[2000] text-center text-[2.4vmin] font-bold text-amber-100 drop-shadow">
          ✂️ 곤충들이 필드로 오는 중… ({ready}/{total}) 처음 한 번만 조금 걸려!
        </p>
      )}
      {total === 0 && (
        <p className="absolute top-[30%] inset-x-0 z-[2000] text-center text-[3.6vmin] font-bold">아직 만든 곤충이 없어. 첫 번째 주인공이 되어봐! 🖍️</p>
      )}

      {/* 곤충들 */}
      <div ref={box} className="absolute inset-0">
        {bugs.current.map((b) => (
          <div
            key={b.info.id}
            ref={(el) => {
              if (el) nodes.current.set(b.info.id, el);
              else nodes.current.delete(b.info.id);
            }}
            className="field-bug absolute left-0 top-0"
          >
            <div className="absolute inset-0">
              {/* 머리 위: 이름 + HP 바 */}
              <div data-label className="absolute left-1/2 bottom-full -translate-x-1/2 mb-1 flex flex-col items-center whitespace-nowrap">
                <span className="font-black leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                  {b.info.nickname} <span className="text-amber-300">Lv.{b.info.level}</span>
                </span>
                <span className="mt-[2px] block h-[0.45em] w-[5.5em] rounded-full bg-black/60 border border-black/70 overflow-hidden">
                  <span className="block h-full bg-gradient-to-r from-emerald-400 to-lime-300" style={{ width: `${b.hp * 100}%` }} />
                </span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt="" className="absolute inset-0 w-full h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]" draggable={false} />
            </div>
            {/* 땅 그림자 (날아도 땅에) */}
            <span className="field-shadow absolute left-1/2 -translate-x-1/2" aria-hidden />
          </div>
        ))}
      </div>

      <footer className="absolute bottom-[1.4vmin] inset-x-0 z-[2000] text-center text-[2.4vmin] font-black text-amber-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        🤖 AI를 재미있게 배우는 G7BB! · 📷 종이에 그리고 QR을 찍으면 너도 이 필드에!
      </footer>
    </main>
  );
}
