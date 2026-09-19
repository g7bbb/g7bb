// 효과음 — 파일을 받지 않고 브라우저가 직접 소리를 만들어냅니다 (Web Audio API).
//
// mp3를 넣지 않은 이유:
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
