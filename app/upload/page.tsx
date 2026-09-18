'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentPlayer } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import { Player } from '@/lib/types';
import { AGE_STAGES, BODY_PARTS, calculateStats, defaultBodyParts } from '@/lib/insect-stats';
import { ENVIRONMENTS } from '@/lib/environments';
import { SPECIES, speciesLabel } from '@/lib/species';
import { COLORS, MOODS, describeAppearance } from '@/lib/appearance';
import {
  MUTATIONS,
  MutationKey,
  defaultMutations,
  describeMutations,
  hasAnyMutation,
  normalCountsFor,
} from '@/lib/mutations';
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [species, setSpecies] = useState('');
  const [origin, setOrigin] = useState<EnvironmentKey>('lowland');
  const [ageStage, setAgeStage] = useState<AgeStageKey>('yearling');
  const [bodyParts, setBodyParts] = useState(defaultBodyParts());
  const [mutations, setMutations] = useState(defaultMutations(''));
  // 색깔·느낌은 안 골라도 됩니다. 안 고르면 AI가 아이 그림의 색을 그대로 따릅니다.
  const [color, setColor] = useState('');
  const [mood, setMood] = useState('');

  const [file, setFile] = useState<File | null>(null);
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

  const stats = calculateStats(bodyParts, ageStage, mutations, species);
  const normals = normalCountsFor(species);

  // 종을 바꾸면 "정상 개수"가 달라지므로 특별 진화 선택을 그 종 기준으로 되돌립니다.
  // (나비를 골랐는데 날개가 2장으로 남아 있으면 아이 그림과 어긋납니다.)
  function chooseSpecies(key: string) {
    setSpecies(key);
    setMutations(defaultMutations(key));
  }

  function updatePart(part: BodyPart, value: number) {
    setBodyParts((prev) => ({ ...prev, [part]: value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResultImage(null);
    setError('');
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleConvert() {
    if (!file) {
      setError('먼저 곤충 그림 사진을 골라주세요.');
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
        body: JSON.stringify({ imageBase64: base64, mimeType, species, bodyParts, mutations }),
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
        mutations,
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
                  onClick={() => chooseSpecies(item.key)}
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
            {/* 아이가 금색으로 그렸는데 AI가 검정으로 그려버리면 "내 거랑 다른데?"가 됩니다.
                연필로만 그린 그림은 AI가 색을 알 수 없어서, 표시해주면 그대로 칠해집니다. */}
            <p className="text-sm text-slate-400 mb-1">✏️ 그림 꾸미기</p>
            <p className="text-xs text-slate-500 mb-2">안 골라도 돼! 안 고르면 그림에 있는 색 그대로 그려줄게</p>

            <p className="text-xs text-slate-500 mb-1">색깔</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <PickButton label="그림대로" active={color === ''} onClick={() => setColor('')} />
              {COLORS.map((item) => (
                <PickButton
                  key={item.key}
                  label={item.label}
                  active={color === item.key}
                  onClick={() => setColor(item.key)}
                />
              ))}
            </div>

            <p className="text-xs text-slate-500 mb-1">느낌</p>
            <div className="grid grid-cols-4 gap-2">
              <PickButton label="그냥" active={mood === ''} onClick={() => setMood('')} />
              {MOODS.map((item) => (
                <PickButton
                  key={item.key}
                  label={item.label}
                  active={mood === item.key}
                  onClick={() => setMood(item.key)}
                />
              ))}
            </div>

            {describeAppearance(color, mood) && (
              <p className="mt-2 text-xs text-fuchsia-300">
                🎨 {describeAppearance(color, mood)} — 그렇게 그려줄게!
              </p>
            )}
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

          <div>
            {/* 아이가 상상으로 더 그린 부위를 그대로 살리되, 얻는 만큼 잃게 합니다. */}
            <p className="text-sm text-slate-400 mb-1">✨ 특별 진화</p>
            <p className="text-xs text-slate-500 mb-2">그린 대로 골라줘! 세지는 대신 약해지는 것도 있어</p>
            <div className="flex flex-col gap-3">
              {MUTATIONS.map((option) => (
                <div key={option.key} className="bg-slate-800 rounded-xl px-4 py-3">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold">
                      {option.label}
                      {/* 종마다 정상 개수가 달라서(나비는 날개 4장), 어디부터가 진화인지 보여줍니다. */}
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        원래 {normals[option.key]}
                      </span>
                    </span>
                    <span className="text-slate-400 text-xs">{option.hint}</span>
                  </div>
                  <div className="flex gap-2">
                    {option.choices.map((choice) => (
                      <button
                        key={choice.value}
                        onClick={() =>
                          setMutations((prev) => ({ ...prev, [option.key as MutationKey]: choice.value }))
                        }
                        className={`flex-1 py-2 rounded-lg text-sm font-bold ${
                          mutations[option.key] === choice.value
                            ? 'bg-amber-400 text-slate-900'
                            : 'bg-slate-700'
                        }`}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {hasAnyMutation(mutations, species) && (
              <p className="mt-2 text-xs text-amber-300">
                🧬 {describeMutations(mutations, species)} — 그대로 그려질 거야!
              </p>
            )}
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

            {/* capture 속성이 있으면 폰에서 카메라만 열립니다.
                미리 찍어둔 사진도 쓸 수 있도록 카메라용/앨범용 버튼을 따로 둡니다. */}
            <div className="flex gap-2">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 bg-slate-800 py-3 rounded-xl font-semibold"
              >
                📷 사진 찍기
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 bg-slate-800 py-3 rounded-xl font-semibold"
              >
                🖼️ 앨범에서 고르기
              </button>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {file && <p className="text-xs text-emerald-400">✓ {file.name}</p>}
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

function PickButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl py-2 text-sm font-semibold ${
        active ? 'bg-fuchsia-500 text-slate-900' : 'bg-slate-800'
      }`}
    >
      {label}
    </button>
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
