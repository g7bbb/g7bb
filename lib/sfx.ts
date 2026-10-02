// 효과음.
//   - 퍼펙트 "키잉!" · 판정 "틱" 은 브라우저가 직접 만든다 (Web Audio API, 아래 playPerfect/playTap)
//   - 이김·짐·필살기·게임 끝·레벨업·다음 장은 **Jin 이 준 mp3** (`public/sfx/`, 맨 아래 playSound)
//
// 처음에 mp3 를 안 넣었던 이유 (직접 만드는 소리에는 지금도 해당):
// 1) 용량 0. 부스 와이파이가 느려도 다운로드가 없습니다.
// 2) 저작권 걱정이 없습니다.
// 3) 숫자만 고치면 소리가 바뀝니다. 파일을 다시 구할 필요가 없습니다.
//
// ⚠️ 소리는 **없어도 되는 것**입니다. 어떤 이유로 실패하든 조용히 넘어가고
// 게임은 그대로 돌아가야 합니다. 그래서 전부 try/catch 로 감쌌습니다.
//
// ⚠️ 폰에서 소리는 **화면을 터치한 순간에만** 시작할 수 있습니다(브라우저 정책).
// 필살기 소리는 아이가 버튼을 누를 때 나므로 이 조건을 만족합니다.
// 아이폰은 옆면 무음 스위치가 켜져 있으면 웹에서는 소리를 낼 방법이 없습니다.

let ctx: AudioContext | null = null;

/** 배경음악(lib/bgm.ts)도 같은 소리 통로를 쓴다 — 폰은 터치로 한 번 깨운 통로만 소리가 난다. */
export function audioContext(): AudioContext | null {
  return audio();
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // 폰에서는 처음에 잠들어 있다가 터치할 때 깨어납니다.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * ✨퍼펙트 전용 "키잉!" — 금속이 울리며 튕겨 올라가는 로봇 소리.
 *
 * 소리가 "삐-" 가 아니라 "키잉-" 으로 들리는 핵심은 두 가지입니다.
 * 1) 주파수를 **위로 쓸어올린다** (520Hz → 2600Hz)
 * 2) 배음 관계가 아닌 두 음(1배 : 2.76배)을 겹친다 — 종·금속의 특징입니다.
 *    정수배로 겹치면 그냥 맑은 악기 소리가 되어 로봇 느낌이 안 납니다.
 */
export function playPerfect() {
  const ac = audio();
  if (!ac) return;
  try {
    const t = ac.currentTime;

    // 음량 곡선은 4단계입니다. 3단계(0.32초까지 0.4)가 "키잉—" 의 울림을 만듭니다.
    // 2단계로 뚝 떨어뜨리면 지수 감쇠가 너무 빨라서 "틱" 소리가 되어버립니다.
    // (실제로 측정해보니 첫 시도는 50ms 만에 사라졌습니다.)
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(2.2, t + 0.006); // 탁 튀는 시작
    out.gain.exponentialRampToValueAtTime(1.2, t + 0.12);
    out.gain.exponentialRampToValueAtTime(0.4, t + 0.32); // 울림
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.75); // 여운
    out.connect(ac.destination);

    // 금속성을 만드는 필터. 같이 위로 쓸어올려야 "쨍" 하는 맛이 납니다.
    // Q를 높이면 더 금속스럽지만 소리가 확 작아집니다. 부스가 시끄러우므로 1.6으로 낮췄습니다.
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.6;
    band.frequency.setValueAtTime(700, t);
    band.frequency.exponentialRampToValueAtTime(3400, t + 0.13);
    band.frequency.exponentialRampToValueAtTime(2000, t + 0.55);
    band.connect(out);

    const layers: [number, OscillatorType, number][] = [
      [1, 'sawtooth', 0.55],
      [2.76, 'square', 0.22], // 정수배가 아닌 음 = 금속·로봇 느낌
    ];

    layers.forEach(([ratio, type, level]) => {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(520 * ratio, t);
      osc.frequency.exponentialRampToValueAtTime(2600 * ratio, t + 0.13);
      osc.frequency.exponentialRampToValueAtTime(2200 * ratio, t + 0.55);

      const g = ac.createGain();
      g.gain.value = level;

      osc.connect(g);
      g.connect(band);
      osc.start(t);
      osc.stop(t + 0.8);
    });
  } catch {
    // 소리는 없어도 됩니다.
  }
}

/** 퍼펙트가 아닌 판정에 쓰는 짧은 "틱". 눌렀다는 감각만 주고 퍼펙트를 돋보이게 합니다. */
export function playTap(pitch = 900) {
  const ac = audio();
  if (!ac) return;
  try {
    const t = ac.currentTime;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    g.connect(ac.destination);

    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.6, t + 0.12);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.15);
  } catch {
    // 소리는 없어도 됩니다.
  }
}

