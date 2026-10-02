'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { rememberPlayer } from '@/lib/session';
import { Insect, Player } from '@/lib/types';
import { statsForInsect } from '@/lib/insect-stats';
import { XpGain, addXp, levelProgress, revisitXpRate, xpDisplay } from '@/lib/leveling';
import { ALLOC_STATS, Alloc, AllocKey, POINTS_PER_LEVELUP, addAlloc, allocPerLabel, allocTotal, applyAlloc, readAlloc } from '@/lib/alloc';
import { awardBadges, blockedMessage, checkIn, friendXpMultiplier, playStatus } from '@/lib/game-state';
import PlayStatusCard from '@/app/play-status';
import { BrandLogo, BrandMark } from '@/app/brand-logo';
import { playSound, unlockAudio } from '@/lib/sfx';

// ─────────────────────────────────────────────────────────────
// 다시 온 아이 (카드·종이의 QR 을 찍고 들어온 경우) — 2026-10-01 Jin 설계
//
//   새 게임을 할 수 있으면 → "새로운 곤충을 만들래?"
//       응   → 새 곤충 만들기 (이번 게임에 곤충 하나)
//       아니 → "환영해!! 더 강해진 뒤, 수액을 차지하자!!" 레벨업 + 포인트를 아이가 직접 나눔
//   30분이 안 지났거나 게임을 다 했으면 → 남은 시간 / 다 했다는 안내만
//
// 게임 횟수·30분 규칙은 lib/game-state.ts, 금액별 횟수는 lib/tiers.ts.
// ─────────────────────────────────────────────────────────────

type LatestInsect = Pick<
  Insect,
  'id' | 'nickname' | 'species' | 'origin' | 'age_stage' | 'body_parts' | 'mutations' | 'stats' | 'level' | 'xp'
> & { image?: string };

