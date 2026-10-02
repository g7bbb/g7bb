'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Insect, Player } from '@/lib/types';
import { normalizeTicket } from '@/lib/ticket';
import { statsForInsect, statBarPercent, ageStageOf } from '@/lib/insect-stats';
import { baseMoveFor, secondMoveFor, SECOND_MOVE_LEVEL } from '@/lib/special-moves';
import { ENVIRONMENTS } from '@/lib/environments';
import { effectiveVisit, tierForVisit } from '@/lib/card';
import { tierForPlayer } from '@/lib/tiers';
import { BRAND, GAME_NAME } from '@/lib/brand';
import { BrandMark } from '@/app/brand-logo';
import AdminGate from '../admin-gate';
import InsectCard, { InsectCardData } from '@/app/card/insect-card';
import SelphyCard from '@/app/card/selphy-card';
import { SITE_URL } from '@/lib/site';

// ─────────────────────────────────────────────────────────────
// 직원용: 곤충 찾기 → 원본 그림 받기 / A3 포스터 인쇄 (2026-10-01 Jin: "내 곤충 A3 포스터로 뽑아보려고")
//
// 1위 상품(포스터·피규어)과 5만·10만원 참가권(피규어·포스터 배송)에 원본 그림이 필요한데,
// 지금까지는 Supabase 를 직접 열지 않으면 원본을 꺼낼 길이 없었다.
//
// - 번호(14 / A-014) · 곤충 이름 · 아이 이름으로 찾는다.
// - **원본 그림 받기** = 저장된 그림 그대로 (글자 없는 1024px JPG). 피규어 업체에 보낼 파일.
// - **A3 포스터** = 브라우저 인쇄 → "PDF로 저장" → 인쇄소. 레벨·능력치는 **지금 값**으로 다시 계산한다.
//
// ⚠️ 저장된 그림은 1024×1024 라 A3 폭(297mm)에 꽉 채우면 약 90dpi 다. 1m 떨어져 보면 괜찮지만
// 가까이서는 살짝 부드럽다. 상품용은 업스케일(그림 키우기)을 한 번 거치는 게 좋다.
// ─────────────────────────────────────────────────────────────

const MM = 96 / 25.4; // 1mm 가 화면에서 몇 px 인지 (CSS 기준)
const POSTER_W = 297; // A3 세로 (mm)
const POSTER_H = 420;

type ListRow = Pick<Insect, 'id' | 'nickname' | 'species' | 'level' | 'player_id' | 'created_at'>;
type Owner = Pick<Player, 'id' | 'display_name' | 'ticket_code' | 'survey'>;

/** "14", "a14", "A-014" → A-014. 번호 모양이 아니면 null (이름으로 찾는다). */
function readTicket(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (/^\d{1,3}$/.test(t)) return `A-${t.padStart(3, '0')}`;
  const m = /^([A-Z])-?(\d{1,3})$/.exec(t.replace(/\s+/g, ''));
  if (m) return normalizeTicket(`${m[1]}-${m[2].padStart(3, '0')}`);
  return null;
}

export default function AdminPosterPage() {
  return (
    <AdminGate title="직원용 · 곤충 포스터">
      <PosterDesk />
    </AdminGate>
  );
}

interface Picked {
  insect: Insect;
  owner: Owner | null;
  /** 그 아이의 몇 번째 곤충인지 (파일 이름용) */
  order: number;
  /** 카드 등급용 (참가권 금액이 섞인 값) */
  visit: number;
}

