'use client';

import { createPortal } from 'react-dom';
import { tierForPlayer } from '@/lib/tiers';

// 🆙 "레벨업이 중요해!" 안내 (10/4 Jin: "레벨업이 많이 돼야 수액을 차지하는 랭킹에 올라갈 수 있어!! 를 몇 번 보여줘 /
//    졌을 때도 '레벨업이 필요해..ㅠ' 팝업")
// 보여주는 곳: ① 곤충 카드 화면(/card) 상자 ② 배틀 준비 화면 — 그 아이 처음 한 번 팝업 + 늘 띠
// ③ 배틀에서 졌을 때 팝업 (아래 LoseLevelPopup)

export const LEVELUP_HEADLINE = '레벨업이 많이 돼야 수액을 차지하는 랭킹에 올라갈 수 있어!!';

/** 레벨을 올리는 방법 — 아이 말투 */
export const LEVELUP_WAYS = [
  '⚔️ 배틀을 하면 경험치가 쌓여 (이겨도 져도!)',
  '🎁 보너스 스테이지에서 레벨 1 업이 나올 수 있어',
  '🔁 다시 와서 QR 을 찍으면 레벨이 올라',
  '👨‍👩‍👧 친구·가족이랑 같이 하면 경험치 +10%',
];

/** 1.5만원 아이에게만: 레벨업권(2만원) 안내 (Jin: "2만원 게임을 할 수밖에 없게") */
export function levelUpUpsell(player: { ticket_code?: string | null; survey?: unknown } | null | undefined): string | null {
  if (!player) return null;
  return tierForPlayer(player).key === 'A' ? '⬆️ 레벨업권이면 레벨업 보너스 게임이 무조건 나와! 선생님께 물어봐' : null;
}

const SEEN_KEY = 'g7bb-levelup-tip:';

/** 이 아이에게 처음 팝업을 보여줬는지 (기기 기억, 실패하면 그냥 또 보여줌) */
export function levelTipSeen(playerId: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY + playerId) === '1';
  } catch {
    return false;
  }
}
export function markLevelTipSeen(playerId: string) {
  try {
    window.localStorage.setItem(SEEN_KEY + playerId, '1');
  } catch {
    // 기억 못 해도 그만
  }
}

function Shell({ children, onClose, tone }: { children: React.ReactNode; onClose: () => void; tone: 'gold' | 'blue' }) {
  if (typeof document === 'undefined') return null;
  const border = tone === 'gold' ? 'border-amber-300 shadow-[0_0_40px_rgba(251,191,36,0.45)]' : 'border-sky-400 shadow-[0_0_40px_rgba(56,189,248,0.4)]';
  return createPortal(
    <div className="fixed inset-0 z-[82] flex items-center justify-center bg-black/80 px-5" onClick={onClose}>
      <div
        className={`animate-pop w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-3xl border-2 bg-slate-900 p-5 flex flex-col gap-3 text-center ${border}`}
        style={{ wordBreak: 'keep-all' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

/** 처음 배틀 준비 화면에 왔을 때 한 번 */
export function LevelUpIntroPopup({ onClose, upsell }: { onClose: () => void; upsell: string | null }) {
  return (
    <Shell onClose={onClose} tone="gold">
      <p className="text-5xl">🆙</p>
      <p className="text-2xl font-black text-amber-300 leading-snug">{LEVELUP_HEADLINE}</p>
      <p className="text-base text-slate-200">레벨이 높을수록 능력치가 세지고, LV3 부터는 필살기가 하나 더 생겨!</p>
      <ul className="text-left text-base flex flex-col gap-1.5 bg-slate-800 rounded-2xl px-4 py-3">
        {LEVELUP_WAYS.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      {upsell && <p className="text-sm font-bold text-emerald-300">{upsell}</p>}
      <button type="button" onClick={onClose} className="mt-1 bg-amber-400 text-slate-900 font-black py-3.5 rounded-2xl text-lg">
        알겠어! 레벨업 하러 가자 🔥
      </button>
    </Shell>
  );
}

/** 배틀에서 졌을 때 */
export function LoseLevelPopup({ onClose, upsell }: { onClose: () => void; upsell: string | null }) {
  return (
    <Shell onClose={onClose} tone="blue">
      <p className="text-5xl">😢</p>
      <p className="text-3xl font-black text-sky-300">레벨업이 필요해..ㅠ</p>
      <p className="text-base text-slate-200">{LEVELUP_HEADLINE}</p>
      <ul className="text-left text-sm flex flex-col gap-1 bg-slate-800 rounded-2xl px-4 py-3">
        {LEVELUP_WAYS.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      {upsell && <p className="text-sm font-bold text-emerald-300">{upsell}</p>}
      <button type="button" onClick={onClose} className="mt-1 bg-sky-400 text-slate-900 font-black py-3.5 rounded-2xl text-lg">
        다시 힘내자! 💪
      </button>
    </Shell>
  );
}
