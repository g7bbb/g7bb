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
import { readSheetPhoto } from '@/lib/sheet-read';
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

/**
 * 한 장의 그림으로 AI 이미지를 만들 수 있는 최대 횟수입니다.
 *
 * 무제한으로 두지 않은 이유가 두 가지 있습니다.
 * 1) 한 번 만드는 데 10~20초가 걸립니다. 부스에 줄이 서 있는데 계속 다시 만들면 진행이 멈춥니다.
 * 2) 이미지 생성은 호출마다 돈이 나갑니다. 300명 × 무제한이면 예상이 안 됩니다.
 * 부스에서 여유가 있으면 이 숫자만 올리면 됩니다. (사진을 다시 고르면 횟수도 새로 시작합니다.)
 */
const MAX_ATTEMPTS = 3;

/** 만들어진 곤충 이미지 한 장. 여러 번 만들면 전부 남겨두고 아이가 고르게 합니다. */
interface Attempt {
  image: string;
  mime: string;
}

export default function UploadPage() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

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
  // 만든 결과를 덮어쓰지 않고 쌓아둡니다.
  // AI 그림은 매번 다르게 나와서, 다시 만들었더니 아까 게 더 나았다는 일이 생깁니다.
  // 덮어써 버리면 그 그림은 영영 못 돌아옵니다.
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [picked, setPicked] = useState(0);
  // 결과를 본 뒤에도 입력칸으로 돌아갈 수 있게 합니다 (종류를 잘못 골랐을 때).
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [player, setPlayer] = useState<Player | null>(null);
  const [showHowTo, setShowHowTo] = useState(true);

  // 종이 마킹 자동 인식 (순서표 6번)
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState('');

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

  const result = attempts[picked] ?? null;
  const attemptsLeft = MAX_ATTEMPTS - attempts.length;
  // 아직 아무것도 안 만들었거나, 결과를 보다가 "설정 고치기"를 누른 상태
  const showForm = attempts.length === 0 || editing;

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
    // 그림이 바뀌면 지금까지 만든 결과는 다른 그림의 것이라 쓸모가 없습니다. 횟수도 새로 시작합니다.
    setAttempts([]);
    setPicked(0);
    setEditing(false);
    setError('');
    setPreviewUrl(URL.createObjectURL(selected));
  }

  // 종이 사진에서 마킹을 읽어 **화면의 입력값을 채워줍니다.**
  // 바로 저장하지 않는 것이 중요합니다. 연필 마킹을 100% 읽는 건 불가능하고,
  // 틀린 채로 저장되면 능력치가 엉뚱해진 걸 아무도 모릅니다. 아이가 눈으로 확인하고 고칠 수 있어야 합니다.
  async function handleSheetPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = ''; // 같은 사진을 다시 골라도 동작하게
    if (!selected) return;

    setReading(true);
    setReadNote('');
    setError('');
    try {
      const result = await readSheetPhoto(selected);

      if (result.species) setSpecies(result.species);
      if (result.ageStage) setAgeStage(result.ageStage);
      if (result.origin) setOrigin(result.origin);
      if (result.color) setColor(result.color);
      if (result.mood) setMood(result.mood);
      if (Object.keys(result.bodyParts).length) {
        setBodyParts((prev) => ({ ...prev, ...result.bodyParts }));
      }
      // 종을 먼저 반영한 뒤 특별 진화를 덮어씁니다. (종마다 정상 날개 수가 다름)
      setMutations((prev) => ({
        ...defaultMutations(result.species ?? species),
        ...prev,
        ...result.mutations,
      }));

      setReadNote(
        result.read === 0
          ? '표시한 곳을 하나도 못 찾았어요. 밝은 곳에서 종이 전체가 나오게 다시 찍어주세요.'
          : `${result.total}칸 중 ${result.read}칸을 읽었어요. 아래에서 맞는지 확인하고 틀린 건 눌러서 고쳐주세요!`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReading(false);
    }
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
    if (attempts.length >= MAX_ATTEMPTS) {
      setError(`한 그림으로는 ${MAX_ATTEMPTS}번까지만 만들 수 있어. 만든 것 중에서 골라줘!`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await fetch('/api/convert-insect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // color·mood 를 빼먹으면 아이가 고른 색깔·느낌이 그림에 반영되지 않습니다.
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          species,
          bodyParts,
          mutations,
          color,
          mood,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '변환에 실패했어요.');
      // 실패했을 때는 아무것도 쌓지 않으므로, 실패가 남은 횟수를 깎지 않습니다.
      setPicked(attempts.length); // 새로 만든 것을 바로 보여줍니다
      setAttempts((prev) => [...prev, { image: data.imageBase64, mime: data.mimeType || 'image/png' }]);
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!player || !result) return;
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
        image_base64: result.image,
        mime_type: result.mime,
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

      {showForm && (
        <>
          {/* 결과를 본 뒤에 들어온 경우. 만든 그림을 잃지 않고 돌아갈 수 있어야 합니다. */}
          {attempts.length > 0 && (
            <button
              onClick={() => setEditing(false)}
              className="self-start text-sm border border-slate-600 text-slate-300 rounded-full px-3 py-1"
            >
              ← 만든 곤충 보러 가기
            </button>
          )}

          {/* 종이에 이미 다 표시했으니, 사진 한 장으로 아래 항목을 채워줍니다.
              실패해도 손으로 입력하면 되므로 어디까지나 "빠른 길"입니다. */}
          <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-2 border border-sky-500/40">
            <p className="font-bold text-sky-300">📄 종이 사진으로 한 번에 입력</p>
            <p className="text-xs text-slate-400">
              종이에 동그라미 친 걸 읽어서 아래를 자동으로 채워줘. 잘못 읽으면 직접 고치면 돼!
            </p>
            <button
              onClick={() => sheetInputRef.current?.click()}
              disabled={reading}
              className="bg-sky-500 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-xl"
            >
              {reading ? '종이 읽는 중... 👀' : '📄 종이 찍어서 자동 입력'}
            </button>
            <input
              ref={sheetInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleSheetPhoto}
              className="hidden"
            />
            {readNote && <p className="text-xs text-emerald-400">{readNote}</p>}
          </div>

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
            disabled={loading || !previewUrl || attemptsLeft <= 0}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-900 font-bold py-4 rounded-2xl text-lg"
          >
            {loading
              ? '곤충 그리는 중... 🐝'
              : attempts.length === 0
              ? '곤충으로 변신시키기'
              : `🔄 고친 대로 다시 만들기 (${attemptsLeft}번 남음)`}
          </button>
          {/* 한도를 다 쓴 뒤 설정만 고치러 들어오면 아무것도 못 하고 갇힙니다. 나가는 길을 알려줍니다. */}
          {attemptsLeft <= 0 && (
            <p className="text-xs text-slate-400 text-center">
              다시 만들기를 다 썼어. 그림 사진을 다시 찍으면 또 만들 수 있어!
            </p>
          )}
        </>
      )}

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      {result && !editing && (
        <div className="flex flex-col gap-4 items-center">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${result.mime};base64,${result.image}`}
              alt="변신한 곤충"
              className="rounded-2xl w-64 h-64 object-contain bg-slate-800"
            />
            {/* 다시 만드는 동안에도 지금 그림을 계속 보여줍니다.
                화면을 비워버리면 아이는 방금 것이 사라진 줄 압니다. */}
            {loading && (
              <div className="absolute inset-0 rounded-2xl bg-slate-950/70 flex items-center justify-center text-sm font-bold">
                새로 그리는 중... 🐝
              </div>
            )}
          </div>

          {/* 여러 번 만들었으면 전부 남겨두고 고르게 합니다. */}
          {attempts.length > 1 && (
            <div className="w-full">
              <p className="text-xs text-slate-400 mb-2 text-center">
                마음에 드는 걸 눌러서 골라줘! (고른 걸로 저장돼)
              </p>
              <div className="flex gap-2 justify-center">
                {attempts.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => setPicked(i)}
                    className={`rounded-xl overflow-hidden border-2 ${
                      picked === i ? 'border-sky-400' : 'border-slate-700 opacity-60'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:${item.mime};base64,${item.image}`}
                      alt={`${i + 1}번째 곤충`}
                      className="w-20 h-20 object-contain bg-slate-800"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 w-full text-sm">
            <StatBar label="공격력" value={stats.atk} />
            <StatBar label="수비력" value={stats.def} />
            <StatBar label="HP" value={stats.hp} />
            <StatBar label="생존능력" value={stats.surv} />
            <StatBar label="지능" value={stats.int} />
          </div>
          {/* 마음에 안 들면 같은 그림·같은 설정으로 한 번 더 만듭니다.
              능력치는 표시한 값에서 나오므로 다시 만들어도 바뀌지 않습니다. 그림만 새로 나옵니다. */}
          {attemptsLeft > 0 ? (
            <button
              onClick={handleConvert}
              disabled={loading || saving}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-bold py-3 rounded-2xl"
            >
              {loading ? '새로 그리는 중... 🐝' : `🔄 마음에 안 들면 다시 만들기 (${attemptsLeft}번 남음)`}
            </button>
          ) : (
            <p className="text-xs text-slate-400 text-center">
              다시 만들기는 여기까지야. 위에서 제일 마음에 드는 걸 골라줘!
            </p>
          )}

          <button
            onClick={() => {
              setEditing(true);
              setError('');
            }}
            disabled={loading || saving}
            className="w-full border border-slate-600 text-slate-300 disabled:opacity-50 font-semibold py-2.5 rounded-2xl text-sm"
          >
            ✏️ 색깔·종류 고쳐서 만들기
          </button>

          <button
            onClick={handleSave}
            disabled={saving || loading}
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
