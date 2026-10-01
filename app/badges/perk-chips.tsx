import { badgePerks } from '@/lib/badges';

/** 지금 받고 있는 버프 */
export function PerkChips({ count }: { count: number }) {
  const p = badgePerks(count);
  const chips = [
    p.hp > 1 && `💚 HP +${Math.round((p.hp - 1) * 100)}%`,
    p.def > 1 && `🛡️ 수비 +${Math.round((p.def - 1) * 100)}%`,
    p.special > 1 && `⚡ 필살기 +${Math.round((p.special - 1) * 100)}%`,
  ].filter(Boolean) as string[];
  if (!chips.length) return <p className="mt-2 text-xs text-slate-400">뱃지 10개부터 배틀이 세져! (버프)</p>;
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
      {chips.map((c) => (
        <span key={c} className="text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full">
          {c}
        </span>
      ))}
    </div>
  );
}

