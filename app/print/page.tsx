'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { ticketAt, displayTicket } from '@/lib/ticket';
import { GUIDE_URL, ABOUT_URL, SITE_URL, ticketUrl } from '@/lib/site';
import { BRAND, GAME_TITLE } from '@/lib/brand';
import AdminGate from '@/app/admin/admin-gate';
import { fetchTicketPins } from '@/lib/ticket-pin-client';
import { TIERS, TIER_ORDER, TierKey, gamesLabel, tierStartIndex } from '@/lib/tiers';

// 부스에서 아이들에게 나눠줄 A4 그림 용지를 브라우저에서 바로 뽑는 화면입니다.
//
// 인쇄용 PDF를 따로 만들지 않고 이 화면을 쓰는 이유:
// 곤충 종류·출신지·특별 진화 목록을 앱과 같은 파일에서 읽기 때문에,
// 목록을 고치면 종이도 자동으로 따라갑니다. 앱 화면과 종이가 어긋날 일이 없습니다.
//
// 사용법: /print?count=400 으로 열고 브라우저 인쇄(Ctrl+P) → "PDF로 저장"
// 이어서 더 뽑을 때는 /print?count=100&start=400 처럼 start 를 주면 A-401 부터 나옵니다.
//
// 📄 **2026-10-02 Jin: 마킹을 뺐다.** 곤충 종류·출신지·부위 점수 등은 전부 앱에서 고른다.
//   종이 = 맨 위 문구 + 그림 칸 + 안내 문구(🐛·🐞) + 보호자용 QR 2개(게임 설명 /guide · 곤충본부 소개 /about).
//   보호자용 QR 은 우리 사이트 화면을 가리키므로, **뽑은 뒤에도 그 화면 내용은 얼마든지 고칠 수 있다.**
//
// 💰 **금액별로 따로 뽑습니다 (2026-10-01).** 번호 앞 글자가 곧 금액입니다 (`lib/tiers.ts`).
//   /print?tier=B&count=100 → B-001 ~ B-100 (3만원 종이)
// `start` 는 그 금액 안에서 몇 번째부터인지입니다 (?tier=B&start=100 → B-101 부터).

/**
 * 주소에 적힌 숫자를 읽어옵니다.
 *
 * 주소를 잘못 적었을 때 400장이 조용히 뽑히면 인쇄비가 그대로 나가므로,
 * 읽을 수 없는 값이면 기본값으로 돌려보내고 범위를 벗어난 값은 잘라냅니다.
 */
