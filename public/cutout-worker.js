// ✂️ 곤충만 오려내기 (lib/cutout.ts 가 부른다). 화면이 멈추지 않게 따로 일하는 일꾼(Web Worker)에서 돌린다.
// 모델: IS-Net general (rembg, Apache-2.0) 을 8비트로 줄인 것 — public/models/isnet-q8.onnx (46MB)
importScripts('/ort/ort.wasm.min.js');
ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1;
let sessionPromise = null;
function session() {
  if (!sessionPromise) sessionPromise = ort.InferenceSession.create('/models/isnet-q8.onnx', { executionProviders: ['wasm'] });
  return sessionPromise;
}
onmessage = async (e) => {
  const { id, input, size } = e.data;
  try {
    const sess = await session();
    const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, size, size]) });
    const m = out[sess.outputNames[0]].data;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < m.length; i++) {
      if (m[i] < lo) lo = m[i];
      if (m[i] > hi) hi = m[i];
    }
    const mask = new Uint8ClampedArray(size * size);
    const span = hi - lo || 1;
    for (let i = 0; i < mask.length; i++) mask[i] = ((m[i] - lo) / span) * 255;
    postMessage({ id, mask }, [mask.buffer]);
  } catch (err) {
    postMessage({ id, error: String(err) });
  }
};
