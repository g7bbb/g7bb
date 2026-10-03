'use client';

import { PlayStatus, formatCountdown } from '@/lib/game-state';
import { ROUNDS_PER_GAME, gamesLabel } from '@/lib/tiers';

/** 내 참가권 · 남은 게임 · 30분 대기 시계 */
export default function PlayStatusCard({ status }: { status: PlayStatus }) {
  const { tier } = status;
  const leftText = Number.isFinite(status.left) ? `남은 게임 ${status.left} (${status.left * ROUNDS_PER_GAME}판)` : '무제한';
  return (
    <div className="bg-slate-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-2">
      <span className="font-bold">
        {tier.emoji} {tier.price} · {gamesLabel(tier)}
      </span>
      <span className="text-right">
        <span className="block text-slate-300">{leftText}</span>
        {status.ladderPending ? (
          <span className="block text-emerald-300 text-xs">지금 랭킹 도전 가능!</span>
        ) : status.left <= 0 ? (
          <span className="block text-slate-400 text-xs">게임 끝! 수고했어</span>
        ) : status.cooldownMs > 0 ? (
          <span className="block text-amber-300 text-xs font-bold">⏳ {formatCountdown(status.cooldownMs)} 뒤 다음 게임</span>
        ) : (
          <span className="block text-emerald-300 text-xs">지금 게임 가능!</span>
        )}
      </span>
    </div>
  );
}
