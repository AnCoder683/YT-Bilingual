// Cache bản dịch trong IndexedDB của service worker.
// Một bản ghi / (track, ngôn ngữ đích, model, phiên bản prompt); bên trong
// map từ khóa đoạn (băm nội dung) → kết quả dịch của đoạn đó.

import type { ChunkResult } from '../messages';

const DB_NAME = 'yt-bilingual';
const STORE = 'translations';

interface Entry {
  key: string;
  items: Record<string, ChunkResult>;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function cacheKey(track: string, targetLang: string, model: string, promptVersion: number): string {
  return [track, targetLang, model, `p${promptVersion}`].join('|');
}

export async function cacheGet(key: string): Promise<Record<string, ChunkResult>> {
  const e = (await tx('readonly', (s) => s.get(key))) as Entry | undefined;
  return e?.items ?? {};
}

export async function cachePut(key: string, items: Record<string, ChunkResult>): Promise<void> {
  const prev = await cacheGet(key);
  const entry: Entry = { key, items: { ...prev, ...items }, updatedAt: Date.now() };
  await tx('readwrite', (s) => s.put(entry));
}
