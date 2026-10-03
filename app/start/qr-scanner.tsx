'use client';

import { useEffect, useRef, useState } from 'react';

// 📷 앱 안에서 바로 종이 QR 찍기 (2026-10-03 Jin: "QR 찍으라고 나올 때 네이버 QR 띄우는 버튼")
//
// 네이버 스마트렌즈를 바로 여는 주소는 공개된 게 없어 확인할 수 없었다 → 대신 이 화면에서 카메라를 켜서 읽는다.
// 네이버 앱·카메라 앱이 QR 을 못 읽는 옛날 폰도 된다 (HTTPS 라 카메라 허락만 받으면 됨).
// 읽는 건 jsQR (이 버튼을 누를 때만 불러온다). 우리 종이 QR(…?t=A-014&k=3429)만 받아들인다.

export default function QrScanner({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState(false);
  // 뒤 카메라가 기본. 태블릿은 앞 카메라에 종이를 대는 게 편할 수도 있어서 바꿀 수 있게 했다.
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    async function start() {
      setError('');
      try {
        const jsQR = (await import('jsqr')).default;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const tick = () => {
          if (stopped) return;
          if (video.readyState >= 2 && ctx && video.videoWidth) {
            // 긴 변 640px 로 줄여서 읽는다 (폰에서 가볍게)
            const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              const target = ticketLink(code.data);
              if (target) {
                stopped = true;
                window.location.assign(target);
                return;
              }
              setWrong(true);
            }
          }
          timer = window.setTimeout(tick, 150);
        };
        tick();
      } catch (err: any) {
        setError(
          err?.name === 'NotAllowedError'
            ? '카메라를 쓰려면 "허용"을 눌러줘! 안 되면 폰 카메라 앱으로 QR을 찍어도 돼.'
            : '카메라를 못 켰어. 폰 카메라 앱으로 QR을 찍어줘!'
        );
      }
    }
    start();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  return (
    <div className="fixed inset-0 z-[90] bg-black/90 flex flex-col items-center justify-center gap-4 px-6">
      <p className="text-xl font-black text-center" style={{ wordBreak: 'keep-all' }}>
        종이 오른쪽 위 QR을 네모 안에 맞춰줘!
      </p>
      <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-slate-900 border-4 border-emerald-400">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover"
          style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
        />
        <div className="absolute inset-[18%] border-4 border-white/80 rounded-2xl pointer-events-none" />
      </div>
      {error ? (
        <p className="text-amber-300 text-center text-sm" style={{ wordBreak: 'keep-all' }}>{error}</p>
      ) : wrong ? (
        <p className="text-amber-300 text-center text-sm" style={{ wordBreak: 'keep-all' }}>
          이건 다른 QR 같아. 종이 <b>오른쪽 위</b>에 있는 QR을 찍어줘!
        </p>
      ) : (
        <p className="text-slate-400 text-sm">찍히면 바로 넘어가!</p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          className="bg-slate-700 font-bold px-5 py-3 rounded-2xl"
        >
          🔄 카메라 바꾸기
        </button>
        <button type="button" onClick={onClose} className="bg-slate-700 font-bold px-8 py-3 rounded-2xl">
          닫기
        </button>
      </div>
    </div>
  );
}

/** 우리 종이 QR 이면 들어갈 주소(/start?t=…&k=…), 아니면 null */
export function ticketLink(text: string): string | null {
  try {
    const url = new URL(text.trim());
    const t = url.searchParams.get('t');
    if (!t || !/^\/(start)?$/.test(url.pathname)) return null;
    const k = url.searchParams.get('k');
    // 지금 열린 주소(테스트 서버여도) 그대로 들어간다
    return `/start?t=${encodeURIComponent(t)}${k ? `&k=${encodeURIComponent(k)}` : ''}`;
  } catch {
    return null;
  }
}
