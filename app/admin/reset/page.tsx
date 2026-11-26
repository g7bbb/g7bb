'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminGate from '../admin-gate';
import { displayTicket } from '@/lib/ticket';
import { saveTournament } from '@/lib/tournament';
import { ResetRow, deleteResetRow, loadResetRows, resetAll } from '@/lib/reset';

// 🧹 오늘 기록 지우기 (11/26 Jin) — 한 명씩 🗑️ 또는 전부 초기화. 무엇을 지우는지는 lib/reset.ts 맨 위.
function hhmm(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export default function ResetPage() {
  const [rows, setRows] = useState<ResetRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      setRows(await loadResetRows());
    } catch {
      setErr('불러오지 못했어요. 인터넷을 확인하고 🔄 다시 불러오기를 눌러주세요.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function one(r: ResetRow) {
    const what = r.whole ? `${r.kid || '(이름 없음)'} (${displayTicket(r.ticket)}번) 아이와 곤충 ${r.insects.length}마리` : `${r.kid}의 오늘 곤충 ${r.insects.length}마리`;
    if (!window.confirm(`${what}를 지울까요?\n되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      await deleteResetRow(r);
      setMsg(`🗑️ ${r.kid || displayTicket(r.ticket)} 지웠어요`);
    } catch {
      window.alert('지우지 못했어요. 다시 눌러주세요.');
    }
    setBusy(false);
    void load();
  }

  async function all() {
    if (!rows) return;
    const typed = window.prompt(`오늘 기록 ${rows.length}명을 전부 지우고 토너먼트 표도 비워요.\n⚠️ 체험 중이면 지금 아이들 곤충도 지워져요!\n\n정말 지우려면 "초기화" 라고 써주세요.`);
    if ((typed || '').trim() !== '초기화') return;
    setBusy(true);
    const failed = await resetAll(rows).catch(() => rows.length);
    setMsg(failed ? `⚠️ ${failed}명은 못 지웠어요. 다시 눌러주세요.` : '🧹 초기화 끝! 다같이 보기 화면이 비었는지 확인해주세요.');
    setBusy(false);
    void load();
  }

  async function bracket() {
    if (!window.confirm('토너먼트 표만 비울까요? (곤충은 그대로)')) return;
    setBusy(true);
    await saveTournament(null).catch(() => window.alert('비우지 못했어요.'));
    setMsg('⚔️ 토너먼트 표를 비웠어요');
    setBusy(false);
  }

  return (
    <AdminGate title="오늘 기록 지우기">
      <main className="max-w-md mx-auto min-h-screen flex flex-col gap-3 px-5 py-6" style={{ wordBreak: 'keep-all' }}>
        <h1 className="text-2xl font-black text-center">🧹 오늘 기록 지우기</h1>
        <p className="text-sm text-slate-300 text-center">
          오늘 들어온 아이·오늘 만든 곤충 + 리허설 번호(951~953)예요.
          <br />
          예전 행사 아이는 <b>오늘 곤충만</b> 지워져요 (행사 기록은 그대로).
        </p>

        <button
          onClick={all}
          disabled={busy || !rows?.length}
          className="rounded-2xl bg-rose-600 text-white font-black py-4 text-lg disabled:opacity-40"
        >
          🧹 전부 초기화 ({rows?.length ?? '…'}명 + 토너먼트 표)
        </button>
        <div className="flex gap-2">
          <button onClick={bracket} disabled={busy} className="flex-1 rounded-xl bg-slate-700 py-2 font-bold disabled:opacity-40">
            ⚔️ 토너먼트 표만 비우기
          </button>
          <button onClick={() => void load()} disabled={busy} className="flex-1 rounded-xl bg-slate-700 py-2 font-bold disabled:opacity-40">
            🔄 다시 불러오기
          </button>
        </div>
        {msg && <p className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-3 py-2 text-center font-bold">{msg}</p>}
        {err && <p className="text-rose-300 text-center">{err}</p>}

        {rows === null && !err && <p className="text-center text-slate-400 py-8">불러오는 중…</p>}
        {rows?.length === 0 && <p className="text-center text-slate-400 py-8">✨ 지울 기록이 없어요. 깨끗해요!</p>}
        <ul className="flex flex-col gap-2">
          {rows?.map((r) => (
            <li key={r.pid} className="rounded-2xl bg-slate-800 px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-black truncate">
                  {r.test && '🧪 '}
                  {r.kid || '(이름 없음)'} <span className="text-slate-400 font-bold text-sm">· {displayTicket(r.ticket)}번 · {hhmm(r.at)}</span>
                </p>
                <p className="text-sm text-slate-300 truncate">
                  {r.insects.length ? `🐞 ${r.insects.map((i) => i.nick).join(', ')}` : '곤충 아직 없음'}
                  {!r.whole && <span className="text-amber-300"> (예전 아이 · 오늘 곤충만)</span>}
                </p>
              </div>
              <button onClick={() => one(r)} disabled={busy} className="shrink-0 rounded-xl bg-rose-500/20 border border-rose-400/50 px-3 py-2 font-black disabled:opacity-40">
                🗑️
              </button>
            </li>
          ))}
        </ul>
      </main>
    </AdminGate>
  );
}
