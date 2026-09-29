import { SpecialMoveKey, TimingTier } from './special-moves';

// ─────────────────────────────────────────────────────────────
// 배틀 효과 글씨 그림 (2026-09-29, Jin 이 직접 만든 것)
//
// Jin 이 손글씨 느낌 폰트로 글자마다 색·테두리·빛번짐까지 넣어 PNG 로 만들어 줬다.
// 앱 기본 글꼴로 찍는 것보다 훨씬 시원해서 그림으로 바꿨다.
//
// ⚠️ **여기에 적힌 것만 그림으로 나오고, 없는 것은 지금까지처럼 글씨로 나온다.**
// 13장이 한 번에 오지 않으므로, 오는 대로 한 줄씩 추가하면 된다.
// 파일 이름을 잘못 적으면 그림이 깨져 보이는 게 아니라 **글씨로 돌아간다** —
// 부스에서 화면이 비는 사고가 나지 않게 일부러 이렇게 했다.
//
// ⚠️ **색이 그림에 이미 들어 있다.** 코드의 `textColor` 는 그림이 없을 때만 쓰인다.
// 색을 바꾸려면 그림을 다시 만들어야 한다.
// ─────────────────────────────────────────────────────────────

export interface FxArt {
  src: string;
  /**
   * 화면에 띄울 높이(px). 안 적으면 부르는 쪽의 기본값을 쓴다.
   *
   * ⚠️ **두 줄짜리 글씨는 이 값을 키워줘야 한다.** 한 줄짜리는 그림 높이의 약 67%가
   * 글자인데, 두 줄이면 그 높이를 둘이 나눠 쓰므로 같은 높이로 띄우면 글자가 절반만 해진다.
   * (`나비처럼 날아 벌처럼 쏜다!` 가 그 경우)
   */
  height?: number;
}

/** ⚡버튼 타이밍 판정 (퍼펙트/그레이트/굿/발동) */
export const TIMING_ART: Partial<Record<TimingTier['key'], FxArt>> = {
  perfect: { src: '/fx/timing-perfect.png' },
  great: { src: '/fx/timing-great.png' },
  good: { src: '/fx/timing-good.png' },
  ok: { src: '/fx/timing-ok.png' },
};

/** 필살기 이름 8개. */
export const MOVE_ART: Partial<Record<SpecialMoveKey, FxArt>> = {
  mantis: { src: '/fx/move-mantis.png' }, //         당랑권!
  butterfly: { src: '/fx/move-butterfly.png' }, //   흔들흔들 회피!
  other: { src: '/fx/move-other.png' }, //           웅크리기!
  commonDefense: { src: '/fx/move-commonDefense.png' }, // 바위처럼!!
  commonAttack: { src: '/fx/move-commonAttack.png' }, //   공격!!
  // 두 줄짜리라 높이를 키운다 (위 FxArt.height 설명 참고)
  bee: { src: '/fx/move-bee.png', height: 200 }, //  나비처럼 날아 벌처럼 쏜다!
  stag: { src: '/fx/move-stag.png' }, //             큰턱공격!
  rhino: { src: '/fx/move-rhino.png' }, //           씨름선수!
};

/** 서로 때리는 순간. 없으면 지금처럼 💥 이모지가 나온다. */
export const IMPACT_ART: FxArt | null = { src: '/fx/impact.png' }; // 콰쾅!
