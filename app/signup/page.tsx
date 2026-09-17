'use client';

import { useState } from 'react';
import { sendMagicLink, signInWithGoogle } from '@/lib/auth';

export default function SignupPage() {
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  function validate() {
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return false;
    }
    if (!consent) {
      setError('마케팅 정보 수신에 동의해야 참여할 수 있어요.');
      return false;
    }
    setError('');
    return true;
  }

  async function handleGoogle() {
    if (!validate()) return;
    setLoading('google');
    const { error: authError } = await signInWithGoogle({ nickname: nickname.trim(), marketingConsent: consent });
    if (authError) {
      setError(authError.message);
      setLoading(null);
    }
    // 성공 시 구글 로그인 화면으로 이동하므로 여기서 별도 처리는 없습니다.
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    setLoading('email');
    const { error: authError } = await sendMagicLink(email.trim(), {
      nickname: nickname.trim(),
      marketingConsent: consent,
    });
    setLoading(null);
    if (authError) {
      setError(authError.message);
      return;
    }
    setEmailSent(true);
  }

  if (emailSent) {
    return (
      <main className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-2xl">📬</p>
        <h1 className="text-xl font-bold">메일함을 확인해주세요!</h1>
        <p className="text-slate-400">
          <span className="text-slate-200">{email}</span> 주소로 로그인 링크를 보냈어요.
          <br />
          메일에서 링크를 눌러야 가입이 완료됩니다.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold">🙋 아이디 만들기</h1>
        <p className="mt-2 text-sm text-slate-400">
          상품 지급을 위해 본인 확인용 계정(구글 또는 이메일)으로 로그인해주세요.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-slate-400">닉네임 (배틀·랭킹에 표시돼요)</label>
        <input
          className="bg-slate-800 rounded-xl px-4 py-3 text-lg"
          placeholder="예: 장수풍뎅이왕"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>

      <label className="flex items-start gap-3 bg-slate-800 rounded-xl px-4 py-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 w-5 h-5"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          (필수) 랭킹 상품 안내 및 행사 소식 전달을 위해 마케팅 정보 수신에 동의합니다.
        </span>
      </label>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        onClick={handleGoogle}
        disabled={loading !== null}
        className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
      >
        {loading === 'google' ? '이동 중...' : '🔵 구글 계정으로 시작하기'}
      </button>

      <div className="flex items-center gap-3 text-slate-500 text-xs">
        <div className="flex-1 h-px bg-slate-700" />
        또는
        <div className="flex-1 h-px bg-slate-700" />
      </div>

      <form onSubmit={handleEmail} className="flex flex-col gap-3">
        <input
          type="email"
          className="bg-slate-800 rounded-xl px-4 py-3 text-lg"
          placeholder="이메일 주소"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading !== null}
          className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
        >
          {loading === 'email' ? '전송 중...' : '📧 이메일로 로그인 링크 받기'}
        </button>
      </form>
    </main>
  );
}
