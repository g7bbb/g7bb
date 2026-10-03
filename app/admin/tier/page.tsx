'use client';

import { isAdminRemembered, rememberAdminLogin } from '@/lib/ticket-pin-client';
import { AdminBack } from '../admin-gate';

import { fetchTicketPins } from '@/lib/ticket-pin-client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Player } from '@/lib/types';
import { normalizeTicket, displayTicket } from '@/lib/ticket';
import { TIERS, TIER_ORDER, TierKey, gamesLabel, tierForPlayer } from '@/lib/tiers';
import { grantExtraGame, isPending, playStatus, setTierForTicket, waiveCooldown } from '@/lib/game-state';

// ─────────────────────────────────────────────────────────────
// 직원용: 참가권 올려주기 (2026-10-01 Jin: "가격마다 종이를 따로 인쇄해야 해? 더 편한 방법은?")
//
// 종이는 한 종류(A, 1만원)만 뽑는다. 3만원 이상 낸 아이만 직원이 여기서 번호를 치고 금액을 누른다.
// 아이가 아직 QR 을 안 찍었어도 먼저 올려둘 수 있다 (이름 없는 자리를 만들어 둠 → lib/game-state.ts).
// 나중에 추가로 돈을 내면 같은 방법으로 다시 올려주면 된다.
//
// 암호는 심사 화면과 같은 ADMIN_CODE (한 번 들어가면 그 탭에서는 다시 안 물어봄).
// ─────────────────────────────────────────────────────────────

/** "14", "014", "a14", "A-014" 를 모두 A-014 로. 숫자만 치면 A 로 봅니다 (종이가 A 한 종류라서). */
function readTicket(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (/^\d{1,3}$/.test(t)) return `A-${t.padStart(3, '0')}`;
  const m = /^([A-Z])-?(\d{1,3})$/.exec(t.replace(/\s+/g, ''));
  if (m) return normalizeTicket(`${m[1]}-${m[2].padStart(3, '0')}`);
  return normalizeTicket(t);
}

export default function AdminTierPage() {
  const [authed, setAuthed] = useState(false);
  const [code, setCode] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    try {
      if (isAdminRemembered()) setAuthed(true);
    } catch {
      // 저장소가 막혀 있으면 매번 암호를 다시 입력하면 됩니다.
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    const res = await fetch('/api/admin-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setAuthError(data?.error || '암호가 맞지 않아요.');
      return;
    }
    try {
      rememberAdminLogin(code);
    } catch {
      // 저장 실패는 무시합니다.
    }
    setAuthed(true);
  }

  if (!authed) {
    return (
      <main className="max-w-sm mx-auto min-h-screen flex flex-col justify-center gap-4 px-6">
        <h1 className="text-xl font-bold text-center">🔒 직원용 · 참가권</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="password"
            className="bg-slate-800 rounded-xl px-4 py-3"
            placeholder="운영자 암호"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {authError && <p className="text-red-400 text-sm text-center">{authError}</p>}
          <button className="bg-emerald-500 text-slate-900 font-bold py-3 rounded-xl">들어가기</button>
        </form>
      </main>
    );
  }

  return <TierDesk />;
}

interface LogRow {
  ticket: string;
  tier: TierKey;
  at: string;
}

