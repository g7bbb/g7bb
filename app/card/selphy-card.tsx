'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { statBarPercent } from '@/lib/insect-stats';
import { ENVIRONMENTS } from '@/lib/environments';
import { baseMoveFor, secondMoveFor, SECOND_MOVE_LEVEL } from '@/lib/special-moves';
import { tierForVisit } from '@/lib/card';
import type { InsectCardData } from './insect-card';

// 🖨️ 캐논 셀피(CP1500) 카드 용지(54×86mm)에 딱 맞춘 인쇄용 카드 (2026-10-02 Jin).
//
// 앱 카드는 세로가 가로의 2.1배라 셀피 카드(1.6배)로 뽑으면 위아래가 잘렸다 (LV·회피력·QR 이 날아감).
// 그래서 처음부터 54:86 으로 그린다. 화면 1px = 0.1mm (540×860), 저장할 때 2배 → 1080×1720 (약 500dpi).
//
// - 테두리 없이(가장자리까지) 뽑으면 프린터가 1~2mm 를 먹는다 → 글자는 가장자리에서 **3mm(30px) 안쪽**에만.
// - 곤충 그림은 원래 정사각형이라 위쪽 54×54mm 에 **통째로** 들어간다 (앱 카드보다 덜 잘림).
// - 등급 색은 테두리 대신 그림 아래 띠·LV 에만 쓴다 (테두리는 가장자리라 고르지 않게 잘려 보인다).

export const SELPHY_W = 540;
export const SELPHY_H = 860;
const SAFE = 36; // 가장자리 안전 여백 (3.6mm)

const STAT_ROWS: { key: 'atk' | 'def' | 'hp' | 'int' | 'eva'; label: string; color: string }[] = [
  { key: 'hp', label: 'HP', color: '#4ade80' },
  { key: 'atk', label: '공격력', color: '#f87171' },
  { key: 'def', label: '수비력', color: '#60a5fa' },
  { key: 'int', label: '지능', color: '#c084fc' },
  { key: 'eva', label: '회피력', color: '#38bdf8' },
];

export default function SelphyCard({ data }: { data: InsectCardData }) {
  const [qr, setQr] = useState('');
  const tier = tierForVisit(data.visit);
  const move = baseMoveFor(data.species);
  const move2 = secondMoveFor(data.species, data.level);
  const locked = move2 ? null : secondMoveFor(data.species, SECOND_MOVE_LEVEL);
  const env = ENVIRONMENTS.find((e) => e.key === data.origin || e.label === data.origin);
  const sub = [data.ownerName && data.ownerName !== data.nickname ? data.ownerName : null, data.species]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (!data.ticketCode) return;
    const url = `${data.qrOrigin ?? window.location.origin}/start?t=${data.ticketCode}`;
    QRCode.toDataURL(url, { margin: 1, width: 400 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [data.ticketCode, data.qrOrigin]);

  const moves = [move, move2].filter(Boolean);

  return (
    <div
      style={{
        width: SELPHY_W,
        height: SELPHY_H,
        position: 'relative',
        overflow: 'hidden',
        background: tier.panel ?? '#020617',
        color: '#fff',
        fontFamily: 'inherit',
        wordBreak: 'keep-all',
      }}
    >
      {/* ── 그림 (정사각형 통째로) ── */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: SELPHY_W, height: SELPHY_W }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.imageSrc ?? `data:${data.mime};base64,${data.image}`}
          alt={data.nickname}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '42%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
          }}
        />

        {/* 왼쪽 위 — 레벨 */}
        <div
          style={{
            position: 'absolute',
            top: SAFE,
            left: SAFE,
            padding: '8px 16px',
            borderRadius: 12,
            fontSize: 34,
            fontWeight: 900,
            lineHeight: 1,
            background: tier.frame,
            color: tier.ink,
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          LV.{data.level}
        </div>

        {/* 오른쪽 위 — 출신지 */}
        {env && (
          <div style={{ position: 'absolute', top: SAFE - 4, right: SAFE, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 34,
                background: 'rgba(2,6,23,0.72)',
                border: `3px solid ${tier.ink}`,
              }}
            >
              {env.emoji}
            </div>
            <span style={{ marginTop: 3, fontSize: 15, fontWeight: 800, textShadow: '0 1px 3px #000' }}>{env.label}</span>
          </div>
        )}

        {/* 왼쪽 아래 — 곤충 이름 */}
        <div style={{ position: 'absolute', left: SAFE, right: SAFE, bottom: 14 }}>
          <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1.05, textShadow: '0 2px 5px rgba(0,0,0,0.95)' }}>
            {data.nickname}
          </div>
          {sub && <div style={{ fontSize: 19, fontWeight: 700, color: '#cbd5e1', marginTop: 3 }}>{sub}</div>}
        </div>
      </div>

      {/* 등급 띠 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: SELPHY_W, height: 6, background: tier.frame }} />

      {/* ── 아래: 필살기 · 능력치 · QR ── */}
      <div
        style={{
          position: 'absolute',
          left: SAFE,
          right: SAFE,
          top: SELPHY_W + 6 + 16,
          bottom: SAFE,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {moves.map((m) => (
            <div
              key={m!.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0f172a', borderRadius: 10, padding: '8px 10px', minWidth: 0 }}
            >
              <span style={{ fontSize: 26, lineHeight: 1 }}>{m!.emoji}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m!.name}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8' }}>{m!.kind === 'attack' ? '⚔️ 공격' : '🛡️ 수비'}</div>
              </div>
            </div>
          ))}
          {locked && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: '2px dashed #475569',
                borderRadius: 10,
                padding: '6px 10px',
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 24, lineHeight: 1 }}>🔒</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.15, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {locked.name}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fcd34d' }}>LV{SECOND_MOVE_LEVEL}부터 열려!</div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STAT_ROWS.map((row) => (
              <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 60, fontSize: 17, fontWeight: 700, color: '#cbd5e1' }}>{row.label}</span>
                <div style={{ flex: 1, height: 9, borderRadius: 5, background: '#1e293b', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${statBarPercent(row.key, data.stats[row.key])}%`,
                      background: row.color,
                      borderRadius: 5,
                    }}
                  />
                </div>
                <span style={{ width: 40, textAlign: 'right', fontSize: 18, fontWeight: 900 }}>{data.stats[row.key]}</span>
              </div>
            ))}
            {!!data.stats.grit && (
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fcd34d' }}>💪 성실함 +{data.stats.grit}</div>
            )}
          </div>

          {data.ticketCode && (
            <div style={{ width: 112, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={data.ticketCode} style={{ width: 112, height: 112, background: '#fff', borderRadius: 6 }} />
              )}
              <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: 1 }}>{data.ticketCode}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