// ─────────────────────────────────────────────────────────────
// Jin 이 준 효과음 파일 (2026-10-01) — `public/sfx/`
//
// 파일마다 원래 크기가 제각각이라(제일 작은 게 최대의 8%, 제일 큰 게 99%) **여기서 크기를 맞춘다.**
// 파일을 다시 만들지 않고 틀 때 키우거나 줄인다. `gain` 은 몇 배로 틀지, `skip` 은 앞에서 건너뛸 초.
// 숫자는 브라우저로 직접 재서 정했다 (최대 크기를 0.6~0.75 근처로).
// 파일을 바꾸면 크기를 다시 재서 gain 을 고칠 것.
// ─────────────────────────────────────────────────────────────

export type SoundName = 'win' | 'lose' | 'special' | 'gameOver' | 'levelUp' | 'next' | 'hitWing' | 'hitJaw' | 'hitHorn';

const SOUND_FILES: Record<SoundName, { src: string; gain: number; skip?: number }> = {
  win: { src: '/sfx/win.mp3', gain: 9 }, // 배틀에서 이겼을 때 (원래 아주 작음 8%)
  lose: { src: '/sfx/lose.mp3', gain: 3 }, // 졌을 때
  special: { src: '/sfx/special.mp3', gain: 2.2 }, // 필살기가 터질 때
  gameOver: { src: '/sfx/game-over.mp3', gain: 0.6, skip: 0.38 }, // 게임(랭킹 도전·연습)이 끝났을 때. 앞 0.4초가 빈 소리
  levelUp: { src: '/sfx/level-up.mp3', gain: 2.8 }, // 레벨업
  next: { src: '/sfx/next.mp3', gain: 4 }, // 설정을 마치고 다음 장으로 넘어갈 때
  // 🥊 일반 공격 소리 (10/2 Jin) — 때리는 쪽 곤충 종류로 고른다 (attackSoundFor). 최대 크기 0.5 안팎으로 맞춤.
  hitWing: { src: '/sfx/hit-wing.mp3', gain: 1, skip: 0.15 }, // 나비·벌 (앞 0.15초 조용한 부분 건너뜀)
  hitJaw: { src: '/sfx/hit-jaw.mp3', gain: 1.9 }, // 사슴벌레·기타 곤충 (원본이 작음 28%)
  hitHorn: { src: '/sfx/hit-horn.mp3', gain: 0.85 }, // 장수풍뎅이
};

/**
 * 일반 공격 소리 고르기 (2026-10-02 Jin): 1번 나비·벌 / 2번 사슴벌레·기타 / 3번 장수풍뎅이.
 * 사마귀는 아직 안 정해서 2번(사슴벌레 소리)을 쓴다 — Jin 이 정하면 여기만 바꾸면 된다.
 * insects.species 에는 한글 이름이 저장된다 ("사슴벌레"). 목록에 없는 이름(물방개 등)은 기타 곤충.
 */
export function attackSoundFor(species: string | null | undefined): SoundName {
  const name = (species || '').trim();
  if (name === '나비' || name === '벌' || name === 'butterfly' || name === 'bee') return 'hitWing';
  if (name === '장수풍뎅이' || name === 'rhino') return 'hitHorn';
  return 'hitJaw';
}

const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();

function load(name: SoundName): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return cached;
  const ac = audio();
  const job = (async () => {
    if (!ac) return null;
    try {
      const res = await fetch(SOUND_FILES[name].src);
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      return await new Promise<AudioBuffer | null>((resolve) => {
        // 옛 사파리는 Promise 방식이 없어서 콜백 방식으로 부릅니다.
        ac.decodeAudioData(data, resolve, () => resolve(null));
      });
    } catch {
      return null;
    }
  })();
  buffers.set(name, job);
  return job;
}

/**
 * 화면을 **터치한 순간에** 부르면 이 뒤로 소리가 납니다 (폰 브라우저 정책).
 * 배틀 시작·다음 장 버튼처럼 아이가 누르는 곳에서 먼저 불러둡니다. 파일도 미리 받아둡니다.
 */
export function unlockAudio(preload: SoundName[] = []) {
  audio();
  preload.forEach((name) => void load(name));
}

/** 효과음을 틉니다. 실패하면 조용히 넘어갑니다 (게임은 계속). */
export function playSound(name: SoundName, delayMs = 0) {
  const ac = audio();
  if (!ac) return;
  void load(name).then((buf) => {
    if (!buf) return;
    try {
      const { gain, skip = 0 } = SOUND_FILES[name];
      const src = ac.createBufferSource();
      src.buffer = buf;
      const g = ac.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(ac.destination);
      src.start(ac.currentTime + delayMs / 1000, skip);
    } catch {
      // 소리는 없어도 됩니다.
    }
  });
}
