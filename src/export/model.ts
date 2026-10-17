import { fmtTime, videoLink, type VocabEntry } from '../vocab';

/** Phần "Kèm theo" trong hộp xuất. */
export interface ExportOptions {
  /** Phiên âm và loại từ. */
  phonetics: boolean;
  /** Câu ví dụ và bản dịch. */
  examples: boolean;
  /** Link video có mốc thời gian. */
  links: boolean;
}

export const DEFAULT_OPTIONS: ExportOptions = { phonetics: true, examples: true, links: true };

/** Một đoạn chữ có định dạng (dùng chung cho Word, PDF, xem trước). */
export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  muted?: boolean;
  link?: string;
}
export type Para = Run[];
/** Ô bảng: nhiều đoạn. */
export type Cell = Para[];

export type Block =
  | { t: 'title' | 'subtitle' | 'heading' | 'para'; runs: Para }
  | { t: 'table'; header: string[]; rows: Cell[][]; fold?: boolean }
  | { t: 'pagebreak' };

/** Ô bảng tính: chữ, hoặc chữ có link (thành công thức HYPERLINK). */
export type SheetCell = string | { text: string; link: string };

export interface Sheet {
  name: string;
  header: string[];
  /** Độ rộng cột (đơn vị ký tự của Excel). */
  widths: number[];
  rows: SheetCell[][];
}

export type ExportOutput =
  | { kind: 'sheets'; sheets: Sheet[] }
  | { kind: 'doc'; title: string; blocks: Block[] }
  | { kind: 'text'; text: string; mime: string; bom?: boolean }
  /** Thẻ Anki: nội dung file + mặt trước/sau (HTML đã escape) để xem trước. */
  | { kind: 'cards'; text: string; cards: { front: string; back: string }[] };

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Vị trí chữ đã chọn trong câu (không phân biệt hoa thường), hoặc -1. */
export function pickedAt(e: Pick<VocabEntry, 'sentence' | 'picked'>): number {
  return e.picked ? e.sentence.toLowerCase().indexOf(e.picked.toLowerCase()) : -1;
}

/** Câu với chữ đã chọn in đậm. */
export function sentenceRuns(e: VocabEntry, extra: Partial<Run> = {}): Para {
  const at = pickedAt(e);
  if (at < 0) return [{ text: e.sentence, ...extra }];
  const end = at + e.picked.length;
  return [
    { text: e.sentence.slice(0, at), ...extra },
    { text: e.sentence.slice(at, end), ...extra, b: true },
    { text: e.sentence.slice(end), ...extra },
  ].filter((r) => r.text);
}

/** "/ipa/ · loại từ" (bỏ phần trống). */
export const phonetic = (e: VocabEntry) => [e.ipa, e.pos].filter(Boolean).join(' · ');

export const linkLabel = (e: VocabEntry) => `▶ ${fmtTime(e.tMs)} · ${e.title || 'YouTube'}`;
export const linkOf = (e: VocabEntry) => videoLink(e);

export const today = () => new Date().toLocaleDateString('vi-VN');

/** Nhóm theo video, giữ thứ tự xuất hiện; trong mỗi video sắp theo mốc thời gian. */
export function byVideo(entries: readonly VocabEntry[]): { title: string; entries: VocabEntry[] }[] {
  const groups = new Map<string, { title: string; entries: VocabEntry[] }>();
  for (const e of entries) {
    const g = groups.get(e.videoId) ?? { title: e.title || e.videoId || 'YouTube', entries: [] };
    g.entries.push(e);
    groups.set(e.videoId, g);
  }
  for (const g of groups.values()) g.entries.sort((a, b) => a.tMs - b.tMs);
  return [...groups.values()];
}
