import type { LookupResult } from './messages';

/** Một mục trong sổ từ vựng: kết quả tra + câu và vị trí trong video. */
export interface VocabEntry extends LookupResult {
  id: string;
  /** Chữ đúng như trong câu (vd "burned out"; term là dạng gốc "burn out"). */
  picked: string;
  sentence: string;
  translation: string;
  videoId: string;
  title: string;
  /** Đầu câu trong video (ms). */
  tMs: number;
  addedAt: number;
}

const KEY = 'vocab';

export async function loadVocab(): Promise<VocabEntry[]> {
  const got = (await browser.storage.local.get(KEY))[KEY];
  return Array.isArray(got) ? (got as VocabEntry[]) : [];
}

const sameItem = (a: Pick<VocabEntry, 'term' | 'sentence'>, b: Pick<VocabEntry, 'term' | 'sentence'>) =>
  a.term.toLowerCase() === b.term.toLowerCase() && a.sentence === b.sentence;

export async function hasVocab(term: string, sentence: string): Promise<boolean> {
  return (await loadVocab()).some((e) => sameItem(e, { term, sentence }));
}

/** Thêm vào đầu sổ; cùng từ trong cùng câu thì thay mục cũ. */
export async function addVocab(e: Omit<VocabEntry, 'id' | 'addedAt'>): Promise<VocabEntry> {
  const entry: VocabEntry = { ...e, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, addedAt: Date.now() };
  const list = (await loadVocab()).filter((x) => !sameItem(x, entry));
  await browser.storage.local.set({ [KEY]: [entry, ...list] });
  return entry;
}

/** Xóa một hoặc nhiều mục theo id. */
export async function removeVocab(ids: string | readonly string[]): Promise<void> {
  const drop = new Set(typeof ids === 'string' ? [ids] : ids);
  await browser.storage.local.set({ [KEY]: (await loadVocab()).filter((x) => !drop.has(x.id)) });
}

export async function clearVocab(): Promise<void> {
  await browser.storage.local.set({ [KEY]: [] });
}

export function videoLink(e: Pick<VocabEntry, 'videoId' | 'tMs'>): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(e.videoId)}&t=${Math.max(0, Math.floor(e.tMs / 1000))}s`;
}

export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60));
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}