export default function Returning({ player: initial, onNotMe }: { player: Player; onNotMe: () => void }) {
  const router = useRouter();
  const [player, setPlayer] = useState(initial);
  const [insect, setInsect] = useState<LatestInsect | null>(null);
  const [insectCount, setInsectCount] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [leveling, setLeveling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 그림이 무거워서 목록은 그림 없이, 제일 최근 곤충 그림만 따로 받습니다.
      const { data } = await supabase
        .from('insects')
        .select('id, nickname, species, origin, age_stage, body_parts, mutations, stats, level, xp')
        .eq('player_id', initial.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      const rows = (data || []) as LatestInsect[];
      setInsectCount(rows.length);
      if (!rows[0]) return;
      setInsect(rows[0]);
      const { data: img } = await supabase
        .from('insects')
        .select('image_base64, mime_type')
        .eq('id', rows[0].id)
        .maybeSingle();
      if (!cancelled && img?.image_base64) {
        setInsect({ ...rows[0], image: `data:${img.mime_type || 'image/jpeg'};base64,${img.image_base64}` });
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial.id]);

  const status = playStatus(player, now);
  const last = status.state.sessions[status.state.sessions.length - 1];

  function go(path: string) {
    rememberPlayer(player.id);
    playSound('next'); // 다음 장으로 (Jin 효과음)
    router.push(path);
  }

  async function chooseNewInsect() {
    unlockAudio(['next']);
    setBusy(true);
    setError('');
    try {
      setPlayer(await checkIn(player.id, { newInsect: true }));
      void awardBadges(player.id, ['revisit']);
      go('/upload');
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (leveling && insect) {
    return (
      <LevelUp
        insect={insect}
        xpBonus={friendXpMultiplier(player)}
        onCancel={() => setLeveling(false)}
        onDone={async (alloc, gain) => {
          // 먼저 게임을 엽니다(30분·횟수 확인). 막히면 레벨업도 하지 않습니다.
          const updated = await checkIn(player.id, { leveled: true });
          setPlayer(updated);
          // LV5 까지는 올 때마다 한 번에 레벨업, 그 뒤로는 50% · 30% 씩 (lib/leveling.ts)
          const stats = { ...(insect.stats as any), alloc: addAlloc(readAlloc(insect.stats), alloc) };
          const { error: updateError } = await supabase
            .from('insects')
            .update({ level: gain.level, xp: gain.xp, stats })
            .eq('id', insect.id);
          if (updateError) throw updateError;
          void awardBadges(player.id, gain.levelsUp > 0 ? ['revisit', 'levelUp'] : ['revisit']);
          go('/battle');
        }}
      />
    );
  }

  // ── 지금 무엇을 할 수 있는지에 따라 큰 버튼 하나를 고릅니다 ──
  let main: React.ReactNode = null;
  if (insectCount === null) {
    main = <p className="text-center text-sm text-slate-400">내 곤충을 불러오는 중...</p>;
  } else if (insectCount === 0 || (last?.newInsect && !last.insectMade)) {
    // 아직 곤충이 없거나, 이번 게임에서 새 곤충을 만들기로 하고 아직 안 만든 경우
    main = <BigButton onClick={() => go('/upload')}>곤충 만들러 가기</BigButton>;
  } else if (status.ladderPending || status.used === 0) {
    // 이미 시작한 게임이 남아 있거나, 곤충만 만들고 첫 게임을 아직 안 한 경우
    main = <BigButton onClick={() => go('/battle')}>배틀하러 가기</BigButton>;
  } else if (status.canStartNew) {
    main = (
      <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3" style={{ wordBreak: 'keep-all' }}>
        <p className="text-center font-bold text-lg">🎨 새로운 곤충을 만들래?</p>
        <button
          onClick={chooseNewInsect}
          disabled={busy}
          className="bg-sky-500 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
        >
          응, 새로 만들래!
        </button>
        <button
          onClick={() => {
            unlockAudio(['levelUp', 'next']); // 누른 순간에 소리를 깨워둡니다 (폰 정책)
            setLeveling(true);
          }}
          disabled={busy || !insect}
          className="bg-emerald-500 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
        >
          아니, {insect?.nickname ?? '내 곤충'} 키울래! ⬆️
        </button>
        <p className="text-xs text-slate-400 text-center">
          키우면 경험치를 받아! 레벨이 오르면 강해질 능력치를 내가 직접 골라!
        </p>
      </div>
    );
  } else {
    main = (
      <div className="bg-slate-800 rounded-2xl p-4 text-center text-sm text-amber-300" style={{ wordBreak: 'keep-all' }}>
        {blockedMessage(status)}
      </div>
    );
  }

  return (
    <main className="max-w-md mx-auto min-h-screen px-6 py-10 flex flex-col gap-5 justify-center">
      <div className="text-center">
        <BrandLogo size={100} className="mb-3" />
        <h1 className="text-2xl font-bold">
          <span className="text-amber-400">{player.display_name}</span> 다시 왔구나!
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          내 번호 <b className="text-slate-200">{player.ticket_code}</b> 로 이어서 할게. 이름이랑 질문은 다시 안 물어볼게 😉
        </p>
      </div>

      <PlayStatusCard status={status} />

      {main}
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      <div className="grid grid-cols-3 gap-2 text-sm">
        <a href="/card" onClick={() => rememberPlayer(player.id)} className="text-center bg-slate-800 font-semibold py-3 rounded-xl">
          🃏 내 카드
        </a>
        <a href="/badges" onClick={() => rememberPlayer(player.id)} className="text-center bg-slate-800 font-semibold py-3 rounded-xl">
          🏅 내 뱃지
        </a>
        <a href="/ranking" onClick={() => rememberPlayer(player.id)} className="text-center bg-slate-800 font-semibold py-3 rounded-xl">
          🏆 랭킹
        </a>
      </div>

      {/* 번호가 잘못 읽혔을 수도 있으니 빠져나갈 길을 둡니다. */}
      <button onClick={onNotMe} className="text-xs text-slate-500 underline">
        내가 아니야 (번호 직접 입력하기)
      </button>
    </main>
  );
}

function BigButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="bg-emerald-500 text-slate-900 font-bold py-4 rounded-2xl text-lg flex items-center justify-center gap-2"
    >
      <BrandMark size={30} tone="black" />
      {children}
    </button>
  );
}

/** "환영해!! 더 강해진 뒤, 수액을 차지하자!!" — 레벨업 + 포인트 나누기 */
function LevelUp({
  insect,
  xpBonus = 1,
  onCancel,
  onDone,
}: {
  insect: LatestInsect;
  /** 친구·가족 버프 (경험치 × 1.1) */
  xpBonus?: number;
  onCancel: () => void;
  onDone: (alloc: Alloc, gain: XpGain) => Promise<void>;
}) {
  const [alloc, setAlloc] = useState<Alloc>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // 이번에 얻는 경험치. 레벨이 올라야 포인트를 받는다 (오른 레벨 × 3개).
  const gain = addXp(insect.level, insect.xp, revisitXpRate(insect.level) * xpBonus);
  const points = gain.levelsUp * POINTS_PER_LEVELUP;
  const left = points - allocTotal(alloc);

  // 레벨이 오르는 화면이면 레벨업 소리 (한 번만)
  useEffect(() => {
    if (gain.levelsUp > 0) playSound('levelUp');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const before = statsForInsect(insect as Insect);
  const after = applyAlloc(before, alloc);

  function change(key: AllocKey, delta: number) {
    setAlloc((prev) => {
      const next = Math.max(0, (prev[key] ?? 0) + delta);
      const total = allocTotal({ ...prev, [key]: next });
      if (total > points) return prev;
      return { ...prev, [key]: next };
    });
  }

  async function confirm() {
    unlockAudio(['next']);
    setSaving(true);
    setError('');
    try {
      await onDone(alloc, gain);
    } catch (err: any) {
      setError(err.message || '저장이 안 됐어. 다시 눌러줘!');
      setSaving(false);
    }
  }

  return (
    <main className="max-w-md mx-auto min-h-screen px-5 py-8 flex flex-col gap-4">
      {/* 대화창 — Jin 문구 그대로 */}
      <div className="flex items-end gap-2">
        <BrandMark size={52} className="shrink-0" />
        <div className="flex-1 min-w-0 bg-white text-slate-900 rounded-2xl rounded-bl-sm px-4 py-3 font-black text-lg leading-snug" style={{ wordBreak: 'keep-all' }}>
          환영해!! 더 강해진 뒤, 수액을 차지하자!!
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-700 shrink-0 flex items-center justify-center">
          {insect.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={insect.image} alt={insect.nickname} className="w-full h-full object-cover" />
          ) : (
            <span className="text-3xl">🐛</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold truncate">{insect.nickname}</p>
          {gain.levelsUp > 0 ? (
            <p className="text-2xl font-black">
              <span className="text-slate-400">Lv.{insect.level}</span>
              <span className="mx-1">→</span>
              <span className="text-emerald-300">Lv.{gain.level} 🆙</span>
            </p>
          ) : (
            <p className="text-2xl font-black text-emerald-300">Lv.{insect.level}</p>
          )}
          <p className="text-sm text-amber-300 font-bold">경험치 +{gain.shown} XP</p>
        </div>
      </div>

      {/* LV5 부터는 한 번에 안 오른다 — 얼마나 찼는지 막대로 보여준다 */}
      {gain.levelsUp === 0 && (
        <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-2" style={{ wordBreak: 'keep-all' }}>
          <p className="text-center font-bold">
            다음 레벨까지 <span className="text-amber-300">{xpDisplay(gain.level, gain.xp).left} XP</span> 남았어!
            <span className="block text-sm text-slate-400 font-normal">
              XP {xpDisplay(gain.level, gain.xp).have} / {xpDisplay(gain.level, gain.xp).need}
            </span>
          </p>
          <div className="h-3 rounded-full bg-slate-900 overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full"
              style={{ width: `${Math.round(levelProgress(gain.level, gain.xp) * 100)}%` }}
            />
          </div>
          <p className="text-center text-sm text-slate-400">배틀하면 경험치가 더 쌓여. 레벨이 오르면 강해질 곳을 고를 수 있어!</p>
        </div>
      )}

      {points > 0 && (
        <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3" style={{ wordBreak: 'keep-all' }}>
          <p className="text-center text-xl font-black">
            강해질 곳을 골라줘!
            <br />
            남은 포인트{' '}
            <span className={left > 0 ? 'text-amber-300 text-2xl' : 'text-emerald-300 text-2xl'}>{left}</span>
          </p>
          {/* 10/2 Jin: "설명이 너무 대충" → 뭘 하는 화면인지 · 어떻게 나누면 좋은지 */}
          <p className="text-[0.9375rem] text-slate-300 leading-relaxed bg-slate-900/60 rounded-xl px-3 py-2.5">
            레벨이 올라서 <b className="text-amber-300">포인트 {points}개</b>를 받았어! 강하게 만들고 싶은 곳에{' '}
            <b className="text-emerald-300">+</b> 를 눌러 나눠줘. 한 곳에 몰아줘도 되고 골고루 나눠도 돼.
            <span className="block mt-1 text-amber-200">
              💡 랭킹에 공격형이 많으면 수비력·회피력, 수비형이 많으면 공격력을 올려봐!
            </span>
          </p>
          {ALLOC_STATS.map((row) => {
            const n = alloc[row.key] ?? 0;
            return (
              <div key={row.key} className={`rounded-xl p-3 ${n > 0 ? 'bg-emerald-900/40 ring-1 ring-emerald-400/50' : 'bg-slate-900/50'}`}>
                <div className="flex items-center gap-2">
                  <p className="flex-1 min-w-0 text-lg font-black leading-tight">
                    {row.emoji} {row.label}
                    <span className="block text-base font-bold text-slate-400">
                      {before[row.key]}
                      {n > 0 && <span className="text-emerald-300"> → {after[row.key]}</span>}
                    </span>
                  </p>
                  <button
                    onClick={() => change(row.key, -1)}
                    disabled={n === 0}
                    className="w-11 h-11 rounded-lg bg-slate-700 disabled:opacity-30 text-2xl font-bold shrink-0"
                    aria-label={`${row.label} 빼기`}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-xl font-black shrink-0">{n}</span>
                  <button
                    onClick={() => change(row.key, +1)}
                    disabled={left === 0}
                    className="w-11 h-11 rounded-lg bg-emerald-500 text-slate-900 disabled:opacity-30 text-2xl font-bold shrink-0"
                    aria-label={`${row.label} 더하기`}
                  >
                    +
                  </button>
                </div>
                <p className="text-[0.9375rem] text-slate-200 leading-snug mt-1.5">{row.desc}</p>
                <p className="text-xs text-amber-300/90 font-bold mt-1">{allocPerLabel(row)}</p>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-400 text-center" style={{ wordBreak: 'keep-all' }}>{error}</p>}

      <button
        onClick={confirm}
        disabled={left > 0 || saving}
        className="bg-emerald-500 disabled:opacity-40 text-slate-900 font-black py-4 rounded-2xl text-lg"
      >
        {saving ? '강해지는 중...' : left > 0 ? `포인트 ${left}개를 더 골라줘` : '💪 강해지기! 배틀하러 가자'}
      </button>
      <button onClick={onCancel} className="text-sm text-slate-400 underline">
        뒤로
      </button>
    </main>
  );
}
