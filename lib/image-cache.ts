import { supabase } from './supabaseClient';

/**
 * 🗂️ 곤충 그림을 **그 기기에 저장해두고 다시 안 받기** (2026-10-04 Jin: "퀄리티 그대로 데이터를 줄일 수 있으면")
 *
 * 곤충 그림은 한 번 만들어지면 바뀌지 않는다 → 곤충 id 로 기기(IndexedDB)에 넣어두고,
 * 다음부터는 **처음 보는 곤충 그림만** 서버에서 받는다. 그림은 원본 그대로라 화질은 똑같다.
 * 홍보 영상(/attract·첫 화면)·실시간 랭킹(/live)·랭킹 화면이 10~15분마다 새로 받던 그림이 거의 0 이 된다.
 *
 * - 저장이 안 되는 기기(사생활 보호 모드 등)는 그냥 서버에서 받는다 — 지금까지와 같다.
 * - 너무 쌓이지 않게 MAX_KEEP 장을 넘으면 오래된 것부터 지운다 (한 장 0.5MB 안팎).
 */

const DB_NAME = 'g7bb-img';
const STORE = 'img';
const MAX_KEEP = 80;

/** 같은 화면 안에서 다시 열 때(첫 화면 영상 등)는 기기 저장소도 안 거치게 */
const memory = new Map<string, string>();
const MEMORY_KEEP = 30;

function remember(id: string, src: string) {
  memory.delete(id);
  memory.set(id, src);
  while (memory.size > MEMORY_KEEP) memory.delete(memory.keys().next().value as string);
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('t', 't');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readSaved(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const db = await openDb();
  if (!db || ids.length === 0) return out;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      ids.forEach((id) => {
        const r = store.get(id);
        r.onsuccess = () => {
          if (r.result?.src) out.set(id, r.result.src);
        };
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // 못 읽으면 서버에서 받으면 된다
  }
  return out;
}

async function save(items: { id: string; src: string }[]) {
  const db = await openDb();
  if (!db || items.length === 0) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const now = Date.now();
    items.forEach((it, i) => store.put({ id: it.id, src: it.src, t: now + i }));
    // 오래된 것 지우기
    const count = store.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_KEEP;
      if (extra <= 0) return;
      const cur = store.index('t').openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c || extra <= 0) return;
        c.delete();
        extra--;
        c.continue();
      };
    };
  } catch {
    // 저장 실패해도 그림은 이미 받았다 — 다음에 또 받으면 됨
  }
}

/**
 * 곤충 id 들의 그림(data URL)을 돌려준다. 기기에 있으면 그걸, 없는 것만 서버에서 받는다.
 * 그림이 없는 곤충은 결과에 안 들어간다.
 */
export async function loadInsectImages(insectIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(insectIds)).filter(Boolean);
  const out = new Map<string, string>();
  const need: string[] = [];
  ids.forEach((id) => {
    const m = memory.get(id);
    if (m) out.set(id, m);
    else need.push(id);
  });
  if (need.length === 0) return out;

  const saved = await readSaved(need);
  saved.forEach((src, id) => {
    out.set(id, src);
    remember(id, src);
  });
  const missing = need.filter((id) => !saved.has(id));
  if (missing.length === 0) return out;

  const { data } = await supabase.from('insects').select('id, image_base64, mime_type').in('id', missing);
  const fresh: { id: string; src: string }[] = [];
  (data || []).forEach((r: any) => {
    if (!r.image_base64) return;
    const src = `data:${r.mime_type || 'image/jpeg'};base64,${r.image_base64}`;
    out.set(r.id, src);
    remember(r.id, src);
    fresh.push({ id: r.id, src });
  });
  void save(fresh);
  return out;
}
