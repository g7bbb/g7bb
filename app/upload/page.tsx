'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentPlayer } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import { Player } from '@/lib/types';
import { AGE_STAGES, BODY_PARTS, calculateStats, defaultBodyParts } from '@/lib/insect-stats';
import { ENVIRONMENTS } from '@/lib/environments';
import { SPECIES, speciesLabel } from '@/lib/species';
import { AgeStageKey, BodyPart, EnvironmentKey } from '@/lib/types';
import HowTo from './how-to';

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(',');
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [species, setSpecies] = useState('');
  const [origin, setOrigin] = useState<EnvironmentKey>('lowland');
  const [ageStage, setAgeStage] = useState<AgeStageKey>('yearling');
  const [bodyParts, setBodyParts] = useState(defaultBodyParts());

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultMime, setResultMime] = useState<string>('image/png');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [player, setPlayer] = useState<Player | null>(null);
  const [showHowTo, setShowHowTo] = useState(true);

  useEffect(() => {
    getCurrentPlayer().then((p) => {
      if (!p) {
        router.push('/start');
        return;
      }
      setPlayer(p);
    });
  }, [router]);

  const stats = calculateStats(bodyParts, ageStage);

  function updatePart(part: BodyPart, value: number) {
    setBodyParts((prev) => ({ ...prev, [part]: value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResultImage(null);
    setError('');
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleConvert() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('먼저 곤충 그림 사진을 선택해주세요.');
      return;
    }
    if (!species.trim()) {
      setError('곤충종류를 골라주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await fetch('/api/convert-insect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType, species, bodyParts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '변환에 실패했어요.');
      setResultImage(data.imageBase64);
      setResultMime(data.mimeType);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!player || !resultImage) return;
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('insects').insert({
        player_id: player.id,
        nickname: player.display_name,
        species: speciesLabel(species),
        origin,
        age_stage: ageStage,
        body_parts: bodyParts,
        image_base64: resultImage,
        mime_type: resultMime,
        stats,
        level: 1,
        xp: 0,
        battle_count: 0,
      });
      if (insertError) throw insertError;
      router.push('/battle');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-6 px-6 py-10">
      {showHowTo && <HowTo onClose={() => setShowHowTo(false)} />}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📸 내 곤충 만들기</h1>
        <button
          onClick={() => setShowHowTo(true)}
          className="text-sm border border-slate-600 text-slate-300 rounded-full px-3 py-1"
        >
          ❓ 설명 보기
        </button>
      </div>

      {!resultImage && (
        <>
          <div>
            {/* 자유 입력이면 AI가 어떤 종인지 몰라 생김새를 틀리게 그립니다.
                목록에서 고르게 해야 그 종의 실제 생김새 규칙을 함께 넘길 수 있습니다. */}
            <p className="text-sm text-slate-400 mb-2">곤충종류</p>
            <div className="grid grid-cols-2 gap-2">
              {SPECIES.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSpecies(item.key)}
                  className={`rounded-xl py-2.5 text-sm font-semibold ${
                    species === item.key ? 'bg-sky-500 text-slate-900' : 'bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-slate-400 mb-2">출신지</p>
            <div className="grid grid-cols-3 gap-2">
              {ENVIRONMENTS.map((e) => (
                <button
                  key={e.key}
                  onClick={() => setOrigin(e.key)}
                  className={`rounded-xl py-2 text-sm font-semibold ${
                    origin === e.key ? 'bg-sky-500 text-slate-900' : 'bg-slate-800'
                  }`}
                >
                  {e.emoji} {e.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm text-slate-400 mb-2">성장단계</p>
            <div className="grid grid-cols-3 gap-2">
              {AGE_STAGES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setAgeStage(s.key)}
                  className={`rounded-xl py-2 text-sm font-semibold ${
                    ageStage === s.key ? 'bg-sky-500 text-slate-900' : 'bg-slate-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-400">신체 부위 강화 (1~5점)</p>
            {BODY_PARTS.map((part) => (
              <div key={part.key} className="bg-slate-800 rounded-xl px-4 py-3">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold">{part.label}</span>
                  <span className="text-slate-400 text-xs">{part.hint}</span>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      onClick={() => updatePart(part.key, v)}
                      className={`flex-1 py-2 rounded-lg font-bold ${
                        bodyParts[part.key] === v ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm text-slate-400">곤충 그림 사진</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="text-sm"
            />
          </div>

          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="선택한 그림" className="rounded-2xl w-full object-cover max-h-64" />
          )}

          <button
            onClick={handleConvert}
            disabled={loading || !previewUrl}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            {loading ? '곤충 그리는 중... 🐝' : '곤충으로 변신시키기'}
          </button>
        </>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {resultImage && (
        <div className="flex flex-col gap-4 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${resultMime};base64,${resultImage}`}
            alt="변신한 곤충"
            className="rounded-2xl w-64 h-64 object-contain bg-slate-800"
          />
          <div className="grid grid-cols-2 gap-2 w-full text-sm">
            <StatBar label="공격력" value={stats.atk} />
            <StatBar label="수비력" value={stats.def} />
            <StatBar label="HP" value={stats.hp} />
            <StatBar label="생존능력" value={stats.surv} />
            <StatBar label="지능" value={stats.int} />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            {saving ? '저장 중...' : '이 곤충으로 저장하고 배틀하러 가기'}
          </button>
        </div>
      )}
    </main>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-800 rounded-xl px-3 py-2">
      <div className="flex justify-between">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-400" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
