'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { findPlayerByTicket, rememberPlayer } from '@/lib/session';
import { normalizeTicket } from '@/lib/ticket';
import { logToSheet } from '@/lib/sheet-log';
import {
  COLLECTING_OPTIONS,
  FAVORITE_INSECTS,
  GAME_OPTIONS,
  OTHER_INSECT_KEY,
  PRIZES,
  prizeLabel,
} from '@/lib/survey';

// 부스에서 아이가 가장 먼저 만나는 화면입니다.
// 종이의 QR을 찍고 오면 번호가 자동으로 채워지고, 탭 몇 번이면 시작됩니다.
function StartInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [ticket, setTicket] = useState('');
  const [nickname, setNickname] = useState('');
  const [favorite, setFavorite] = useState('');
  const [favoriteOther, setFavoriteOther] = useState('');
  const [prize, setPrize] = useState('');
  const [collecting, setCollecting] = useState('');
  const [game, setGame] = useState('');

  const [fromQr, setFromQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // QR 주소(/start?t=A-014)로 들어오면 번호를 미리 채워 손으로 칠 일을 없앱니다.
  useEffect(() => {
    const fromUrl = params.get('t');
    if (!fromUrl) return;
    const normalized = normalizeTicket(fromUrl);
    if (normalized) {
      setTicket(normalized);
      setFromQr(true);
    }
  }, [params]);

  async function handleSubmit() {
    const code = normalizeTicket(ticket);
    if (!code) {
      setError('번호를 다시 확인해주세요. 종이 위쪽에 적힌 A-014 같은 번호예요.');
      return;
    }
    if (!nickname.trim()) {
      setError('배틀에서 쓸 이름을 적어주세요.');
      return;
    }

    const favoriteAnswer = favorite === OTHER_INSECT_KEY ? favoriteOther.trim() : favorite;
    if (!favoriteAnswer || !prize || !collecting || !game) {
      setError('질문 4개에 모두 답해주세요!');
      return;
    }

    setError('');
    setSaving(true);

    // 같은 번호로 다시 들어온 경우에는 새로 만들지 않고 원래 곤충으로 이어집니다.
    const existing = await findPlayerByTicket(code);
    if (existing) {
      rememberPlayer(existing.id);
      router.push('/upload');
      return;
    }

    const survey = {
      favoriteInsect: favoriteAnswer,
      wantsCollecting: collecting,
      wantsGame: game,
    };

    const { data, error: insertError } = await supabase
      .from('players')
      .insert({
        ticket_code: code,
        display_name: nickname.trim(),
        prize_choice: prize,
        survey,
      })
      .select()
      .single();

    if (insertError || !data) {
      setSaving(false);
      setError(insertError?.message || '저장에 실패했어요. 다시 한 번 눌러주세요.');
      return;
    }

    rememberPlayer(data.id);

    // 구글 시트 기록은 실패해도 체험을 막지 않도록 결과를 기다리지 않습니다.
    logToSheet({
      번호: code,
      이름: nickname.trim(),
      받고싶은선물: prizeLabel(prize),
      좋아하는곤충: favoriteAnswer,
      채집체험: collecting,
      게임의향: game,
      참여시각: new Date().toLocaleString('ko-KR'),
    });

    router.push('/upload');
  }

  return (
    <main className="max-w-md mx-auto min-h-screen px-6 py-8 flex flex-col gap-7">
      <header className="text-center">
        <h1 className="text-2xl font-bold">🐛 곤충 배틀 시작하기</h1>
        <p className="mt-2 text-sm text-slate-400">질문 4개만 답하면 바로 시작해요!</p>
      </header>

      <section className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">내 번호 (종이 위쪽에 적혀 있어요)</label>
        <input
          className="bg-slate-800 rounded-xl px-4 py-3 text-2xl tracking-widest text-center font-bold"
          placeholder="A-014"
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
        />
        {fromQr && <p className="text-xs text-emerald-400 text-center">✓ QR에서 번호를 읽었어요</p>}
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">이름 (랭킹에 표시돼요)</label>
        <input
          className="bg-slate-800 rounded-xl px-4 py-3 text-lg"
          placeholder="예: 장수풍뎅이왕"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      </section>

      <Question title="1. 제일 좋아하는 곤충은?">
        <ChoiceGrid
          options={[...FAVORITE_INSECTS, OTHER_INSECT_KEY]}
          selected={favorite}
          onSelect={setFavorite}
        />
        {favorite === OTHER_INSECT_KEY && (
          <input
            className="mt-3 w-full bg-slate-800 rounded-xl px-4 py-3"
            placeholder="어떤 곤충인지 적어줘!"
            value={favoriteOther}
            onChange={(e) => setFavoriteOther(e.target.value)}
          />
        )}
      </Question>

      <Question title="2. 상품 중에 받고 싶은 건?">
        <div className="flex flex-col gap-2">
          {PRIZES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPrize(option.key)}
              className={`text-left px-4 py-3 rounded-xl border text-sm ${
                prize === option.key
                  ? 'bg-emerald-500 text-slate-900 border-emerald-400 font-bold'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              {option.emoji} {option.label}
            </button>
          ))}
        </div>
      </Question>

      <Question title="3. 사슴벌레 채집 체험 해보고 싶어?">
        <ChoiceGrid options={COLLECTING_OPTIONS} selected={collecting} onSelect={setCollecting} />
      </Question>

      <Question title="4. AI 곤충배틀 게임이 나오면 해볼래?">
        <ChoiceGrid options={GAME_OPTIONS} selected={game} onSelect={setGame} />
      </Question>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
      >
        {saving ? '준비하는 중...' : '🚀 곤충 만들러 가기'}
      </button>
    </main>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-bold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function ChoiceGrid({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={`px-4 py-2.5 rounded-xl border text-sm ${
            selected === option
              ? 'bg-emerald-500 text-slate-900 border-emerald-400 font-bold'
              : 'bg-slate-800 border-slate-700'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export default function StartPage() {
  return (
    <Suspense fallback={null}>
      <StartInner />
    </Suspense>
  );
}
