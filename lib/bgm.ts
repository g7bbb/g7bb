// 🎵 배경음악 (2026-10-02 Jin)
//   - 평소, 1회차:     public/sfx/bgm.mp3        (atlasaudio "retrowave", 2분 18초)
//   - 평소, 2~4회차:   public/sfx/bgm-2.mp3      (lnplusmusic "synthwave 80s", 2분 10초)  "2번째 접속부터"
//   - 평소, 5회차~:    public/sfx/bgm-3.mp3      (kaazoom "run and catch 'em", 46초 반복용) "5번째부터"
//   - 배틀:            public/sfx/bgm-battle.mp3 (moodmode "game 8-bit", 1분 28초)
//   회차 = 시작한 게임 수 (`survey.game.sessions`), 처음 온 아이는 1회차.
//
// 크기: 전부 꽉 찬 음악이라(평균 크기 0.24~0.32) 효과음(평균 0.05~0.14)보다 살짝 아래로 깐다.
//   평소 음악 세 개는 평균 0.047~0.048 로 맞췄다 (곡마다 배수가 다른 이유) ·
//   배틀은 0.041 (필살기·승패 소리가 주인공이라 조금 더 작게)
// 바뀔 때는 1초 정도에 걸쳐 서로 엇갈려 커지고 작아진다(크로스페이드).
// 폰은 **터치한 뒤에만** 소리를 낼 수 있어서 첫 터치 때 시작한다 (app/bgm-player.tsx).
// 아이폰은 audio.volume 을 무시하므로 소리 통로(AudioContext)의 볼륨 손잡이(gain)로 크기를 맞춘다.
// 소리는 "없어도 되는 것" — 실패하면 조용히 넘어간다.
import { audioContext } from './sfx';

export type BgmTrack = 'main' | 'battle' | 'off';

const TRACKS = {
  main1: { src: '/sfx/bgm.mp3', gain: 0.18 }, // 평균 0.264
  main2: { src: '/sfx/bgm-2.mp3', gain: 0.175 }, // 평균 0.275
  main3: { src: '/sfx/bgm-3.mp3', gain: 0.2 }, // 평균 0.237
  battle: { src: '/sfx/bgm-battle.mp3', gain: 0.13 }, // 평균 0.319
  // 🏅 업적 음악 (10/2 Jin): "업적 달성!" 배너·업적 정리 화면이 떠 있는 동안 계속 돌림. 15.5초.
  // 원곡 평균 0.18 → 0.072 (평소 음악보다 조금 크게 — 축하하는 순간이라). 떠 있는 동안 다른 음악은 잠깐 쉰다.
  achievement: { src: '/sfx/achievement.mp3', gain: 0.4 },
} as const;

/** 회차(시작한 게임 수)에 따른 평소 음악 */
export function mainTrackFor(visit: number): keyof typeof TRACKS {
  if (visit >= 5) return 'main3';
  if (visit >= 2) return 'main2';
  return 'main1';
}
let mainName: keyof typeof TRACKS = 'main1';

const MUTE_KEY = 'g7bb-bgm-muted';

interface Player {
  el: HTMLAudioElement;
  gain: GainNode | null;
}
const players: Partial<Record<keyof typeof TRACKS, Player>> = {};
let current: BgmTrack = 'main';
let started = false;
let muted = false;
let celebrating = false;

/** 지금 나와야 하는 곡 (업적 음악이 제일 먼저) */
function wanted(): keyof typeof TRACKS | null {
  if (current === 'off') return null;
  if (celebrating) return 'achievement';
  return current === 'battle' ? 'battle' : mainName;
}

function playerFor(name: keyof typeof TRACKS): Player | null {
  if (players[name]) return players[name]!;
  try {
    const el = new Audio(TRACKS[name].src);
    el.loop = true;
    el.preload = 'auto';
    let gain: GainNode | null = null;
    const ac = audioContext();
    if (ac) {
      try {
        const src = ac.createMediaElementSource(el);
        gain = ac.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(ac.destination);
      } catch {
        gain = null; // 통로 연결이 안 되는 기기는 audio.volume 로
      }
    }
    if (!gain) el.volume = 0;
    players[name] = { el, gain };
    return players[name]!;
  } catch {
    return null;
  }
}

function fade(p: Player, to: number) {
  try {
    if (p.gain) {
      const ac = p.gain.context;
      p.gain.gain.cancelScheduledValues(ac.currentTime);
      p.gain.gain.setTargetAtTime(to, ac.currentTime, 0.35);
    } else {
      p.el.volume = Math.min(1, to);
    }
  } catch {
    // 소리는 없어도 된다
  }
}

/** 지금 상태(트랙·음소거)에 맞게 틀고/줄이고/멈춘다 */
function apply() {
  if (!started) return;
  (Object.keys(TRACKS) as (keyof typeof TRACKS)[]).forEach((name) => {
    const on = !muted && wanted() === name;
    const p = on ? playerFor(name) : players[name];
    if (!p) return;
    fade(p, on ? TRACKS[name].gain : 0);
    if (on) {
      if (p.el.paused) void p.el.play().catch(() => undefined);
    } else if (!p.el.paused) {
      // 작아진 뒤에 멈춘다 (다시 오면 이어서 나온다)
      setTimeout(() => {
        if (muted || wanted() !== name) p.el.pause();
      }, 1200);
    }
  });
}

export function readBgmMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 첫 터치 때 부른다 */
export function startBgm() {
  if (typeof window === 'undefined') return;
  muted = readBgmMuted();
  started = true;
  apply();
}

export function setBgmMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // 저장 못 해도 이번엔 적용된다
  }
  apply();
}

/** 화면에 따라 트랙을 바꾼다 (배틀 화면 'battle', 직원 화면 'off') */
export function setBgmTrack(next: BgmTrack) {
  if (current === next) return;
  current = next;
  apply();
}

/** 회차가 바뀌면 평소 음악을 바꾼다 (다시 온 아이는 다른 음악) */
export function setBgmVisit(visit: number) {
  const next = mainTrackFor(visit);
  if (next === mainName) return;
  mainName = next;
  apply();
}

/**
 * 🏅 업적 음악 켜기/끄기 (배틀 화면의 "업적 달성!" 배너·업적 정리 화면).
 * 켜면 처음부터 계속 돌리고, 끄면 원래 음악으로 돌아간다. 음악 끄기(🔇)를 눌렀으면 안 나온다.
 */
export function setAchievementMusic(on: boolean) {
  if (celebrating === on) return;
  celebrating = on;
  if (on) {
    const p = players.achievement;
    if (p && p.el.paused) {
      try {
        p.el.currentTime = 0;
      } catch {
        // 처음부터가 안 되면 이어서
      }
    }
  }
  apply();
}
