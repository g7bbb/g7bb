'use client';

import { Suspense, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { SPECIES } from '@/lib/species';
import { ENVIRONMENTS } from '@/lib/environments';
import { AGE_STAGES, BODY_PARTS } from '@/lib/insect-stats';
import { MUTATIONS } from '@/lib/mutations';
import { ticketAt } from '@/lib/ticket';

// 부스에서 아이들에게 나눠줄 A4 그림 용지를 브라우저에서 바로 뽑는 화면입니다.
//
// 인쇄용 PDF를 따로 만들지 않고 이 화면을 쓰는 이유:
// 곤충 종류·출신지·특별 진화 목록을 앱과 같은 파일에서 읽기 때문에,
// 목록을 고치면 종이도 자동으로 따라갑니다. 앱 화면과 종이가 어긋날 일이 없습니다.
//
// 사용법: /print?count=400 으로 열고 브라우저 인쇄(Ctrl+P) → "PDF로 저장"
function PrintInner() {
  const [count, setCount] = useState(400);
  const [startIndex, setStartIndex] = useState(0);
  const [qrCodes, setQrCodes] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function build() {
      const origin = window.location.origin;
      const codes: string[] = [];
      for (let i = 0; i < count; i += 1) {
        if (cancelled) return;
        const ticket = ticketAt(startIndex + i);
        // QR을 찍으면 번호가 채워진 시작 화면이 열립니다.
        codes.push(
          await QRCode.toDataURL(`${origin}/start?t=${ticket}`, { margin: 0, width: 240 })
        );
        if (i % 20 === 0) setProgress(i);
      }
      if (!cancelled) {
        setQrCodes(codes);
        setProgress(count);
      }
    }

    setQrCodes([]);
    setProgress(0);
    build();
    return () => {
      cancelled = true;
    };
  }, [count, startIndex]);

  const ready = qrCodes.length === count;

  return (
    <div className="print-root">
      {/* 인쇄할 때는 이 조작 부분이 빠집니다. */}
      <div className="controls">
        <h1>🖨️ 참가 용지 인쇄</h1>
        <div className="row">
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
              onChange={(e) => setStartIndex(Math.max(0, Number(e.target.value) || 0))}
            />
            <span className="hint">{ticketAt(startIndex)} 부터</span>
          </label>
          <button onClick={() => window.print()} disabled={!ready}>
            {ready ? '인쇄 / PDF로 저장' : `QR 만드는 중... ${progress}/${count}`}
          </button>
        </div>
        <p className="hint">
          인쇄 설정에서 <b>용지 A4</b>, <b>여백 없음</b>, <b>배율 100%</b>, <b>배경 그래픽 켜기</b>로
          맞춰주세요. 대상을 &quot;PDF로 저장&quot;으로 고르면 인쇄소에 넘길 파일이 됩니다.
        </p>
      </div>

      {qrCodes.map((qr, index) => {
        const ticket = ticketAt(startIndex + index);
        return (
          <section className="sheet" key={ticket}>
            <header className="sheet-head">
              <div>
                <div className="title">🐛 곤충 배틀</div>
                <div className="subtitle">내 곤충을 그리고 QR을 찍어줘!</div>
              </div>
              <div className="ticket-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={ticket} className="qr" />
                <div className="ticket">{ticket}</div>
              </div>
            </header>

            <div className="draw-area">
              <span>여기에 곤충을 그려줘</span>
            </div>

            <div className="marks">
              <MarkRow label="곤충 종류" items={SPECIES.map((item) => item.label)} />
              <MarkRow label="성장 단계" items={AGE_STAGES.map((item) => item.label)} />
              <MarkRow label="출신지" items={ENVIRONMENTS.map((item) => item.label)} />

              <div className="section-label">부위 점수 (1~5점)</div>
              {BODY_PARTS.map((part) => (
                <MarkRow key={part.key} label={part.label} items={['1', '2', '3', '4', '5']} compact />
              ))}

              <div className="section-label">✨ 특별 진화 — 그린 대로 표시해줘!</div>
              {MUTATIONS.map((option) => (
                <MarkRow
                  key={option.key}
                  label={option.label}
                  items={option.choices.map((choice) => choice.label)}
                  compact
                />
              ))}
            </div>

            <footer className="sheet-foot">
              다 그렸으면 위쪽 QR을 폰으로 찍어줘! · 이 종이는 상품 받을 때 필요하니까 꼭 가지고 있어야 해
            </footer>
          </section>
        );
      })}

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }
        body {
          background: #fff;
          color: #000;
        }
        .controls {
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
        .sheet-head .title {
          font-size: 22pt;
          font-weight: 800;
        }
        .sheet-head .subtitle {
          font-size: 10pt;
          color: #444;
          margin-top: 1mm;
        }
        .ticket-box {
          text-align: center;
        }
        .qr {
          width: 24mm;
          height: 24mm;
          display: block;
        }
        .ticket {
          font-size: 16pt;
          font-weight: 800;
          letter-spacing: 1px;
          margin-top: 1mm;
        }

        .draw-area {
          flex: 1;
          border: 2px dashed #999;
          border-radius: 4mm;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #bbb;
          font-size: 12pt;
          min-height: 95mm;
        }

        .marks {
          display: flex;
          flex-direction: column;
          gap: 1.2mm;
        }
        .section-label {
          font-size: 9pt;
          font-weight: 700;
          margin-top: 1.5mm;
        }
        .mark-row {
          display: flex;
          align-items: center;
          gap: 2mm;
          font-size: 8.5pt;
        }
        .mark-row .label {
          width: 26mm;
          flex-shrink: 0;
          font-weight: 600;
        }
        .mark-row.compact .label {
          width: 26mm;
        }
        .mark-row .items {
          display: flex;
          gap: 2.5mm;
          flex-wrap: wrap;
        }
        .mark-row .item {
          display: flex;
          align-items: center;
          gap: 1mm;
        }
        .bubble {
          width: 3.2mm;
          height: 3.2mm;
          border: 0.4mm solid #000;
          border-radius: 50%;
          display: inline-block;
        }

        .sheet-foot {
          border-top: 1px solid #999;
          padding-top: 2mm;
          font-size: 8pt;
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

function MarkRow({
  label,
  items,
  compact,
}: {
  label: string;
  items: string[];
  compact?: boolean;
}) {
  return (
    <div className={`mark-row${compact ? ' compact' : ''}`}>
      <span className="label">{label}</span>
      <span className="items">
        {items.map((item) => (
          <span className="item" key={item}>
            <span className="bubble" />
            {item}
          </span>
        ))}
      </span>
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintInner />
    </Suspense>
  );
}