function TierDesk() {
  const [input, setInput] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState<TierKey | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState<LogRow[]>([]);

  const [pin, setPin] = useState<string | null>(null);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    setMessage('');
    setError('');
    const t = readTicket(input);
    if (!t) {
      setError('번호를 다시 확인해 주세요. 숫자만 쳐도 돼요 (예: 14 → 014)');
      return;
    }
    setTicket(t);
    setPin(null);
    // 🔐 비밀번호도 같이 보여준다 — 종이를 잃어버렸거나 QR 이 안 찍힐 때 직원이 알려주려고 (테스트 번호 900번대도)
    fetchTicketPins([t])
      .then((pins) => setPin(pins[t] ?? null))
      .catch(() => setPin(null));
    setLooking(true);
    const { data, error: findError } = await supabase.from('players').select('*').eq('ticket_code', t).maybeSingle();
    setLooking(false);
    if (findError) {
      setError(findError.message);
      return;
    }
    setPlayer((data as Player) ?? null);
  }

  /** ➕ 이미 게임을 한 아이에게 1게임(3판) 더 — 금액은 그대로 (10/3 밤 Jin) */
  async function addGame() {
    if (!ticket || !player) return;
    setSaving('A');
    setMessage('');
    setError('');
    try {
      const updated = await grantExtraGame(player.id);
      setPlayer(updated);
      setLog((prev) => [{ ticket, tier: 'A' as TierKey, at: new Date().toLocaleTimeString('ko-KR') }, ...prev].slice(0, 20));
      setMessage(`✅ ${displayTicket(ticket)} → ➕ 1게임(3판) 더! 지금 바로 할 수 있어요`);
    } catch (err: any) {
      setError(err.message || '저장하지 못했어요. 다시 눌러 주세요.');
    } finally {
      setSaving(null);
    }
  }

  async function apply(tier: TierKey) {
    if (!ticket) return;
    setSaving(tier);
    setMessage('');
    setError('');
    try {
      const updated = await setTierForTicket(ticket, tier);
      setPlayer(updated);
      setLog((prev) => [{ ticket, tier, at: new Date().toLocaleTimeString('ko-KR') }, ...prev].slice(0, 20));
      setMessage(`✅ ${displayTicket(ticket)} → ${TIERS[tier].emoji} ${TIERS[tier].price} 적용!`);
    } catch (err: any) {
      setError(err.message || '저장하지 못했어요. 다시 눌러 주세요.');
    } finally {
      setSaving(null);
    }
  }

  const current = ticket ? tierForPlayer(player ?? { ticket_code: ticket }) : null;
  const status = player && !isPending(player) ? playStatus(player) : null;

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-4 px-5 py-8" style={{ wordBreak: 'keep-all' }}>
      <AdminBack />
      <h1 className="text-xl font-bold text-center">💰 참가권 올려주기 (직원용)</h1>
      <p className="text-xs text-slate-400 text-center">
        종이는 모두 1만원으로 시작해요. 3만원 이상 낸 아이만 번호를 치고 금액을 눌러 주세요.
      </p>

      <form onSubmit={lookup} className="flex gap-2">
        <input
          className="flex-1 min-w-0 bg-slate-800 rounded-xl px-4 py-3 text-2xl font-bold tracking-widest text-center"
          placeholder="014"
          inputMode="numeric"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="bg-sky-500 text-slate-900 font-bold px-5 rounded-xl" disabled={looking}>
          {looking ? '...' : '찾기'}
        </button>
      </form>

      {ticket && current && (
        <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <div>
            <p className="text-2xl font-black">
              {displayTicket(ticket)}
              {pin && <span className="ml-3 text-base font-bold text-amber-300">🔐 비밀번호 {pin}</span>}
            </p>
            <p className="text-sm text-slate-300">
              {player && !isPending(player)
                ? `${player.display_name} · 지금 ${current.emoji} ${current.price}`
                : `아직 시작 안 한 번호 · 지금 ${current.emoji} ${current.price}`}
              {status && ` · 게임 ${status.used}/${Number.isFinite(status.tier.games) ? status.tier.games : '∞'} 사용`}
              {status && (status.state.extraGames ?? 0) > 0 && ` (+서비스 ${status.state.extraGames})`}
              {status && Number.isFinite(status.left) && ` · 남은 게임 ${status.left}`}
              {status?.expired && ' · 하루권 끝남'}
            </p>
            {/* ⏩ 30분 대기 풀기 (10/2 Jin) — 아이 폰 화면의 "선생님 확인" 과 같은 일 */}
            {player && status && status.left > 0 && status.cooldownMs > 0 && (
              <button
                onClick={async () => {
                  try {
                    setPlayer(await waiveCooldown(player.id));
                    setMessage(`⏩ ${displayTicket(ticket)} 바로 참여할 수 있게 풀었어요!`);
                  } catch (err: any) {
                    setError(err.message || '다시 눌러 주세요.');
                  }
                }}
                className="mt-2 w-full bg-sky-500 text-slate-900 font-bold py-2.5 rounded-xl"
              >
                ⏩ 30분 대기 풀기 (남은 {Math.ceil(status.cooldownMs / 60000)}분)
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {TIER_ORDER.map((key) => {
              const tier = TIERS[key];
              const active = current.key === key;
              // 이미 게임을 한 아이면 1만원 버튼 = "1게임 더" (서비스·추가 결제). 금액은 안 바뀐다.
              if (key === 'A' && status && status.used > 0 && Number.isFinite(status.left)) {
                return (
                  <button
                    key={key}
                    onClick={addGame}
                    disabled={!!saving}
                    className="rounded-xl py-3 px-2 font-bold border-2 disabled:opacity-60 bg-emerald-500 text-slate-900 border-emerald-300"
                  >
                    <span className="block text-lg">➕ 1게임 더</span>
                    <span className="block text-xs font-semibold opacity-80">1만원 · 3판 · 바로 시작</span>
                    {saving === key && <span className="block text-xs">저장 중...</span>}
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  onClick={() => apply(key)}
                  disabled={!!saving}
                  className={`rounded-xl py-3 px-2 font-bold border-2 disabled:opacity-60 ${
                    active ? 'bg-amber-400 text-slate-900 border-amber-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  <span className="block text-lg">
                    {tier.emoji} {tier.price}
                  </span>
                  <span className="block text-xs font-semibold opacity-80">
                    {tier.name} · {gamesLabel(tier)}
                  </span>
                  {saving === key && <span className="block text-xs">저장 중...</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {message && <p className="text-center font-bold text-emerald-300">{message}</p>}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      {log.length > 0 && (
        <div className="bg-slate-900 rounded-2xl p-3">
          <p className="text-xs text-slate-400 mb-2">방금 올려준 번호 (이 화면에서만 보여요)</p>
          <ul className="flex flex-col gap-1 text-sm">
            {log.map((row, i) => (
              <li key={i} className="flex justify-between">
                <span className="font-bold">{row.ticket}</span>
                <span>
                  {TIERS[row.tier].emoji} {TIERS[row.tier].price}
                </span>
                <span className="text-slate-500">{row.at}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
