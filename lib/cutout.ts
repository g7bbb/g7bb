/**
 * ✂️ 곤충 그림에서 **곤충만 오려낸 투명 PNG** 만들기 (11/22 Jin: 곤충 필드 — "카드 말고 진짜 곤충 모양으로")
 *
 * - 브라우저 안에서 AI 모델(IS-Net, public/models/isnet-q8.onnx)을 돌린다 → 서버 비용 0, 그림은 밖으로 안 나간다.
 * - 한 장에 PC 기준 몇 초. 화면이 멈추지 않게 Web Worker(public/cutout-worker.js)에서 한 장씩 차례로.
 * - 오려낸 결과는 그 기기에 저장(IndexedDB 'g7bb-cut') → 다음부터는 바로. 새 곤충만 새로 오린다.
 * - 결과는 곤충 둘레에 딱 맞게 잘라서(발끝 = 그림 아래) 돌려준다.
 */

const SIZE = 1024; // 모델 입력 크기
const OUT_MAX = 360; // 저장할 그림 긴 변 (필드에서는 이보다 작게 보인다)
const DB_NAME = 'g7bb-cut';
const STORE = 'cut';

export interface Cutout {
  src: string; // 투명 PNG data URL
  w: number;
  h: number;
}

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

export async function savedCutout(id: string): Promise<Cutout | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      r.onsuccess = () => resolve(r.result ? { src: r.result.src, w: r.result.w, h: r.result.h } : null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveCutout(id: string, c: Cutout) {
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, 'readwrite').objectStore(STORE).put({ id, ...c, t: Date.now() });
  } catch {
    // 저장 못 해도 이번엔 보여준다
  }
}

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: { mask?: Uint8ClampedArray; error?: string }) => void>();
let chain: Promise<unknown> = Promise.resolve();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker('/cutout-worker.js');
    worker.onmessage = (e) => {
      const cb = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      cb?.(e.data);
    };
  }
  return worker;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

async function runCut(src: string): Promise<Cutout> {
  const im = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(im, 0, 0, SIZE, SIZE);
  const d = x.getImageData(0, 0, SIZE, SIZE).data;
  let mx = 1;
  for (let i = 0; i < d.length; i++) if (i % 4 !== 3 && d[i] > mx) mx = d[i];
  const input = new Float32Array(3 * SIZE * SIZE);
  const N = SIZE * SIZE;
  for (let p = 0; p < N; p++) for (let ch = 0; ch < 3; ch++) input[ch * N + p] = d[p * 4 + ch] / mx - 0.5;

  const id = ++seq;
  const res = await new Promise<{ mask?: Uint8ClampedArray; error?: string }>((resolve) => {
    waiting.set(id, resolve);
    getWorker().postMessage({ id, input, size: SIZE }, [input.buffer]);
  });
  if (!res.mask) throw new Error(res.error || 'cutout failed');

  // 원래 비율 그대로 알파를 입힌다 (모델은 정사각형으로 봤으니 다시 늘린다)
  const W = im.naturalWidth;
  const H = im.naturalHeight;
  const mc = document.createElement('canvas');
  mc.width = SIZE;
  mc.height = SIZE;
  const mxc = mc.getContext('2d')!;
  const md = mxc.createImageData(SIZE, SIZE);
  for (let p = 0; p < N; p++) {
    // 흐릿한 가장자리는 조금 깎고, 확실한 곳은 꽉 채운다
    const a = Math.max(0, Math.min(255, (res.mask[p] - 40) * 1.4));
    md.data[p * 4 + 3] = a;
  }
  mxc.putImageData(md, 0, 0);
  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  const fx = full.getContext('2d', { willReadFrequently: true })!;
  fx.drawImage(mc, 0, 0, W, H);
  fx.globalCompositeOperation = 'source-in';
  fx.drawImage(im, 0, 0, W, H);

  // 곤충 둘레에 딱 맞게 자르기
  const a = fx.getImageData(0, 0, W, H).data;
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < H; y += 2)
    for (let xx = 0; xx < W; xx += 2)
      if (a[(y * W + xx) * 4 + 3] > 60) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 <= x0 || y1 <= y0) {
    x0 = 0;
    y0 = 0;
    x1 = W - 1;
    y1 = H - 1;
  }
  const cw = x1 - x0 + 1;
  const ch2 = y1 - y0 + 1;
  const k = Math.min(1, OUT_MAX / Math.max(cw, ch2));
  const out = document.createElement('canvas');
  out.width = Math.round(cw * k);
  out.height = Math.round(ch2 * k);
  out.getContext('2d')!.drawImage(full, x0, y0, cw, ch2, 0, 0, out.width, out.height);
  return { src: out.toDataURL('image/png'), w: out.width, h: out.height };
}

/** 곤충 하나 오려내기 — 저장돼 있으면 바로, 아니면 차례를 기다려 오린다. 실패하면 null. */
export async function cutoutInsect(id: string, src: string): Promise<Cutout | null> {
  const saved = await savedCutout(id);
  if (saved) return saved;
  const job = chain
    .then(() => runCut(src))
    .then((c) => {
      void saveCutout(id, c);
      return c;
    })
    .catch(() => null);
  chain = job;
  return job;
}