function readNumberParam(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function PrintInner() {
  const searchParams = useSearchParams();
  // 주소로 넘어온 값은 첫 화면의 기본값으로만 씁니다. 그 뒤로는 화면의 입력칸이 주인입니다.
  const [count, setCount] = useState(() => readNumberParam(searchParams.get('count'), 400, 1, 2000));
  const [tier, setTier] = useState<TierKey>(() => {
    const raw = (searchParams.get('tier') ?? 'A').toUpperCase() as TierKey;
    return TIER_ORDER.includes(raw) ? raw : 'A';
  });
  // 그 금액 안에서 몇 번째부터 뽑을지. 999를 넘으면 다음 글자(다른 금액)로 넘어가므로 막습니다.
  const [startIndex, setStartIndex] = useState(() =>
    readNumberParam(searchParams.get('start'), 0, 0, 998)
  );
  const firstIndex = tierStartIndex(tier) + startIndex;
  // 한 금액은 999장까지입니다. 넘치면 다음 금액의 번호가 찍히므로 잘라냅니다.
  const printable = Math.min(count, 999 - startIndex);
  const [qrCodes, setQrCodes] = useState<string[]>([]);
  const [pins, setPins] = useState<string[]>([]);
  const [pinError, setPinError] = useState('');
  const [progress, setProgress] = useState(0);
  // 보호자용 QR 2개 — 모든 종이에 똑같이 들어간다
  const [infoQr, setInfoQr] = useState<{ guide: string; about: string } | null>(null);
  useEffect(() => {
    Promise.all([
      QRCode.toDataURL(GUIDE_URL, { margin: 0, width: 240 }),
      QRCode.toDataURL(ABOUT_URL, { margin: 0, width: 240 }),
    ])
      .then(([guide, about]) => setInfoQr({ guide, about }))
      .catch(() => setInfoQr(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      // 🔐 비밀번호 4자리를 서버에서 받아온다 (직원 암호 필요 — 그래서 이 화면은 AdminGate 안에 있다).
      let got: Record<string, string> = {};
      const tickets = Array.from({ length: printable }, (_, i) => ticketAt(firstIndex + i));
      try {
        got = await fetchTicketPins(tickets);
        setPinError('');
      } catch (err: any) {
        if (!cancelled) setPinError(err.message || '비밀번호를 못 받아왔어요.');
        return; // 비밀번호 없는 종이는 뽑으면 안 된다 (QR 로 못 들어온다)
      }
      const codes: string[] = [];
      const pinList: string[] = [];
      for (let i = 0; i < printable; i += 1) {
        if (cancelled) return;
        const ticket = tickets[i];
        const pin = got[ticket];
        if (!pin) {
          setPinError(`${displayTicket(ticket)} 비밀번호가 없어요. 새로고침해 주세요.`);
          return;
        }
        // QR을 찍으면 번호·비밀번호가 채워진 시작 화면이 열립니다.
        //
        // 🔴 **이 화면을 연 주소가 아니라 `SITE_URL` 을 씁니다.**
        // 전에는 `window.location.origin` 이었는데, 개발용 localhost 에서 인쇄하면
        // 종이 300장에 죽은 QR 이 박힙니다. 자세한 이유는 `lib/site.ts` 참고.
        codes.push(await QRCode.toDataURL(ticketUrl(ticket, pin), { margin: 0, width: 240 }));
        pinList.push(pin);
        if (i % 20 === 0) setProgress(i);
      }
      if (!cancelled) {
        setQrCodes(codes);
        setPins(pinList);
        setProgress(printable);
      }
    }

    setQrCodes([]);
    setProgress(0);
    build();
    return () => {
      cancelled = true;
    };
  }, [printable, firstIndex]);

  const ready = qrCodes.length === printable && pins.length === printable && !!infoQr;
  const tierInfo = TIERS[tier];

  return (
    <div className="print-root">
      {/* 인쇄할 때는 이 조작 부분이 빠집니다. */}
      <div className="controls">
        <h1>🖨️ 참가 용지 인쇄</h1>
        <div className="row">
          <label>
            금액
            <select value={tier} onChange={(e) => setTier(e.target.value as TierKey)}>
              {TIER_ORDER.map((key) => (
                <option key={key} value={key}>
                  {key} · {TIERS[key].price} ({gamesLabel(TIERS[key])})
                </option>
              ))}
            </select>
          </label>
          <label>
            장수
            <input
              type="number"
              value={count}
              min={1}
              max={999}
              onChange={(e) => setCount(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
            />
          </label>
          <label>
            시작 번호
            <input
              type="number"
              value={startIndex}
              min={0}
              onChange={(e) => setStartIndex(Math.max(0, Math.min(998, Number(e.target.value) || 0)))}
            />
            <span className="hint">
              {ticketAt(firstIndex)} ~ {ticketAt(firstIndex + printable - 1)}
            </span>
          </label>
          <button onClick={() => window.print()} disabled={!ready}>
            {ready ? '인쇄 / PDF로 저장' : `QR 만드는 중... ${progress}/${printable}`}
          </button>
        </div>
        {pinError && <p className="hint" style={{ color: '#c00', fontWeight: 700 }}>⚠️ {pinError}</p>}
        <p className="hint">
          이 종이의 QR 은 <b>{SITE_URL}</b> 로 연결됩니다. 인쇄 전에 한 번 확인해 주세요.
          <br />
          보호자용 QR: ① 게임 설명 <b>{GUIDE_URL}</b> · ② 곤충본부 소개 <b>{ABOUT_URL}</b>
        </p>
        <p className="hint">
          💰 <b>보통은 A(기본) 한 종류만 뽑으면 됩니다.</b> 3만원 이상 낸 아이는 직원이{' '}
          <b>/admin/tier</b> 에서 번호를 치고 금액을 눌러 올려줍니다. 지금 고른 금액:{' '}
          <b>{tierInfo.emoji} {tierInfo.price}</b> (번호가 <b>{tier}-</b> 로 시작).
          {printable < count && ` (한 금액은 999장까지라 ${printable}장만 뽑힙니다)`}
        </p>
        <p className="hint">
          인쇄 설정에서 <b>용지 A4</b>, <b>여백 없음</b>, <b>배율 100%</b>, <b>배경 그래픽 켜기</b>로
          맞춰주세요. 대상을 &quot;PDF로 저장&quot;으로 고르면 인쇄소에 넘길 파일이 됩니다.
        </p>
      </div>

      {qrCodes.map((qr, index) => {
        const ticket = ticketAt(firstIndex + index);
        return (
          <section className="sheet" key={ticket}>
            <header className="sheet-head">
              <div className="brand">
                {/* 종이는 흰 바탕이라 검은 로고를 씁니다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={BRAND.logo.black} alt="곤충본부" className="brand-logo" />
                <div>
                  <div className="title">{GAME_TITLE}</div>
                  <div className="headline">멋지고 예쁜 너만의 곤충을 그려봐!</div>
                </div>
              </div>
              <div className="ticket-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={ticket} className="qr" />
                <div className="ticket">{displayTicket(ticket)}</div>
                <div className="pin">🔐 {pins[index]}</div>
                {/* 금액별로 따로 뽑을 때만 표시. 기본(A) 종이는 모든 아이가 받고 금액은 직원 화면에서
                    올려주므로(2026-10-01), "1만원" 이 찍혀 있으면 10만원 낸 아이가 헷갈린다. */}
                {tier !== 'A' && (
                  <div className="tier-chip">
                    {tierInfo.price} · {gamesLabel(tierInfo)}
                  </div>
                )}
              </div>
            </header>

            <div className="draw-area">
              <span>여기에 곤충을 그려줘</span>
            </div>

            {/* 안내 문구 (Jin 문구 그대로, 앞뒤로 애벌레·무당벌레) */}
            <div className="notice">
              <span className="notice-bug">🐛</span>
              <p>
                30분마다 한 번씩 <b>수액을 차지하는 배틀</b>에 도전할 수 있습니다!
                <br />
                여러 번 참여할수록 레벨이 높아져 <b>수액을 많이 먹을 수 있어요!!</b>
              </p>
              <span className="notice-bug">🐞</span>
            </div>

            {/* 보호자용 QR 2개 — 위의 참가 QR 과 헷갈리지 않게 따로 묶는다 */}
            {infoQr && (
              <div className="info-qrs">
                <div className="info-title">👩 엄마·아빠는 여기를 찍어보세요</div>
                <div className="info-row">
                  <div className="info-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={infoQr.guide} alt="게임 설명" className="info-qr" />
                    <div className="info-label">① 게임 설명</div>
                  </div>
                  <div className="info-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={infoQr.about} alt="곤충본부 소개" className="info-qr" />
                    <div className="info-label">② 곤충본부는 뭐 하는 데예요?</div>
                  </div>
                </div>
              </div>
            )}

            <footer className="sheet-foot">
              다 그렸으면 <b>오른쪽 위 QR</b>을 찍어줘! · 이 종이(번호·비밀번호)는 상품 받을 때 필요하니까 꼭 가지고 있어야 해
            </footer>
          </section>
        );
      })}

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        /* 앱 전체는 어두운 테마(layout.tsx 의 body className="bg-slate-950 text-slate-100")입니다.
           그 클래스가 우선순위에서 이겨서 종이까지 까맣게 인쇄되므로, 이 화면에서만 강제로 되돌립니다.
           !important 없이 body 선택자만 쓰면 Tailwind 클래스에 집니다. */
        /* 태블릿 확대(globals.css)를 끈다 — 종이 크기가 바뀌면 안 된다. */
        html {
          font-size: 16px !important;
        }
        html body {
          background: #fff !important;
          color: #000 !important;
        }
        .print-root {
          background: #fff;
          color: #000;
        }
        .controls {
          background: #fff;
          color: #000;
          padding: 24px;
          font-family: system-ui, sans-serif;
          border-bottom: 1px solid #ddd;
        }
        .controls h1 {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 12px;
        }
        .controls .row {
          display: flex;
          gap: 16px;
          align-items: center;
          flex-wrap: wrap;
        }
        .controls label {
          display: flex;
          gap: 6px;
          align-items: center;
          font-size: 14px;
        }
        .controls input {
          width: 90px;
          padding: 6px 8px;
          border: 1px solid #bbb;
          border-radius: 6px;
        }
        .controls button {
          padding: 8px 16px;
          border-radius: 8px;
          background: #111;
          color: #fff;
          font-weight: 700;
        }
        .controls button:disabled {
          background: #999;
        }
        .controls .hint {
          font-size: 12px;
          color: #666;
          margin-top: 8px;
        }

        .sheet {
          background: #fff;
          width: 210mm;
          height: 297mm;
          padding: 10mm 12mm;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 4mm;
          page-break-after: always;
          break-after: page;
          font-family: system-ui, sans-serif;
          color: #000;
        }
        .sheet-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 3mm;
        }
        .sheet-head .brand {
          display: flex;
          align-items: center;
          gap: 4mm;
        }
        .brand-logo {
          height: 24mm;
          width: auto;
          display: block;
        }
        .sheet-head .title {
          font-size: 18pt;
          font-weight: 800;
        }
        .sheet-head .headline {
          font-size: 16.5pt; /* 10/2 밤 Jin: 10% 키움 */
          font-weight: 900;
          margin-top: 1.5mm;
        }
        .ticket-box {
          text-align: center;
        }
        .qr {
          width: 24mm;
          height: 24mm;
          display: block;
        }
        .tier-chip {
          margin-top: 1mm;
          font-size: 8pt;
          font-weight: 700;
          border: 1px solid #000;
          border-radius: 3mm;
          padding: 0.3mm 2mm;
          display: inline-block;
          white-space: nowrap;
        }
        .controls select {
          padding: 6px 8px;
          border: 1px solid #bbb;
          border-radius: 6px;
        }
        .ticket {
          font-size: 16pt;
          font-weight: 800;
          letter-spacing: 1px;
          margin-top: 1mm;
        }

        .pin {
          font-size: 10pt;
          font-weight: 700;
          letter-spacing: 1px;
        }
        .draw-area {
          /* 10/2 Jin: 그림 칸 20% 줄이고(162 → 130mm) 아래 글·QR 을 20% 키움 */
          flex: none;
          height: 124mm; /* 10/2 밤: 130 → 124 (보호자 QR 제목을 위로 올리면서) */
          border: 2px dashed #999;
          border-radius: 4mm;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #bbb;
          font-size: 12pt;
                  }

        .notice {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4mm;
          text-align: center;
          font-size: 13.8pt;
          line-height: 1.55;
          word-break: keep-all;
          border: 1.5px solid #000;
          border-radius: 4mm;
          padding: 3.6mm 4mm;
        }
        .notice b {
          font-weight: 800;
        }
        .notice-bug {
          font-size: 26pt;
          line-height: 1;
          flex-shrink: 0;
        }
        .info-qrs {
          text-align: center;
          /* 10/2 Jin: 위 안내 문구와 붙어 보여서 아래로 내림 */
          margin-top: 5mm;
        }
        .info-title {
          font-size: 12pt;
          font-weight: 700;
          /* 10/2 밤 Jin: "엄마·아빠" 제목을 QR 에서 2칸 위로 (QR 위치는 그대로) */
          margin-bottom: 12mm;
        }
        .info-row {
          /* 10/2 밤 Jin: 두 칸 글자 길이가 달라서 QR 이 가운데에서 비껴 보였다 → 같은 폭 두 칸으로 */
          display: grid;
          grid-template-columns: 80mm 80mm;
          justify-content: center;
        }
        .info-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5mm;
        }
        .info-qr {
          width: 26.4mm;
          height: 26.4mm;
          display: block;
        }
        .info-label {
          font-size: 12pt;
          font-weight: 700;
        }

        .sheet-foot {
          margin-top: auto;
          border-top: 1px solid #999;
          padding-top: 2mm;
          font-size: 9.6pt;
          color: #444;
          text-align: center;
        }

        @media print {
          .controls {
            display: none;
          }
          .sheet {
            page-break-after: always;
          }
        }
      `}</style>
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <AdminGate title="참가 용지 인쇄 (직원용)">
        <PrintInner />
      </AdminGate>
    </Suspense>
  );
}
