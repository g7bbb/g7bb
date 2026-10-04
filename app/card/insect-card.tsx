'use client';

import { displayTicket } from '@/lib/ticket';
import { statBarPercent } from '@/lib/insect-stats';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CoreStats } from '@/lib/types';
import { ENVIRONMENTS } from '@/lib/environments';
import { baseMoveFor, secondMoveFor, SECOND_MOVE_LEVEL } from '@/lib/special-moves';
import { auraClass, frameShines, tierForVisit } from '@/lib/card';

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

// 2026-09-30: 생존능력이 HP 로 합쳐지고 회피력이 들어왔다 (lib/insect-stats.ts 참고).
const STAT_ROWS: { key: 'atk' | 'def' | 'hp' | 'int' | 'eva'; label: string; color: string }[] = [
  { key: 'hp', label: 'HP', color: '#4ade80' },
  { key: 'atk', label: '공격력', color: '#f87171' },
  { key: 'def', label: '수비력', color: '#60a5fa' },
  { key: 'int', label: '지능', color: '#c084fc' },
  { key: 'eva', label: '회피력', color: '#38bdf8' },
];

export interface InsectCardData {
  /** 곤충 이름. 아이가 안 지었으면 아이 이름이 그대로 들어옵니다. */
  nickname: string;
  /** 곤충을 만든 아이 이름. 곤충 이름과 같으면 아래에 또 쓰지 않습니다. */
  ownerName?: string | null;
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
  /** 인쇄용 (직원 화면 `/admin/poster`): 고화질 그림 주소 · QR 주소 고정 · 아래 등급 글씨 숨김 */
  imageSrc?: string;
  qrOrigin?: string;
  /** 🔐 비밀번호 4자리 — 있으면 QR 에 넣어 찍자마자 들어오게 (lib/ticket-pin.ts) */
  qrPin?: string | null;
  hideLabel?: boolean;
}

