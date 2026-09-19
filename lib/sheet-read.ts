import { SPECIES } from './species';
import { ENVIRONMENTS } from './environments';
import { AGE_STAGES, BODY_PARTS } from './insect-stats';
import { MUTATIONS, MutationCounts } from './mutations';
import { COLORS, MOODS } from './appearance';
import { normalizeTicket } from './ticket';
import { AgeStageKey, BodyPart, BodyPartScores, EnvironmentKey } from './types';

// 종이 사진에서 읽은 결과(사람이 보는 한글 문구)를 앱 내부 값으로 옮깁니다.
//
// 모델에게는 종이에 인쇄된 **문구 그대로** 답하게 하고, 키 변환은 여기서 합니다.
// 모델에게 `rhino` 같은 내부 키를 외우게 하면 없는 키를 지어내는 일이 생깁니다.

export interface SheetReadResult {
  ticket: string | null;
  species: string | null;
  ageStage: AgeStageKey | null;
  origin: EnvironmentKey | null;
  color: string | null;
  mood: string | null;
  bodyParts: Partial<BodyPartScores>;
  mutations: Partial<MutationCounts>;
  /** 실제로 읽힌 줄 수 / 전체 줄 수. 화면에 "몇 개 읽었는지" 보여주는 용도 */
  read: number;
  total: number;
}

function matchLabel<T extends { label: string }>(items: T[], value: unknown): T | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return (
    items.find((item) => item.label === trimmed) ??
    // 모델이 공백이나 괄호를 살짝 다르게 쓰는 경우가 있어 느슨한 비교도 해둡니다.
    items.find((item) => item.label.replace(/\s|\(|\)/g, '') === trimmed.replace(/\s|\(|\)/g, '')) ??
    null
  );
}

export function mapSheetResult(raw: any): SheetReadResult {
  const out: SheetReadResult = {
    ticket: null,
    species: null,
    ageStage: null,
    origin: null,
    color: null,
    mood: null,
    bodyParts: {},
    mutations: {},
    read: 0,
    total: 5 + BODY_PARTS.length + MUTATIONS.length,
  };
  if (!raw || typeof raw !== 'object') return out;

  out.ticket = typeof raw.ticket === 'string' ? normalizeTicket(raw.ticket) : null;

  const species = matchLabel(SPECIES, raw.species);
  if (species) {
    out.species = species.key;
    out.read += 1;
  }

  const stage = matchLabel(AGE_STAGES, raw.ageStage);
  if (stage) {
    out.ageStage = stage.key;
    out.read += 1;
  }

  const env = matchLabel(ENVIRONMENTS, raw.origin);
  if (env) {
    out.origin = env.key;
    out.read += 1;
  }

  const color = matchLabel(COLORS, raw.color);
  if (color) {
    out.color = color.key;
    out.read += 1;
  }

  const mood = matchLabel(MOODS, raw.mood);
  if (mood) {
    out.mood = mood.key;
    out.read += 1;
  }

  const parts = raw.bodyParts ?? {};
  BODY_PARTS.forEach((part) => {
    const value = Number(parts?.[part.label]);
    if (Number.isFinite(value) && value >= 1 && value <= 5) {
      out.bodyParts[part.key as BodyPart] = Math.round(value);
      out.read += 1;
    }
  });

  const muts = raw.mutations ?? {};
  MUTATIONS.forEach((option) => {
    const label = muts?.[option.label];
    const choice = option.choices.find((item) => item.label === String(label ?? '').trim());
    if (choice) {
      out.mutations[option.key] = choice.value;
      out.read += 1;
    }
  });

  return out;
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, base64] = (reader.result as string).split(',');
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function readSheetPhoto(file: File): Promise<SheetReadResult> {
  const { base64, mimeType } = await fileToBase64(file);
  const res = await fetch('/api/read-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '종이를 읽지 못했어요.');
  return mapSheetResult(data.result);
}
