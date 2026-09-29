'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CoreStats } from '@/lib/types';
import { ENVIRONMENTS } from '@/lib/environments';
import { specialMoveFor } from '@/lib/special-moves';
import { tierForVisit } from '@/lib/card';

// 아이에게 보여주고 출력해 줄 곤충 카드 한 장입니다.
//
// ⚠️ **글자·레벨·능력치는 AI가 아니라 이 컴포넌트가 그립니다.**
// 2026-09-29 에 새 이미지 모델이 그림 안에 `LV. 9 / 9000` 같은 **가짜 글자**를 그려 넣었습니다.
// AI가 그리는 글자는 매번 위치도 내용도 달라지고 한글은 거의 깨집니다.
// Jin 이 원한 것은 "모든 카드가 통일되는 것"인데, 그건 앱이 그려야만 가능합니다.
// 그래서 `convert-insect` 프롬프트에서 글자를 금지하고, 여기서 얹습니다.
//
// 이렇게 하면 덤으로:
// - **레벨이 진짜 현재 레벨**을 따라갑니다 (배틀하면 오르는데, 그림에 구우면 1레벨에 멈춥니다)
// - **원본 그림이 깨끗하게 남습니다** → 1위 상품 포스터·피규어는 글자 없는 원본이 필요합니다

const STAT_ROWS: { key: keyof CoreStats; label: string; color: string }[] = [
  { key: 'atk', label: '공격력', color: '#f87171' },
  { key: 'def', label: '수비력', color: '#60a5fa' },
  { key: 'hp', label: 'HP', color: '#4ade80' },
  { key: 'surv', label: '생존', color: '#fbbf24' },
  { key: 'int', label: '지능', color: '#c084fc' },
];

export interface InsectCardData {
  nickname: string;
  species: string | null;
  origin: string | null;
  stats: CoreStats;
  level: number;
  image: string;
  mime: string;
  /** 종이 번호(A-014). 카드 QR 이 이 번호로 돌아옵니다. */
  ticketCode: string | null;
  /** 그 아이의 몇 번째 곤충인지. 1이면 첫 카드. */
  visit: number;
}

export default function InsectCard({ data }: { data: InsectCardData }) {
  const [qr, setQr] = useState('');
  const tier = tierForVisit(data.visit);
  const move = specialMoveFor(data.stats);
  const env = ENVIRONMENTS.find((e) => e.key === data.origin || e.label === data.origin);

  useEffect(() => {
    if (!data.ticketCode) return;
    const url = `${window.location.origin}/start?t=${data.ticketCode}`;
    // 카드를 들고 다시 오면 이 QR 하나로 원래 아이로 이어집니다. (회차가 자동으로 올라갑니다)
    QRCode.toDataURL(url, { margin: 0, width: 160 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [data.ticketCode]);

  return (
    <div className="w-full max-w-[340px] mx-auto">
      {/* 테두리 = 등급. 안쪽에 실제 카드를 얹습니다. */}
      <div
        className={`rounded-2xl p-[5px] shadow-2xl ${tier.holographic ? 'holo-frame' : ''}`}
        style={{ background: tier.frame }}
      >
        <div className="rounded-xl overflow-hidden bg-slate-950 relative">
          {/* ── 그림 + 그 위에 얹는 정보 ── */}
          <div className="relative aspect-[4/5] bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${data.mime};base64,${data.image}`}
              alt={data.nickname}
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* 닉네임이 밝은 그림 위에 올라가도 읽히도록 아래쪽을 어둡게 깔아줍니다. */}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/85 to-transparent" />

            {/* 왼쪽 위 — 현재 레벨 */}
            <div
              className="absolute top-2 left-2 rounded-lg px-2.5 py-1 font-black text-sm leading-none shadow-lg"
              style={{ background: tier.frame, color: tier.ink }}
            >
              LV.{data.level}
            </div>

            {/* 오른쪽 위 — 출신지 로고 */}
            {env && (
              <div className="absolute top-2 right-2 flex flex-col items-center">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-xl shadow-lg border-2"
                  style={{ background: 'rgba(2,6,23,0.72)', borderColor: tier.ink }}
                >
                  {env.emoji}
                </div>
                <span className="mt-0.5 text-[9px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  {env.label}
                </span>
              </div>
            )}

            {/* 왼쪽 아래 — 닉네임 (제일 잘 보여야 하는 것) */}
            <div className="absolute left-3 bottom-2 right-3">
              <div className="text-2xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] leading-tight break-keep">
                {data.nickname}
              </div>
              {data.species && (
                <div className="text-[11px] font-semibold text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                  {data.species}
                </div>
              )}
            </div>
          </div>

          {/* ── 필살기 + 능력치 ── */}
          <div className="px-3 pt-2.5 pb-3 bg-slate-950">
            <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-2.5 py-1.5 mb-2">
              <span className="text-lg leading-none">{move.emoji}</span>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-amber-300 leading-tight">{move.name}</div>
                <div className="text-[10px] text-slate-400 leading-tight truncate">{move.description}</div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {STAT_ROWS.map((row) => (
                <div key={row.key} className="flex items-center gap-1.5">
                  <span className="w-11 shrink-0 text-[10px] font-semibold text-slate-400">
                    {row.label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${data.stats[row.key]}%`, background: row.color }}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-right text-[10px] font-bold text-slate-200">
                    {data.stats[row.key]}
                  </span>
                </div>
              ))}
            </div>

            {/* ── 번호 + QR ── */}
            {data.ticketCode && (
              <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-base font-black tracking-wider text-slate-200">
                    {data.ticketCode}
                  </div>
                  <div className="text-[9px] text-slate-500 leading-tight">
                    또 만들고 싶으면 이 QR을 찍어줘
                  </div>
                </div>
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={data.ticketCode} className="w-12 h-12 rounded bg-white p-0.5" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-xs font-semibold" style={{ color: '#94a3b8' }}>
        {tier.label}
      </p>

      <style jsx global>{`
        /* 홀로그램: 무지개 테두리 위로 빛이 흐르는 것처럼 보이게 합니다.
           그림 자체는 건드리지 않고 테두리에만 씌워서, 곤충이 이상한 색으로 물들지 않습니다. */
        .holo-frame {
          position: relative;
        }
        .holo-frame::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 1rem;
          background: linear-gradient(
            115deg,
            transparent 30%,
            rgba(255, 255, 255, 0.85) 45%,
            transparent 60%
          );
          background-size: 280% 280%;
          animation: holo-sweep 3.4s linear infinite;
          pointer-events: none;
          mix-blend-mode: overlay;
        }
        @keyframes holo-sweep {
          0% {
            background-position: 0% 0%;
          }
          100% {
            background-position: 280% 280%;
          }
        }
        /* 어지러움을 타는 기기에서는 빛 흐름을 멈춥니다. */
        @media (prefers-reduced-motion: reduce) {
          .holo-frame::before {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
