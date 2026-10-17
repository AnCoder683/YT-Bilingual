// Cache bản dịch trong IndexedDB của service worker.
// Một bản ghi / (track, ngôn ngữ đích, model, phiên bản prompt); bên trong
// map từ khóa đoạn (băm nội dung) → kết quả dịch của đoạn đó.
// Kết quả tra từ cũng nằm ở đây, khóa bắt đầu bằng "lookup|".

import type { ChunkResult } from '../messages';

const DB_NAME = 'yt-bilingual';
const STORE = 'translations';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Entry<T = ChunkResult> {
  key: string;
  items: Record<string, T>;
  updatedAt: number;
  /** Lần cuối được đọc (bản ghi cũ chưa có thì dùng updatedAt). */
  usedAt?: number;
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

export const isLookupKey = (key: string) => key.startsWith('lookup|');

export async function cacheGet<T = ChunkResult>(key: string): Promise<Record<string, T>> {
  const e = (await tx('readonly', (s) => s.get(key))) as Entry<T> | undefined;
  if (!e) return {};
  // Ghi lại lúc dùng (tối đa mỗi ngày một lần) để tự dọn biết video nào còn xem.
  const now = Date.now();
  if (now - lastUsed(e) > DAY_MS) void tx('readwrite', (s) => s.put({ ...e, usedAt: now })).catch(() => {});
  return e.items;
}

export async function cachePut<T = ChunkResult>(key: string, items: Record<string, T>): Promise<void> {
  const prev = await cacheGet<T>(key);
  const now = Date.now();
  const entry: Entry<T> = { key, items: { ...prev, ...items }, updatedAt: now, usedAt: now };
  await tx('readwrite', (s) => s.put(entry));
}

const lastUsed = (e: Pick<Entry<unknown>, 'updatedAt' | 'usedAt'>) => e.usedAt ?? e.updatedAt;

export interface CacheStats {
  translations: { entries: number; videos: number; bytes: number };
  lookups: { entries: number; bytes: number };
}

/** Dung lượng ước tính (byte UTF-8 của JSON), tách bản dịch và tra từ. */
export function summarize(entries: readonly Entry<unknown>[]): CacheStats {
  const enc = new TextEncoder();
  const s: CacheStats = { translations: { entries: 0, videos: 0, bytes: 0 }, lookups: { entries: 0, bytes: 0 } };
  const videos = new Set<string>();
  for (const e of entries) {
    const bytes = enc.encode(JSON.stringify(e)).length;
    if (isLookupKey(e.key)) {
      s.lookups.entries++;
      s.lookups.bytes += bytes;
    } else {
      s.translations.entries++;
      s.translations.bytes += bytes;
      videos.add(e.key.split('|')[0]!);
    }
  }
  s.translations.videos = videos.size;
  return s;
}

/** Khóa các bản ghi không được dùng từ trước `cutoff`. */
export function staleKeys(entries: readonly Entry<unknown>[], cutoff: number): string[] {
  return entries.filter((e) => lastUsed(e) < cutoff).map((e) => e.key);
}

async function allEntries(): Promise<Entry<unknown>[]> {
  return (await tx('readonly', (s) => s.getAll())) as Entry<unknown>[];
}

export async function cacheStats(): Promise<CacheStats> {
  return summarize(await allEntries());
}

/** Xóa bản ghi không dùng quá `days` ngày; trả về số bản ghi đã xóa. */
export async function cachePrune(days: number, now = Date.now()): Promise<number> {
  if (!(days > 0)) return 0;
  const keys = staleKeys(await allEntries(), now - days * DAY_MS);
  for (const k of keys) await tx('readwrite', (s) => s.delete(k));
  return keys.length;
}

export async function cacheClear(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}
