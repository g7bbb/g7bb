'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { getCurrentPlayer } from '@/lib/session';
import { loadHeartCounts, loadMyHearts, toggleHeart } from '@/lib/hearts';
import { Player } from '@/lib/types';

// 아이들이 다른 친구 곤충을 구경하며 하트를 누르는 화면입니다.
// 하트는 재미 요소이고 최종 "예쁜 곤충" 순위는 운영자가 정합니다.

// AI 곤충 이미지는 한 장이 꽤 무거워서, 한 번에 다 불러오면 폰이 버벅입니다.
// 그래서 조금씩 끊어서 불러옵니다.
const PAGE_SIZE = 12;

interface GalleryInsect {
  id: string;
  nickname: string;
  species: string | null;
  image_base64: string;
  mime_type: string;
}

export default function GalleryPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [insects, setInsects] = useState<GalleryInsect[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  const loadMore = useCallback(async (offset: number) => {
    setLoading(true);
    const { data } = await supabase
      .from('insects')
      .select('id, nickname, species, image_base64, mime_type')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    const rows = (data || []) as GalleryInsect[];
    setInsects((prev) => [...prev, ...rows]);
    if (rows.length < PAGE_SIZE) setDone(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const [current, heartCounts] = await Promise.all([getCurrentPlayer(), loadHeartCounts()]);
      setPlayer(current);
      setCounts(heartCounts);
      if (current) setMine(await loadMyHearts(current.id));
      await loadMore(0);
    }
    init();
  }, [loadMore]);

  async function handleHeart(insectId: string) {
    if (!player) return;
    const liked = mine.has(insectId);

    // 누르는 즉시 화면에 반영하고, 저장은 뒤에서 처리합니다.
    setMine((prev) => {
      const next = new Set(prev);
      if (liked) next.delete(insectId);
      else next.add(insectId);
      return next;
    });
    setCounts((prev) => {
      const next = new Map(prev);
      next.set(insectId, Math.max(0, (next.get(insectId) ?? 0) + (liked ? -1 : 1)));
      return next;
    });

    await toggleHeart(insectId, player.id, liked);
  }

  return (
    <main className="max-w-md mx-auto min-h-screen flex flex-col gap-5 px-5 py-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold">🎨 친구들 곤충 구경하기</h1>
        <p className="mt-2 text-sm text-slate-400">
          멋진 곤충에 하트를 눌러줘! 예쁜 곤충 상은 하트를 참고해서 정해져요.
        </p>
      </header>

      {!player && (
        <Link
          href="/start"
          className="text-center bg-emerald-500 text-slate-900 font-bold py-3 rounded-2xl"
        >
          하트를 누르려면 먼저 시작하기
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        {insects.map((insect) => {
          const liked = mine.has(insect.id);
          const isOwn = player?.display_name === insect.nickname;
          return (
            <div key={insect.id} className="bg-slate-800 rounded-2xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:${insect.mime_type};base64,${insect.image_base64}`}
                alt={insect.nickname}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
              <div className="px-3 py-2">
                <p className="text-sm font-bold truncate">{insect.nickname}</p>
                {insect.species && (
                  <p className="text-xs text-slate-400 truncate">{insect.species}</p>
                )}
                <button
                  onClick={() => handleHeart(insect.id)}
                  disabled={!player || isOwn}
                  className={`mt-2 w-full py-2 rounded-xl text-sm font-bold disabled:opacity-40 ${
                    liked ? 'bg-pink-500 text-white' : 'bg-slate-700'
                  }`}
                >
                  {liked ? '❤️' : '🤍'} {counts.get(insect.id) ?? 0}
                </button>
                {isOwn && <p className="mt-1 text-[11px] text-slate-500 text-center">내 곤충이야!</p>}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <p className="text-center text-slate-400">불러오는 중...</p>}

      {!loading && insects.length === 0 && (
        <p className="text-center text-slate-400">아직 만들어진 곤충이 없어요.</p>
      )}

      {!loading && !done && insects.length > 0 && (
        <button
          onClick={() => loadMore(insects.length)}
          className="bg-slate-800 py-3 rounded-2xl font-semibold"
        >
          더 보기
        </button>
      )}

      <Link href="/" className="text-center text-slate-400 text-sm py-2">
        ← 처음으로
      </Link>
    </main>
  );
}
