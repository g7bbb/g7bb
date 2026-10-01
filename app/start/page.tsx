'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { findPlayerByTicket, rememberInsectName, rememberPlayer } from '@/lib/session';
import { playSound, unlockAudio } from '@/lib/sfx';
import { Player } from '@/lib/types';
import { normalizeTicket } from '@/lib/ticket';
import { logToSheet } from '@/lib/sheet-log';
import { GAME_TITLE } from '@/lib/brand';
import { BrandLogo, BrandMark } from '@/app/brand-logo';
import Returning from './returning';
import { isPending } from '@/lib/game-state';
import { tierForPlayer } from '@/lib/tiers';
import {
  COLLECTING_OPTIONS,
  COLLECTING_QUESTION,
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
  // 곤충 이름은 안 지어도 됩니다. 비우면 곤충 만들기 화면에서 아이 이름을 씁니다.
  const [insectName, setInsectName] = useState('');
  const [favorite, setFavorite] = useState('');
  const [favoriteOther, setFavoriteOther] = useState('');
  const [prize, setPrize] = useState('');
  const [collecting, setCollecting] = useState('');
  const [game, setGame] = useState('');

  const [fromQr, setFromQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // QR 번호가 이미 등록된 아이면, 설문을 다시 받지 않고 바로 이어서 하게 합니다.
  const [returning, setReturning] = useState<Player | null>(null);
  // 직원이 금액을 먼저 올려둔 번호 (이름 없는 자리). 처음 온 아이처럼 이름·설문을 받되, 그 자리에 채웁니다.
  const [prepaid, setPrepaid] = useState<Player | null>(null);
  const [checking, setChecking] = useState(false);

  // QR 주소(/start?t=A-014)로 들어오면 번호를 미리 채워 손으로 칠 일을 없앱니다.
  //
  // ⚠️ **이미 등록된 번호면 설문을 다시 받지 않습니다 (2026-09-29).**
  // 참가비를 또 내고 두 번째 곤충을 만들러 온 아이는 카드에 박힌 QR 을 찍고 옵니다.
  // 그때 이름과 설문 4개를 처음부터 다시 채우게 하면 헛수고이고 부스 줄이 막힙니다.
  useEffect(() => {
    const fromUrl = params.get('t');
    if (!fromUrl) return;
    const normalized = normalizeTicket(fromUrl);
    if (!normalized) return;

    setTicket(normalized);
    setFromQr(true);

    let cancelled = false;
    setChecking(true);
    findPlayerByTicket(normalized)
      .then((found) => {
        if (cancelled || !found) return;
        if (isPending(found)) setPrepaid(found);
        else setReturning(found);
      })
      // 조회에 실패하면 그냥 처음 온 아이로 봅니다. 체험이 막히면 안 됩니다.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

/**
 * 저장이 실패했을 때 화면에 띄울 문구를 고릅니다 (2026-09-29).
 *
 * **왜 필요한가**: 서버에 연결 자체가 안 되면 Supabase 라이브러리가
 * `TypeError: Failed to fetch` 라는 영어 문구를 그대로 돌려준다. 부스에서 이 화면을 보는 건
 * 개발자가 아니라 아이와 진행 요원이라, 저 문구로는 "인터넷이 끊겼구나"를 알 수가 없다.
 * 실제로 Jin 이 이 문구를 보고 원인을 몰라 막혔다.
 *
 * 연결 자체가 안 된 경우만 따로 안내하고, 그 외 서버가 돌려준 진짜 오류 문구는 그대로 보여준다
 * (컬럼이 없다거나 하는 건 원문이 있어야 고칠 수 있다).
 */
function friendlyError(message?: string): string {
  if (!message) return '저장이 안 됐어. 한 번 더 눌러줘!';

  // 브라우저마다 문구가 다르다: 크롬 "Failed to fetch", 사파리 "Load failed", 파이어폭스 "NetworkError".
  const looksOffline = /failed to fetch|load failed|networkerror|network request failed/i.test(
    message
  );
  if (looksOffline) {
    return (
      '서버에 연결이 안 됐어. 와이파이나 데이터가 켜져 있는지 보고 다시 눌러줘! ' +
      '계속 안 되면 진행 선생님한테 알려줘. (서버 연결 실패)'
    );
  }

  return message;
}

  async function handleSubmit() {
    unlockAudio(['next']); // 누른 순간에 소리를 깨워둡니다 (폰 정책)
    const code = normalizeTicket(ticket);
    if (!code) {
      setError('번호를 다시 확인해줘! 종이 위쪽에 적힌 번호 숫자만 써도 돼 (예: 14)');
      return;
    }
    if (!nickname.trim()) {
      setError('배틀에서 쓸 이름을 적어줘!');
      return;
    }

    const favoriteAnswer = favorite === OTHER_INSECT_KEY ? favoriteOther.trim() : favorite;
    if (!favoriteAnswer || !prize || !collecting || !game) {
      setError('질문 4개에 모두 답해줘!');
      return;
    }

    setError('');
    setSaving(true);

    // 곤충은 다음 화면에서 만들어지므로 이름만 들고 갑니다.
    rememberInsectName(insectName.trim());

    // 같은 번호로 다시 들어온 경우에는 새로 만들지 않고 원래 곤충으로 이어집니다.
    // 손으로 번호를 쳐서 들어와도 QR 로 온 것과 똑같이 "다시 온 아이" 화면으로 보냅니다.
    // (바로 곤충 만들기로 보내면 게임 횟수·30분 규칙을 건너뛰게 됩니다)
    const existing = await findPlayerByTicket(code);
    if (existing && !isPending(existing)) {
      setSaving(false);
      setReturning(existing);
      return;
    }

    const survey = {
      favoriteInsect: favoriteAnswer,
      wantsCollecting: collecting,
      wantsGame: game,
    };

    // 직원이 금액을 먼저 올려둔 번호면 새로 만들지 않고 **그 자리를 채웁니다** (금액 기록을 지키려고).
    // 새로 만들다가 "이미 있는 번호" 오류가 나도(직원이 같은 순간에 올린 경우) 그 자리를 채웁니다.
    async function fillPending(row: Player) {
      return supabase
        .from('players')
        .update({
          display_name: nickname.trim(),
          prize_choice: prize,
          survey: { ...((row.survey as any) ?? {}), ...survey },
        })
        .eq('id', row.id)
        .select()
        .single();
    }

    let { data, error: insertError } = existing
      ? await fillPending(existing)
      : await supabase
          .from('players')
          .insert({
            ticket_code: code,
            display_name: nickname.trim(),
            prize_choice: prize,
            survey,
          })
          .select()
          .single();

    if (insertError && /duplicate|23505|unique/i.test(`${insertError.code} ${insertError.message}`)) {
      const again = await findPlayerByTicket(code);
      if (again && isPending(again)) ({ data, error: insertError } = await fillPending(again));
    }

    if (insertError || !data) {
      setSaving(false);
      setError(friendlyError(insertError?.message));
      return;
    }

    rememberPlayer(data.id);

    // 구글 시트 기록은 실패해도 체험을 막지 않도록 결과를 기다리지 않습니다.
    logToSheet({
      번호: code,
      이름: nickname.trim(),
      받고싶은선물: prizeLabel(prize),
      좋아하는곤충: favoriteAnswer,
      같이채집: collecting,
      곤충이름: insectName.trim(),
      게임의향: game,
      참여시각: new Date().toLocaleString('ko-KR'),
    });

    playSound('next'); // 설정을 마치고 다음 장으로 (Jin 효과음)
    router.push('/upload');
  }

  // ── 다시 온 아이 ─────────────────────────────────────────
  // 카드·종이의 QR 을 찍고 온 경우입니다. 이름도 설문도 이미 받아뒀으니 다시 묻지 않습니다.
  // 새 곤충 / 레벨업 / 30분 대기는 returning.tsx 가 맡습니다 (2026-10-01).
  if (returning) {
    return <Returning player={returning} onNotMe={() => setReturning(null)} />;
  }

  return (
    <main className="max-w-md mx-auto min-h-screen px-6 py-8 flex flex-col gap-7">
      {checking && (
        <p className="text-center text-xs text-slate-500">번호를 확인하는 중...</p>
      )}
      <header className="text-center">
        <BrandLogo size={120} />
        <h1 className="mt-3 text-2xl font-bold">{GAME_TITLE}</h1>
        <p className="mt-2 text-sm text-slate-400">질문 4개만 답하면 바로 시작해!</p>
      </header>

      <section className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">내 번호 (종이 위쪽에 적혀 있어 · 숫자만 써도 돼!)</label>
        <input
          className="bg-slate-800 rounded-xl px-4 py-3 text-2xl tracking-widest text-center font-bold"
          placeholder="14"
          value={ticket}
          onChange={(e) => setTicket(e.target.value)}
          inputMode="numeric"
          autoCapitalize="characters"
        />
        {fromQr && <p className="text-xs text-emerald-400 text-center">✓ QR에서 번호를 읽었어</p>}
        {prepaid && (
          <p className="text-sm font-bold text-amber-300 text-center">
            {tierForPlayer(prepaid).emoji} {tierForPlayer(prepaid).price} {tierForPlayer(prepaid).name} 참가권이 적용됐어!
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">내 닉네임 (랭킹에 나와!)</label>
        <input
          className="bg-slate-800 rounded-xl px-4 py-3 text-lg"
          placeholder="예: 장수풍뎅이왕"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      </section>

      {/* 곤충 이름 — 아이 닉네임과 따로 (2026-09-30 Jin).
          여기서 적으면 곤충 만들기 화면에 미리 채워지고, 거기서 또 바꿀 수 있습니다.
          12자 제한은 카드에서 이름이 잘리지 않게 하려는 것입니다. */}
      <section className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">
          내 곤충 닉네임 <span className="text-slate-500">— 안 지어도 돼!</span>
        </label>
        <input
          className="bg-slate-800 rounded-xl px-4 py-3 text-lg"
          placeholder={nickname.trim() ? `비우면 "${nickname.trim()}"` : '예: 황금턱'}
          value={insectName}
          maxLength={12}
          onChange={(e) => setInsectName(e.target.value.slice(0, 12))}
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

      <Question title={`3. ${COLLECTING_QUESTION}`}>
        <ChoiceGrid options={COLLECTING_OPTIONS} selected={collecting} onSelect={setCollecting} />
      </Question>

      <Question title="4. AI 곤충배틀 게임이 나오면 해볼래?">
        <ChoiceGrid options={GAME_OPTIONS} selected={game} onSelect={setGame} />
      </Question>

      {/* 시즌1 안내 (Jin 문구 그대로, 10/1 끝말 수정) */}
      <div className="bg-amber-400/10 border border-amber-400/40 rounded-2xl px-4 py-4 text-center text-sm leading-relaxed" style={{ wordBreak: 'keep-all' }}>
        <p className="font-bold text-amber-300">
          이번에 참여한 친구들은 G7BB배틀 시즌1에 참여했어!
        </p>
        <p className="mt-1 text-slate-200">
          꼭 1등이 아니더라도, 선물을 많이 준비할게!! 화이팅!!
        </p>
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={saving}
        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg flex items-center justify-center gap-2"
      >
        {saving ? (
          '준비하는 중...'
        ) : (
          <>
            {/* 초록 버튼이라 검은 로고가 잘 보입니다 */}
            <BrandMark size={30} tone="black" />
            곤충 만들러 가기
          </>
        )}
      </button>
    </main>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-bold mb-3" style={{ wordBreak: 'keep-all' }}>
        {title}
      </h2>
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