function PosterDesk() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ListRow[]>([]);
  const [owners, setOwners] = useState<Map<string, Owner>>(new Map());
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [mode, setMode] = useState<'poster' | 'image' | 'card'>('poster');
  // 고화질 그림 끼우기 (2026-10-01 인쇄소: "A3 로는 화질이 부족해").
  // 저장된 그림은 1024px 이라 A3 에서 약 90dpi. 4배로 키운 그림(4096px ≈ 350dpi)을 PC 에서 골라 끼우면
  // 인쇄할 때만 그걸 쓴다. **DB 에는 저장하지 않는다** (용량 16배 + 아이 화면엔 필요 없음).
  const [hiRes, setHiRes] = useState<{ url: string; size: number } | null>(null);

  const search = useCallback(async (raw: string) => {
    setSearching(true);
    setError('');
    try {
      const q = raw.trim();
      const ticket = q ? readTicket(q) : null;
      // 이미지는 빼고 가볍게 불러온다 (그림은 고른 한 마리만 따로 받는다).
      const cols = 'id, nickname, species, level, player_id, created_at';
      let found: ListRow[] = [];

      if (!q) {
        const { data, error: e } = await supabase.from('insects').select(cols).order('created_at', { ascending: false }).limit(30);
        if (e) throw e;
        found = (data || []) as ListRow[];
      } else if (ticket) {
        const { data: p } = await supabase.from('players').select('id').eq('ticket_code', ticket).maybeSingle();
        if (p) {
          const { data, error: e } = await supabase.from('insects').select(cols).eq('player_id', (p as any).id).order('created_at', { ascending: false });
          if (e) throw e;
          found = (data || []) as ListRow[];
        }
      } else {
        const like = `%${q.replace(/[%_]/g, '')}%`;
        const [{ data: byName, error: e1 }, { data: kids }] = await Promise.all([
          supabase.from('insects').select(cols).ilike('nickname', like).order('created_at', { ascending: false }).limit(50),
          supabase.from('players').select('id').ilike('display_name', like).limit(50),
        ]);
        if (e1) throw e1;
        found = (byName || []) as ListRow[];
        const kidIds = (kids || []).map((k: any) => k.id);
        if (kidIds.length) {
          const { data: byKid } = await supabase.from('insects').select(cols).in('player_id', kidIds).order('created_at', { ascending: false }).limit(50);
          (byKid || []).forEach((row: any) => {
            if (!found.some((f) => f.id === row.id)) found.push(row);
          });
        }
      }

      const ids = Array.from(new Set(found.map((r) => r.player_id)));
      const map = new Map<string, Owner>();
      if (ids.length) {
        const { data } = await supabase.from('players').select('id, display_name, ticket_code, survey').in('id', ids);
        (data || []).forEach((p: any) => map.set(p.id, p));
      }
      setOwners(map);
      setRows(found);
    } catch (err: any) {
      setError(err?.message || '찾지 못했어요.');
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    search('');
  }, [search]);

  async function open(row: ListRow) {
    setOpening(row.id);
    setError('');
    try {
      const [{ data, error: e }, { data: siblings }] = await Promise.all([
        supabase.from('insects').select('*').eq('id', row.id).single(),
        // 몇 번째 곤충인지 → 카드 등급 색 (카드 화면과 같은 규칙)
        supabase.from('insects').select('id').eq('player_id', row.player_id).order('created_at', { ascending: true }),
      ]);
      if (e) throw e;
      const owner = owners.get(row.player_id) ?? null;
      const order = (siblings || []).findIndex((s: any) => s.id === row.id) + 1;
      setHiRes(null);
      setPicked({
        insect: data as Insect,
        owner,
        order: Math.max(order, 1),
        visit: effectiveVisit(Math.max(order, 1), tierForPlayer(owner).card),
      });
      window.scrollTo({ top: 0 });
    } catch (err: any) {
      setError(err?.message || '그림을 불러오지 못했어요.');
    } finally {
      setOpening(null);
    }
  }

  function pickHiRes(file: File | undefined) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth < 1500) {
        URL.revokeObjectURL(url);
        setError(`고른 그림이 ${img.naturalWidth}px 이야. 키운 그림(4096px 같은)을 골라줘.`);
        return;
      }
      setError('');
      setHiRes({ url, size: img.naturalWidth });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('그림 파일을 열지 못했어. JPG·PNG 파일을 골라줘.');
    };
    img.src = url;
  }

  // 🃏 카드 그림 저장 (2026-10-02 Jin: "카드로 이미지화된 거를 출력해보려고").
  // 앱 카드 컴포넌트를 그대로 그려서 5배 크기 PNG 로 찍는다 → 앱 화면과 모양이 100% 같다.
  const cardRef = useRef<HTMLDivElement>(null);
  const [savingCard, setSavingCard] = useState(false);
  // 셀피(CP1500) 카드 용지 54×86mm 에 맞춘 모양이 기본 (앱 카드 모양은 위아래가 잘린다, 10/2 실측)
  const [cardKind, setCardKind] = useState<'selphy' | 'app'>('selphy');
  async function saveCard() {
    const node = cardRef.current;
    if (!picked || !node) return;
    setSavingCard(true);
    setError('');
    try {
      // QR·그림이 다 그려진 뒤에 찍는다 (QR 은 비동기로 만들어진다).
      for (let i = 0; i < 30; i++) {
        const imgs = Array.from(node.querySelectorAll('img'));
        const qrReady = !picked.owner?.ticket_code || imgs.length >= 2;
        if (qrReady && imgs.every((im) => im.complete && im.naturalWidth > 0)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const { toPng } = await import('html-to-image');
      // 화면 가운데 맞춤 여백(mx-auto)이 그대로 복사되면 카드가 옆으로 밀려 찍힌다 → 여백을 0 으로.
      // 앱 카드 340px ×5 = 1700px / 셀피 카드 540px ×2 = 1080×1720 (54mm 에 약 500dpi)
      const url = await toPng(node, { pixelRatio: cardKind === 'selphy' ? 2 : 5, cacheBust: false, style: { margin: '0' } });
      const a = document.createElement('a');
      a.href = url;
      // 영어·숫자 파일 이름 (한글 이름은 기기에 따라 "download" 로 바뀐다). 예: G7BB_card_A-007_1.png
      a.download = `G7BB_${cardKind === 'selphy' ? 'selphy' : 'card'}_${picked.owner?.ticket_code ?? 'insect'}_${picked.order}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError('카드 그림을 만들지 못했어. PC 크롬에서 다시 해보거나, 카드 화면을 캡처해줘.');
    } finally {
      setSavingCard(false);
    }
  }

  function downloadOriginal() {
    if (!picked) return;
    const { insect, owner, order } = picked;
    try {
      const bytes = atob(insect.image_base64);
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      const mime = insect.mime_type || 'image/jpeg';
      const url = URL.createObjectURL(new Blob([buf], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      // 파일 이름은 영어·숫자만 (한글 이름은 기기에 따라 "download" 로 바뀌어 버린다). 예: G7BB_A-007_1.jpg
      a.download = `G7BB_${owner?.ticket_code ?? 'insect'}_${order}.${mime.includes('png') ? 'png' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setError('그림 파일을 만들지 못했어요. 그림을 길게 눌러 "이미지 저장"으로 받아 주세요.');
    }
  }

  return (
    <main className="poster-page max-w-3xl mx-auto min-h-screen flex flex-col gap-4 px-4 py-6" style={{ wordBreak: 'keep-all' }}>
      <style jsx global>{`
        @page {
          size: A3 portrait;
          margin: 0;
        }
        /* 태블릿 확대(globals.css)를 끈다 — 포스터 크기가 바뀌면 안 된다. */
        html {
          font-size: 16px !important;
        }
        @media print {
          html body {
            background: #020617 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .poster-page {
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            gap: 0 !important;
          }
          .poster-scale {
            transform: none !important;
          }
          .poster-box {
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
          }
        }
        .poster {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      `}</style>

      <div className="no-print flex flex-col gap-4">
        <h1 className="text-xl font-bold text-center">🖼️ 곤충 포스터 · 원본 그림 (직원용)</h1>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(query);
          }}
          className="flex gap-2"
        >
          <input
            className="flex-1 min-w-0 bg-slate-800 rounded-xl px-4 py-3"
            placeholder="번호(14) · 곤충 이름 · 아이 이름"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="bg-sky-500 text-slate-900 font-bold px-5 rounded-xl" disabled={searching}>
            {searching ? '...' : '찾기'}
          </button>
        </form>
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </div>

      {picked && (
        <>
          <div className="no-print bg-slate-800 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-sm text-slate-300">
              <b className="text-lg text-white">{picked.insect.nickname}</b>
              {' · '}
              {picked.owner?.display_name || '(이름 없음)'} ({picked.owner?.ticket_code ?? '번호 없음'}) · {picked.insect.species} · LV.
              {picked.insect.level ?? 1}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={downloadOriginal} className="bg-slate-900 border-2 border-slate-700 font-bold py-3 rounded-xl">
                ⬇️ 원본 그림 받기
                <span className="block text-[11px] font-normal text-slate-400">글자 없는 그림 (피규어용)</span>
              </button>
              {mode === 'card' ? (
                <button onClick={saveCard} disabled={savingCard} className="bg-emerald-500 text-slate-900 font-bold py-3 rounded-xl disabled:opacity-60">
                  {savingCard ? '만드는 중...' : cardKind === 'selphy' ? '🖨️ 셀피 카드용 저장' : '🃏 앱 카드 그림 저장'}
                  <span className="block text-[11px] font-semibold opacity-80">
                    {cardKind === 'selphy' ? '캐논 셀피 카드 용지 54×86mm' : '고화질 PNG'}
                  </span>
                </button>
              ) : (
                <button onClick={() => window.print()} className="bg-emerald-500 text-slate-900 font-bold py-3 rounded-xl">
                  🖨️ A3 로 인쇄
                  <span className="block text-[11px] font-semibold opacity-80">→ “PDF로 저장”</span>
                </button>
              )}
            </div>
            <div className="flex gap-2 text-sm">
              {(['poster', 'image', 'card'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 rounded-xl ${mode === m ? 'bg-amber-400 text-slate-900 font-bold' : 'bg-slate-900'}`}
                >
                  {m === 'poster' ? '꾸민 포스터' : m === 'image' ? '그림만' : '🃏 카드'}
                </button>
              ))}
            </div>
            <label className="bg-slate-900 border-2 border-dashed border-amber-400/60 rounded-xl px-4 py-3 text-sm cursor-pointer">
              <span className="font-bold text-amber-300">🔍 고화질 그림 끼우기</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">
                {hiRes
                  ? `✅ ${hiRes.size}px 그림으로 인쇄해 (A3 약 ${Math.round(hiRes.size / (POSTER_W / 25.4))}dpi). 다른 곤충을 열면 풀려.`
                  : '4배로 키운 그림 파일을 고르면 인쇄할 때 그걸 써. (지금은 1024px → A3 약 88dpi)'}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickHiRes(e.target.files?.[0])} />
            </label>
            {mode === 'card' && (
              <div className="flex gap-2 text-sm">
                {(['selphy', 'app'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setCardKind(k)}
                    className={`flex-1 py-2 rounded-xl ${cardKind === k ? 'bg-sky-400 text-slate-900 font-bold' : 'bg-slate-900'}`}
                  >
                    {k === 'selphy' ? '🖨️ 셀피 카드 (54×86)' : '📱 앱 카드 모양'}
                  </button>
                ))}
              </div>
            )}
            {mode === 'card' && cardKind === 'selphy' ? (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                캐논 셀피 <b>카드 크기(54×86mm)</b> 용지에 딱 맞는 모양이야. 저장한 PNG 를 셀피 앱(Canon PRINT)에서
                용지 <b>카드 크기</b>로 그대로 뽑으면 잘리는 데가 없어. QR 은 <b>{SITE_URL}</b> 로 연결돼.
              </p>
            ) : mode === 'card' ? (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                앱 카드와 똑같은 모양을 <b>5배 크기 PNG</b>로 저장해 (폭 약 1700px — 명함·엽서 크기로 뽑아도 선명해).
                레벨·능력치는 지금 값, QR 은 <b>{SITE_URL}</b> 로 연결돼. 고화질 그림을 끼우면 그림도 더 선명해져.
              </p>
            ) : (
            <p className="text-[11px] text-slate-400 leading-relaxed">
              PC 크롬에서 인쇄 → 대상 <b>PDF로 저장</b> → 용지 <b>A3</b> 확인 → 더보기에서 <b>배경 그래픽</b> 체크 → 저장.
              그 PDF 를 인쇄소에 주면 돼요.
            </p>
            )}
          </div>

          {mode === 'card' && cardKind === 'selphy' ? (
            <div className="overflow-x-auto">
              <div ref={cardRef} className="mx-auto" style={{ width: 540 }}>
                <SelphyCard data={cardData(picked, hiRes?.url)} />
              </div>
            </div>
          ) : mode === 'card' ? (
            <div ref={cardRef} className="w-[21.25rem] mx-auto">
              <InsectCard
                data={{
                  nickname: picked.insect.nickname,
                  ownerName: picked.owner?.display_name,
                  species: picked.insect.species,
                  origin: picked.insect.origin,
                  stats: statsForInsect(picked.insect),
                  level: picked.insect.level ?? 1,
                  image: picked.insect.image_base64,
                  mime: picked.insect.mime_type || 'image/jpeg',
                  ticketCode: picked.owner?.ticket_code ?? null,
                  visit: picked.visit,
                  imageSrc: hiRes?.url,
                  qrOrigin: SITE_URL,
                  hideLabel: true,
                }}
              />
            </div>
          ) : (
            <PosterPreview picked={picked} mode={mode} src={hiRes?.url ?? null} />
          )}
        </>
      )}

      <div className="no-print flex flex-col gap-2">
        <p className="text-xs text-slate-400">{rows.length ? `곤충 ${rows.length}마리` : searching ? '' : '찾은 곤충이 없어요.'}</p>
        {rows.map((row) => {
          const owner = owners.get(row.player_id);
          return (
            <button
              key={row.id}
              onClick={() => open(row)}
              disabled={!!opening}
              className={`text-left bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3 disabled:opacity-60 ${
                picked?.insect.id === row.id ? 'ring-2 ring-amber-400' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{row.nickname}</p>
                <p className="text-xs text-slate-400 truncate">
                  {owner?.display_name || '(이름 없음)'} · {owner?.ticket_code ?? '-'} · {row.species} · LV.{row.level ?? 1}
                </p>
              </div>
              <span className="text-xs text-slate-500 shrink-0">
                {opening === row.id ? '여는 중...' : new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

function cardData(picked: Picked, hiResUrl: string | undefined): InsectCardData {
  return {
    nickname: picked.insect.nickname,
    ownerName: picked.owner?.display_name,
    species: picked.insect.species,
    origin: picked.insect.origin,
    stats: statsForInsect(picked.insect),
    level: picked.insect.level ?? 1,
    image: picked.insect.image_base64,
    mime: picked.insect.mime_type || 'image/jpeg',
    ticketCode: picked.owner?.ticket_code ?? null,
    visit: picked.visit,
    imageSrc: hiResUrl,
    qrOrigin: SITE_URL,
    hideLabel: true,
  };
}

/** A3 실제 크기(mm)로 그리고, 화면에서는 폭에 맞게 줄여서 보여준다. 인쇄할 때는 줄임을 푼다. */
function imageSrc(insect: Insect, src: string | null) {
  return src ?? `data:${insect.mime_type || 'image/jpeg'};base64,${insect.image_base64}`;
}

function PosterPreview({ picked, mode, src }: { picked: Picked; mode: 'poster' | 'image'; src: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setScale(el.parentElement!.clientWidth / (POSTER_W * MM));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
  }, []);

  return (
    <div>
      <div ref={boxRef} className="poster-box overflow-hidden" style={{ width: POSTER_W * MM * scale, height: POSTER_H * MM * scale }}>
        <div className="poster-scale" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {mode === 'poster' ? <Poster picked={picked} src={src} /> : <ImageOnly picked={picked} src={src} />}
        </div>
      </div>
    </div>
  );
}

const STAT_ROWS: { key: 'hp' | 'atk' | 'def' | 'int' | 'eva'; label: string; color: string }[] = [
  { key: 'hp', label: 'HP', color: '#4ade80' },
  { key: 'atk', label: '공격력', color: '#f87171' },
  { key: 'def', label: '수비력', color: '#60a5fa' },
  { key: 'int', label: '지능', color: '#c084fc' },
  { key: 'eva', label: '회피력', color: '#38bdf8' },
];

function Poster({ picked, src }: { picked: Picked; src: string | null }) {
  const { insect, owner, visit } = picked;
  const tier = tierForVisit(visit);
  const stats = statsForInsect(insect);
  const level = insect.level ?? 1;
  const moves = [baseMoveFor(insect.species), secondMoveFor(insect.species, level)].filter(Boolean);
  // 아직 안 열린 두 번째 필살기 — 잠긴 버튼처럼 (2026-10-02 Jin)
  const locked = moves.length < 2 ? secondMoveFor(insect.species, SECOND_MOVE_LEVEL) : null;
  const env = ENVIRONMENTS.find((e) => e.key === insect.origin || e.label === insect.origin);
  const age = ageStageOf(insect.age_stage);
  const sub = [owner?.display_name && owner.display_name !== insect.nickname ? owner.display_name : null, insect.species, age.label]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="poster relative overflow-hidden text-white"
      style={{
        width: `${POSTER_W}mm`,
        height: `${POSTER_H}mm`,
        background: 'radial-gradient(ellipse at 50% 30%, #1e2a78 0%, #0b1033 55%, #020617 100%)',
      }}
    >
      {/* 등급 테두리 (카드와 같은 색) */}
      <div className="absolute" style={{ inset: '6mm', borderRadius: '8mm', padding: '2.2mm', background: tier.frame }}>
        <div className="w-full h-full" style={{ borderRadius: '6mm', background: '#020617' }} />
      </div>

      {/* 머리 — 게임 이름 */}
      <div className="absolute flex items-center justify-center" style={{ left: 0, right: 0, top: '13mm', gap: '4mm' }}>
        <BrandMark size={16 * MM} />
        <span style={{ fontSize: '11mm', fontWeight: 900, letterSpacing: '0.5mm' }}>{GAME_NAME}</span>
      </div>

      {/* 그림 */}
      <div
        className="absolute overflow-hidden"
        style={{ left: '16mm', right: '16mm', top: '34mm', height: `${POSTER_W - 32}mm`, borderRadius: '4mm' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc(insect, src)}
          alt={insect.nickname}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0" style={{ height: '45%', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }} />

        <div
          className="absolute font-black leading-none"
          style={{ top: '6mm', left: '6mm', padding: '3mm 5mm', borderRadius: '3mm', fontSize: '11mm', background: tier.frame, color: tier.ink }}
        >
          LV.{level}
        </div>
        {env && (
          <div className="absolute flex flex-col items-center" style={{ top: '5mm', right: '6mm' }}>
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: '22mm', height: '22mm', fontSize: '12mm', background: 'rgba(2,6,23,0.72)', border: `0.8mm solid ${tier.ink}` }}
            >
              {env.emoji}
            </div>
            <span style={{ fontSize: '4.5mm', fontWeight: 800, marginTop: '1mm', textShadow: '0 0.4mm 1mm #000' }}>{env.label}</span>
          </div>
        )}

        <div className="absolute" style={{ left: '8mm', right: '8mm', bottom: '6mm' }}>
          <div style={{ fontSize: '19mm', fontWeight: 900, lineHeight: 1.05, textShadow: '0 1mm 2mm rgba(0,0,0,0.95)' }}>
            {insect.nickname}
          </div>
          <div style={{ fontSize: '6mm', fontWeight: 700, color: '#cbd5e1', marginTop: '1.5mm' }}>{sub}</div>
        </div>
      </div>

      {/* 아래 — 필살기 · 능력치 */}
      <div
        className="absolute flex"
        style={{ left: '16mm', right: '16mm', top: `${34 + POSTER_W - 32 + 6}mm`, bottom: '22mm', gap: '7mm' }}
      >
        <div className="flex flex-col" style={{ flex: '1 1 0', gap: '3mm' }}>
          <div style={{ fontSize: '5.5mm', fontWeight: 800, color: '#fcd34d' }}>⚡ 필살기</div>
          {moves.map((m) => (
            <div key={m!.key} style={{ background: 'rgba(15,23,42,0.9)', borderRadius: '3mm', padding: '3.5mm 4.5mm' }}>
              <div style={{ fontSize: '8mm', fontWeight: 900 }}>
                {m!.emoji} {m!.name}
              </div>
              <div style={{ fontSize: '4.6mm', color: '#94a3b8', marginTop: '1mm' }}>{m!.description}</div>
            </div>
          ))}
          {locked && (
            <div
              className="flex items-center"
              style={{ border: '0.6mm dashed #475569', borderRadius: '3mm', padding: '3.5mm 4.5mm', gap: '3mm', background: 'rgba(15,23,42,0.4)' }}
            >
              <span style={{ fontSize: '8mm' }}>🔒</span>
              <div>
                <div style={{ fontSize: '8mm', fontWeight: 900, color: '#64748b' }}>{locked.name}</div>
                <div style={{ fontSize: '4.6mm', fontWeight: 800, color: '#fcd34d', marginTop: '1mm' }}>LV{SECOND_MOVE_LEVEL}부터 열려!</div>
              </div>
            </div>
          )}
          {!!stats.grit && (
            <div style={{ fontSize: '5.5mm', fontWeight: 800, color: '#fcd34d' }}>💪 성실함 +{stats.grit}</div>
          )}
        </div>

        <div className="flex flex-col justify-center" style={{ flex: '1 1 0', gap: '4.5mm' }}>
          {STAT_ROWS.map((row) => (
            <div key={row.key} className="flex items-center" style={{ gap: '2.5mm' }}>
              <span style={{ width: '19mm', fontSize: '5.6mm', fontWeight: 700, color: '#cbd5e1' }}>{row.label}</span>
              <div className="flex-1 overflow-hidden" style={{ height: '4.2mm', borderRadius: '2mm', background: '#1e293b' }}>
                <div style={{ height: '100%', width: `${statBarPercent(row.key, stats[row.key])}%`, background: row.color, borderRadius: '2mm' }} />
              </div>
              <span style={{ width: '13mm', textAlign: 'right', fontSize: '6mm', fontWeight: 900 }}>{stats[row.key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 꼬리 */}
      <div
        className="absolute flex justify-between items-center"
        style={{ left: '16mm', right: '16mm', bottom: '11mm', fontSize: '6.6mm', fontWeight: 700, color: '#94a3b8' }}
      >
        <span>2026 대전 곤충박람회 G7BB 배틀 시즌1</span>
        <span style={{ color: '#e2e8f0', fontWeight: 900, letterSpacing: '0.5mm' }}>{owner?.ticket_code ?? ''}</span>
      </div>
    </div>
  );
}

function ImageOnly({ picked, src }: { picked: Picked; src: string | null }) {
  const { insect, owner } = picked;
  return (
    <div
      className="poster relative flex items-center justify-center"
      style={{ width: `${POSTER_W}mm`, height: `${POSTER_H}mm`, background: '#020617' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc(insect, src)}
        alt={insect.nickname}
        style={{ width: `${POSTER_W}mm`, height: `${POSTER_W}mm`, objectFit: 'cover' }}
      />

      {/* 오른쪽 위 — 우리 로고 (2026-10-01 Jin) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.logo.white}
        alt="곤충본부 로고"
        className="absolute"
        style={{ top: '12mm', right: '16mm', height: '41.8mm', width: 'auto' }}
      />

      {/* 왼쪽 아래 — 꾸민 포스터와 같은 꼬리 (시즌1 문구 + 번호) */}
      <div
        className="absolute flex justify-between items-center"
        style={{ left: '16mm', right: '16mm', bottom: '11mm', fontSize: '6.6mm', fontWeight: 700, color: '#94a3b8' }}
      >
        <span>2026 대전 곤충박람회 G7BB 배틀 시즌1</span>
        <span style={{ color: '#e2e8f0', fontWeight: 900, letterSpacing: '0.5mm' }}>{owner?.ticket_code ?? ''}</span>
      </div>
    </div>
  );
}
