'use client';

import { readTicketPin } from '@/lib/ticket-pin-client';
import { effectiveVisit } from '@/lib/card';
import { tierForPlayer } from '@/lib/tiers';
import { statsForInsect } from '@/lib/insect-stats';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { findPlayerByTicket, getCurrentPlayer } from '@/lib/session';
import { normalizeTicket } from '@/lib/ticket';
import { Player } from '@/lib/types';
import InsectCard, { InsectCardData } from './insect-card';
import { BrandMark } from '@/app/brand-logo';

// 아이에게 보여주고 현장에서 출력해 줄 **곤충 카드** 화면입니다.
//
// 들어오는 길은 두 가지입니다.
//  1. 곤충을 막 저장한 아이 → 세션(localStorage)으로 자기 카드를 봅니다.
//  2. `/card?t=A-014` → 카드에 박힌 QR 이나 종이 번호로 아무 기기에서나 엽니다.
//     (부스 진행 요원이 출력용으로 띄울 때 이쪽을 씁니다.)
//
// ⚠️ **회차는 따로 저장하지 않고 "그 아이가 만든 곤충 개수"로 셉니다.**
// 종이 번호 하나가 아이 한 명이고, 카드 QR 이 그 번호로 돌아오기 때문에
// 몇 번을 다시 와도 같은 아이로 이어집니다. 컬럼을 새로 만들 필요가 없습니다.

interface InsectRow {
  id: string;
  nickname: string;
  species: string | null;
  origin: string | null;
  stats: any;
  level: number;
  image_base64: string;
  mime_type: string;
  created_at: string;
}

function CardInner() {
  const params = useSearchParams();
  const [cards, setCards] = useState<InsectCardData[]>([]);
  const [picked, setPicked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fromUrl = normalizeTicket(params.get('t') || '');
      let player: Player | null = null;

      if (fromUrl) player = await findPlayerByTicket(fromUrl);
      else player = await getCurrentPlayer();

      if (!player) {
        setError(
          fromUrl
            ? `${fromUrl} 번호로 만든 곤충을 못 찾았어. 번호를 다시 확인해줘!`
            : '아직 시작 안 했어. 종이의 QR을 찍어서 시작해줘!'
        );
        return;
      }

      // 오래된 것부터 불러와야 "몇 번째 곤충"이 순서대로 매겨집니다.
      const { data } = await supabase
        .from('insects')
        .select('id, nickname, species, origin, stats, level, image_base64, mime_type, created_at, body_parts, age_stage, mutations')
        .eq('player_id', player.id)
        .order('created_at', { ascending: true });

      const rows = (data || []) as InsectRow[];
      if (rows.length === 0) {
        setError('아직 만든 곤충이 없어. 곤충을 먼저 만들어줘!');
        return;
      }

      const built = rows.map((row, i) => ({
        nickname: row.nickname,
        ownerName: player!.display_name,
        species: row.species,
        origin: row.origin,
        // 저장된 값 대신 입력값에서 다시 계산합니다 (공식이 바뀌어도 카드가 맞게 나오도록).
        stats: statsForInsect(row as any),
        level: row.level ?? 1,
        image: row.image_base64,
        mime: row.mime_type || 'image/jpeg',
        ticketCode: player!.ticket_code ?? null,
        qrPin: readTicketPin(player!.ticket_code),
        // 만든 순서 = 회차. 5만원·10만원 참가권은 첫 카드부터 금색·다이아 (lib/card.ts)
        visit: effectiveVisit(i + 1, tierForPlayer(player).card),
      }));

      setCards(built);
      setPicked(built.length - 1); // 제일 최근 카드를 먼저 보여줍니다
    } catch (err: any) {
      setError(err.message || '카드를 못 불러왔어. 다시 열어줘!');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-4 px-5 py-8">
      <h1 className="text-2xl font-bold text-center"><BrandMark size={32} className="mr-2 -mt-1" />내 곤충 카드</h1>

      {loading ? (
        <p className="text-center text-slate-400 py-10">불러오는 중...</p>
      ) : error ? (
        <div className="flex flex-col gap-4 items-center py-10">
          <p className="text-center text-rose-400 px-4">{error}</p>
          <Link href="/start" className="bg-slate-800 rounded-xl px-5 py-3 font-semibold">
            시작 화면으로
          </Link>
        </div>
      ) : (
        <>
          <InsectCard data={cards[picked]} />

          {/* 두 번 이상 만든 아이는 지난 카드도 넘겨볼 수 있어야 합니다.
              회차마다 테두리가 달라지는 게 이 체험의 재미 포인트라, 모아보는 맛이 있어야 합니다. */}
          {cards.length > 1 && (
            <div className="flex gap-2 justify-center flex-wrap">
              {cards.map((card, i) => (
                <button
                  key={i}
                  onClick={() => setPicked(i)}
                  className={`px-3 py-2 rounded-lg text-sm font-bold ${
                    i === picked ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {i + 1}번째
                </button>
              ))}
            </div>
          )}

          <p className="text-center text-sm text-slate-400 leading-relaxed">
            📸 <b className="text-slate-200">화면을 사진으로 찍으면</b> 카드를 가져갈 수 있어!
            <br />다시 올 때(30분 뒤)는 카드의 QR 을 찍어줘. 레벨업하거나 새 곤충을 만들 수 있어!
          </p>

          <div className="flex gap-2">
            <Link
              href="/battle"
              className="flex-1 text-center bg-sky-500 text-slate-900 font-bold py-3 rounded-xl"
            >
              ⚔️ 배틀
            </Link>
            <Link
              href="/ranking"
              className="flex-1 text-center bg-slate-800 font-bold py-3 rounded-xl"
            >
              🏆 랭킹
            </Link>
            <Link
              href="/badges"
              className="flex-1 text-center bg-slate-800 font-bold py-3 rounded-xl"
            >
              🏅 뱃지
            </Link>
          </div>
        </>
      )}
    </main>
  );
}

export default function CardPage() {
  return (
    <Suspense fallback={null}>
      <CardInner />
    </Suspense>
  );
}
