'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentPlayer, readInsectName, rememberInsectName } from '@/lib/session';
import { supabase } from '@/lib/supabaseClient';
import { Player } from '@/lib/types';
import { AGE_STAGES, BODY_PARTS, calculateStats, defaultBodyParts } from '@/lib/insect-stats';
import { ENVIRONMENTS } from '@/lib/environments';
import { SPECIES, speciesLabel } from '@/lib/species';
import { COLORS, MOODS, describeAppearance } from '@/lib/appearance';
import { readSheetPhoto } from '@/lib/sheet-read';
import { shrinkForStorage } from '@/lib/shrink-image';
import { shrinkPhotoForUpload, readJsonOrExplain } from '@/lib/shrink-photo';
import { countInsectsForPlayer } from '@/lib/visit-count';
import InsectCard from '@/app/card/insect-card';
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
import { BrandMark } from '@/app/brand-logo';

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
  // 이 아이가 이미 만들어둔 곤충 개수. 지금 만드는 것이 `이 값 + 1` 번째 = 카드 등급.
  const [savedCount, setSavedCount] = useState(0);

  /**
   * 곤충 이름. 아이 이름과 **따로** 짓습니다 (2026-09-30 Jin 요청).
   *
   * ⚠️ **비워둬도 됩니다.** 비우면 아이 이름을 그대로 씁니다 —
   * 부스에서 이름 짓느라 줄이 막히면 안 되기 때문입니다.
   * DB 의 `insects.nickname` 컬럼은 원래 있던 것이라 마이그레이션이 필요 없습니다.
   */
  const [insectName, setInsectName] = useState('');
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
      // 첫 화면에서 곤충 이름을 지어왔으면 채워둡니다. 여기서 바꿔도 됩니다.
      const fromStart = readInsectName();
      if (fromStart) setInsectName((current) => current || fromStart);
      // 이미 만들어둔 곤충 개수를 세어 카드 등급(회차)을 미리 맞춰둡니다.
      // 실패해도 0 이 돌아와 첫 카드로 보일 뿐이라 체험은 막히지 않습니다.
      countInsectsForPlayer(p.id).then(setSavedCount);
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
      // 🚨 **보내기 전에 반드시 줄인다.** 폰 원본 사진은 base64 로 부풀면 서버 한도(4.5MB)를
      // 넘겨서 "Request Entity Too Large" 가 난다. 자세한 경위는 lib/shrink-photo.ts 참고.
      const { base64, mimeType } = await shrinkPhotoForUpload(file);
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
      // 서버가 JSON 이 아닌 걸 돌려줘도 화면이 깨지지 않게 합니다.
      const data = await readJsonOrExplain(res);
      if (!res.ok) throw new Error(data.error || '변환에 실패했어요.');
      // DB 용량 때문에 여기서 바로 JPEG로 바꿔둡니다. (자세한 이유는 lib/shrink-image.ts)
      // 화면에 보여주는 것과 저장되는 것이 같은 그림이어야 "고른 거랑 다르다"가 생기지 않습니다.
      const stored = await shrinkForStorage(data.imageBase64, data.mimeType || 'image/png');
      // 실패했을 때는 아무것도 쌓지 않으므로, 실패가 남은 횟수를 깎지 않습니다.
      setPicked(attempts.length); // 새로 만든 것을 바로 보여줍니다
      setAttempts((prev) => [...prev, stored]);
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
        // 비워두면 아이 이름을 그대로 씁니다.
        nickname: insectName.trim() || player.display_name,
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
      // 다음 곤충에 같은 이름이 또 채워지지 않게 비웁니다.
      rememberInsectName('');
      // 저장 직후에는 배틀보다 **카드**를 먼저 보여줍니다.
      // 10~20초 기다려 만든 결과라 여기가 제일 짜릿한 순간이고, 카드에 박힌 QR 이
      // 다음에 또 올 때의 신분증이라 아이가 한 번은 꼭 봐야 합니다. (배틀 버튼은 카드 화면에 있습니다)
      router.push('/card');
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
        <h1 className="text-2xl font-bold"><BrandMark size={32} className="mr-2 -mt-1" />내 곤충 만들기</h1>
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

          {/* 곤충 이름 — 아이 이름과 따로 짓습니다. 안 지어도 됩니다.
              종이에는 넣지 않았습니다: 손글씨는 종이 읽기(OMR)가 못 읽고,
              종이에 쓰고 앱에 또 치면 아이가 헷갈립니다. */}
          <div>
            <p className="text-sm text-slate-400 mb-2">
              곤충 이름 <span className="text-slate-500">— 안 지어도 돼!</span>
            </p>
            <input
              id="insect-name"
              type="text"
              value={insectName}
              onChange={(e) => setInsectName(e.target.value.slice(0, 12))}
              placeholder={player?.display_name ? `비우면 "${player.display_name}"` : '예: 황금턱'}
              maxLength={12}
              className="w-full bg-slate-800 rounded-xl px-4 py-3 text-base font-bold placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
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
          {/* 저장하기 전부터 **완성될 카드 그대로** 보여줍니다 (2026-09-29, Jin 요청).
              전에는 여기가 밋밋한 그림 + 막대였다가 저장하면 갑자기 카드가 떠서 흐름이 끊겼습니다.
              여기서부터 카드로 보여주면 아이 입장에서 "내 카드를 뽑는 중"이 됩니다. */}
          <div className="relative w-full">
            <InsectCard
              data={{
                nickname: insectName.trim() || player?.display_name || '내 곤충',
                ownerName: player?.display_name ?? null,
                species: speciesLabel(species),
                origin,
                stats,
                level: 1, // 아직 저장 전이라 항상 1레벨입니다. 배틀을 해야 올라갑니다.
                image: result.image,
                mime: result.mime,
                ticketCode: player?.ticket_code ?? null,
                visit: savedCount + 1, // 지금 만드는 것이 몇 번째인지
              }}
            />
            {/* 다시 만드는 동안에도 지금 카드를 계속 보여줍니다.
                화면을 비워버리면 아이는 방금 것이 사라진 줄 압니다. */}
            {loading && (
              <div className="absolute inset-0 rounded-2xl bg-slate-950/75 flex items-center justify-center text-sm font-bold">
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

          {/* 능력치는 카드 안에 이미 들어 있어 여기서 또 보여주지 않습니다. */}
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
