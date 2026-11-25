import { useEffect, useState } from 'react';
import { loadRoomMode, saveRoomMode } from './tournament';

/**
 * 🧪 체험 모드 스위치 (2026-11-25 Jin: "아이들에게 행사용 내용을 볼 수 없게")
 *
 * 직원 메뉴에서 켜면 **같은 주소(g7bb.vercel.app)가 체험용 앱처럼** 바뀐다 — 종이 QR 이 이 주소로 찍혀 있어서 따로 버전을 만들 수 없었다.
 *   - 첫 화면: QR 찍기 · 내 카드 · 대결장만 (랭킹·배틀·뱃지·참가권 없음)
 *   - 다시 온 아이: 내 카드 / 새로 만들기만 (레벨업 접속 없음)
 *   - 카드 화면: 배틀 버튼 대신 "선생님이 배틀을 시작하면…" + 대결장
 *   - 행사용 화면(배틀·랭킹·갤러리·뱃지·팁·내 순위·다음 게임)은 주소로 들어와도 첫 화면으로 돌려보낸다 (app/experience-guard.tsx)
 * 직원 화면은 모드와 상관없이 그대로. 끄면 행사용으로 원래대로.
 *
 * 저장: T-ROOM 줄 survey.mode = 'class' (lib/tournament.ts). 기기마다 마지막 값을 기억해 두고(깜빡임 줄이기) 열 때마다 다시 확인한다.
 */

const LS_KEY = 'g7bb-exp-mode';

export function rememberedMode(): boolean | null {
  try {
    const v = window.localStorage.getItem(LS_KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

export async function fetchExperienceMode(): Promise<boolean> {
  try {
    const on = await loadRoomMode();
    try {
      window.localStorage.setItem(LS_KEY, on ? '1' : '0');
    } catch {
      // 기억 못 해도 괜찮다
    }
    return on;
  } catch {
    return rememberedMode() ?? false;
  }
}

export async function setExperienceMode(on: boolean): Promise<void> {
  await saveRoomMode(on);
  try {
    window.localStorage.setItem(LS_KEY, on ? '1' : '0');
  } catch {
    // 기억 못 해도 괜찮다
  }
}

/** 화면에서 쓰는 값. 처음엔 기기에 기억된 값(없으면 null = 아직 모름), 곧 서버 값으로 바뀐다. */
export function useExperienceMode(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    setOn(rememberedMode());
    let alive = true;
    void fetchExperienceMode().then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);
  return on;
}

/** 체험 모드일 때 아이가 못 들어가는 행사용 화면 */
export const EVENT_ONLY_PATHS = ['/battle', '/ranking', '/gallery', '/badges', '/tips', '/my-rank', '/next-game', '/guide'];