export default function InsectCard({ data }: { data: InsectCardData }) {
  const [qr, setQr] = useState('');
  const tier = tierForVisit(data.visit, data.level);
  // 필살기는 **곤충 종류**로 정해집니다 (2026-09-29 Jin 재설계).
  // 전에는 가장 높은 능력치로 정했는데, 이제 사슴벌레는 큰턱공격처럼 그 곤충다운 기술이 나옵니다.
  const move = baseMoveFor(data.species);
  // LV3부터 반대 형(공격↔수비)의 공통기가 하나 더 열립니다.
  const move2 = secondMoveFor(data.species, data.level);
  // 아직 안 열렸으면 잠긴 버튼처럼 보여준다 — "LV3부터 열려!" (2026-10-02 Jin)
  const locked = move2 ? null : secondMoveFor(data.species, SECOND_MOVE_LEVEL);
  const env = ENVIRONMENTS.find((e) => e.key === data.origin || e.label === data.origin);

  useEffect(() => {
    if (!data.ticketCode) return;
    // 인쇄용은 qrOrigin(SITE_URL)으로 고정한다 — 종이와 같은 규칙 (lib/site.ts 참고).
    const url = `${data.qrOrigin ?? window.location.origin}/start?t=${data.ticketCode}${data.qrPin ? `&k=${data.qrPin}` : ''}`;
    // 카드를 들고 다시 오면 이 QR 하나로 원래 아이로 이어집니다. (회차가 자동으로 올라갑니다)
    QRCode.toDataURL(url, { margin: 0, width: data.qrOrigin ? 400 : 160 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [data.ticketCode, data.qrOrigin, data.qrPin]);

  return (
    <div className="w-full max-w-[21.25rem] mx-auto">
      {/* 테두리 = 등급. 안쪽에 실제 카드를 얹습니다. */}
      <div
        className={`rounded-2xl p-[5px] shadow-2xl ${frameShines(tier) ? 'holo-frame' : ''} ${auraClass(tier)}`}
        style={{ background: tier.frame }}
      >
        <div className="rounded-xl overflow-hidden bg-slate-950 relative">
          {/* ── 그림 + 그 위에 얹는 정보 ── */}
          <div className="relative aspect-[4/5] bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.imageSrc ?? `data:${data.mime};base64,${data.image}`}
              alt={data.nickname}
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* 닉네임이 밝은 그림 위에 올라가도 읽히도록 아래쪽을 어둡게 깔아줍니다. */}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/85 to-transparent" />

            {/* 왼쪽 위 — 현재 레벨 */}
            <div
              // Jin 요청 (2026-09-29): "레벨 글씨가 한 20% 커져도 좋을 것 같은데"
              // text-sm(14px) → 17px 로 약 21% 키우고, 여백도 같이 올려 답답해 보이지 않게 함.
              className="absolute top-2 left-2 rounded-lg px-3 py-1.5 font-black text-[1.0625rem] leading-none shadow-lg"
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
                <span className="mt-0.5 text-[0.5625rem] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  {env.label}
                </span>
              </div>
            )}

            {/* 왼쪽 아래 — 닉네임 (제일 잘 보여야 하는 것) */}
            <div className="absolute left-3 bottom-2 right-3">
              <div className="text-2xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] leading-tight break-keep">
                {data.nickname}
              </div>
              {/* 곤충 이름 아래 한 줄: `아이이름 · 종류`.
                  이름을 안 지어서 곤충 이름 = 아이 이름이면 같은 말을 두 번 쓰지 않습니다. */}
              <div className="text-[0.6875rem] font-semibold text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {[data.ownerName && data.ownerName !== data.nickname ? data.ownerName : null, data.species]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>

          {/* ── 필살기 + 능력치 ── */}
          <div className="px-3 pt-2.5 pb-3 bg-slate-950" style={tier.panel ? { background: tier.panel } : undefined}>
            <div className="flex flex-col gap-1 mb-2">
              {[move, move2].filter(Boolean).map((m, i) => (
                <div
                  key={m!.key}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 px-2.5 py-1.5"
                >
                  <span className="text-lg leading-none">{m!.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[0.8125rem] font-bold leading-tight ${m!.textColor}`}>
                      {m!.name}
                    </div>
                    <div className="text-[0.625rem] text-slate-400 leading-tight truncate">
                      {m!.description}
                    </div>
                  </div>
                  {/* 공격형/수비형을 한눈에 구분해줍니다. */}
                  <span className="shrink-0 text-[0.5625rem] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {m!.kind === 'attack' ? '공격' : '수비'}
                  </span>
                  {i === 1 && (
                    <span className="shrink-0 text-[0.5625rem] font-bold text-emerald-400">LV3</span>
                  )}
                </div>
              ))}
              {locked && (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-900/40 px-2.5 py-1.5">
                  <span className="text-lg leading-none">🔒</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.8125rem] font-bold leading-tight text-slate-500">{locked.name}</div>
                    <div className="text-[0.625rem] font-bold text-amber-300/90 leading-tight">
                      LV{SECOND_MOVE_LEVEL}부터 열려!
                    </div>
                  </div>
                  <span className="shrink-0 text-[0.5625rem] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                    {locked.kind === 'attack' ? '공격' : '수비'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              {STAT_ROWS.map((row) => (
                <div key={row.key} className="flex items-center gap-1.5">
                  <span className="w-11 shrink-0 text-[0.625rem] font-semibold text-slate-400">
                    {row.label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${statBarPercent(row.key, data.stats[row.key])}%`, background: row.color }}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-right text-[0.625rem] font-bold text-slate-200">
                    {data.stats[row.key]}
                  </span>
                </div>
              ))}
              {/* 성실함 — 육감이 낮을 때만 생기는 특별 능력치 */}
              {!!data.stats.grit && (
                <div className="text-[0.625rem] font-bold text-amber-300">
                  💪 성실함 +{data.stats.grit} <span className="font-normal text-slate-400">맞아도 꾹 참아!</span>
                </div>
              )}
            </div>

            {/* ── 번호 + QR ── */}
            {data.ticketCode && (
              <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-base font-black tracking-wider text-slate-200">
                    {displayTicket(data.ticketCode)}
                  </div>
                  <div className="text-[0.5625rem] text-slate-500 leading-tight">
                    다시 올 때 이 QR을 찍어줘
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

      {!data.hideLabel && (
        <p className="mt-2 text-center text-xs font-semibold" style={{ color: '#94a3b8' }}>
          {tier.label}
        </p>
      )}

    </div>
  );
}
