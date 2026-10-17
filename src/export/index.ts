import type { VocabEntry } from '../vocab';
import { blocksToDocx } from './docx';
import { blocksToHtml } from './html';
import type { ExportOptions, ExportOutput } from './model';
import * as T from './templates';
import { sheetsToXlsx } from './xlsx';

export { DEFAULT_OPTIONS, type ExportOptions, type ExportOutput } from './model';

export interface Template {
  id: string;
  name: string;
  desc: string;
  /** Gắn nhãn "Nên dùng". */
  rec?: boolean;
  /** Phần tên file (không dấu). */
  slug: string;
  build(entries: readonly VocabEntry[], o: ExportOptions): ExportOutput;
}

export interface Format {
  id: 'xlsx' | 'docx' | 'pdf' | 'anki' | 'quizlet' | 'md' | 'csv';
  name: string;
  ext: string;
  desc: string;
  /** Tuỳ chọn "Kèm theo" không áp dụng (CSV luôn đủ cột). */
  fixedColumns?: boolean;
  templates: Template[];
}

const docTemplates = (): Template[] => [
  { id: 'notebook', name: 'Sổ tay từ vựng', desc: 'Mỗi từ một khối: nghĩa, định nghĩa, câu ví dụ', rec: true, slug: 'so-tay', build: (e, o) => ({ kind: 'doc', title: 'Sổ tay từ vựng', blocks: T.docNotebook(e, o) }) },
  { id: 'cloze', name: 'Bài tập điền từ', desc: 'Câu bị che từ, đáp án ở trang cuối', slug: 'bai-tap-dien-tu', build: (e, o) => ({ kind: 'doc', title: 'Bài tập điền từ', blocks: T.docCloze(e, o) }) },
  { id: 'fold', name: 'Gập đôi tự kiểm tra', desc: 'Hai cột Từ | Nghĩa, gập giấy để che', slug: 'gap-doi', build: (e, o) => ({ kind: 'doc', title: 'Gập đôi tự kiểm tra', blocks: T.docFold(e, o) }) },
];

const ankiTemplate = (id: T.AnkiKind, name: string, desc: string, slug: string, rec = false): Template => ({
  id,
  name,
  desc,
  rec,
  slug,
  build: (e, o) => ({ kind: 'cards', ...T.anki(e, o, id) }),
});

export const FORMATS: readonly Format[] = [
  {
    id: 'xlsx',
    name: 'Excel',
    ext: '.xlsx',
    desc: 'Excel, Google Sheets, LibreOffice',
    templates: [
      { id: 'full', name: 'Bảng đầy đủ', desc: 'Mỗi từ một dòng, đủ mọi cột', rec: true, slug: 'bang-day-du', build: (e, o) => ({ kind: 'sheets', sheets: T.sheetsFull(e, o) }) },
      { id: 'review', name: 'Bảng ôn nhanh', desc: 'Từ · Nghĩa · Câu ví dụ', slug: 'on-nhanh', build: (e, o) => ({ kind: 'sheets', sheets: T.sheetsReview(e, o) }) },
      { id: 'byvideo', name: 'Theo video', desc: 'Mỗi video một trang tính', slug: 'theo-video', build: (e, o) => ({ kind: 'sheets', sheets: T.sheetsByVideo(e, o) }) },
    ],
  },
  { id: 'docx', name: 'Word', ext: '.docx', desc: 'Tài liệu sửa được, in đẹp', templates: docTemplates() },
  { id: 'pdf', name: 'PDF', ext: '.pdf', desc: 'In ra giấy hoặc lưu PDF để đọc trên điện thoại', templates: docTemplates() },
  {
    id: 'anki',
    name: 'Anki',
    ext: '.txt',
    desc: 'Anki: File → Import',
    templates: [
      ankiTemplate('cloze', 'Điền chỗ trống (Cloze)', 'Câu thật bị che đúng chữ đã tra', 'anki-cloze', true),
      ankiTemplate('basic', 'Cơ bản', 'Trước: từ + câu · Sau: nghĩa', 'anki-co-ban'),
      ankiTemplate('reverse', 'Hai chiều', 'Thêm thẻ ngược: nghĩa → từ', 'anki-hai-chieu'),
    ],
  },
  {
    id: 'quizlet',
    name: 'Quizlet',
    ext: '.txt',
    desc: 'Quizlet: Tạo học phần → Nhập → dán',
    templates: [
      { id: 'term', name: 'Từ ↔ Nghĩa', desc: 'Thuật ngữ và định nghĩa', rec: true, slug: 'quizlet-tu-nghia', build: (e, o) => ({ kind: 'text', text: T.quizlet(e, o, 'term'), mime: 'text/plain' }) },
      { id: 'sentence', name: 'Câu ↔ Bản dịch', desc: 'Luyện cả câu', slug: 'quizlet-cau', build: (e, o) => ({ kind: 'text', text: T.quizlet(e, o, 'sentence'), mime: 'text/plain' }) },
    ],
  },
  {
    id: 'md',
    name: 'Markdown',
    ext: '.md',
    desc: 'Notion, Obsidian, ghi chú',
    templates: [
      { id: 'table', name: 'Bảng', desc: 'Dán vào Notion thành bảng', rec: true, slug: 'bang', build: (e, o) => ({ kind: 'text', text: T.markdownTable(e, o), mime: 'text/markdown' }) },
      { id: 'notes', name: 'Ghi chú theo video', desc: 'Nhóm theo video, link mốc thời gian', slug: 'ghi-chu-theo-video', build: (e, o) => ({ kind: 'text', text: T.markdownNotes(e, o), mime: 'text/markdown' }) },
    ],
  },
  {
    id: 'csv',
    name: 'CSV',
    ext: '.csv',
    desc: 'Dữ liệu thô cho ứng dụng khác',
    fixedColumns: true,
    templates: [
      // BOM để Excel mở đúng tiếng Việt khi bấm đúp.
      { id: 'raw', name: 'Tất cả các cột', desc: 'UTF-8, dòng đầu là tên cột', rec: true, slug: 'du-lieu', build: (e) => ({ kind: 'text', text: T.csvRaw(e), mime: 'text/csv', bom: true }) },
    ],
  },
];

export function findFormat(id: string | undefined): Format {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0]!;
}

export function findTemplate(f: Format, id: string | undefined): Template {
  return f.templates.find((t) => t.id === id) ?? f.templates[0]!;
}

export function fileName(f: Format, t: Template): string {
  return `tu-vung-${t.slug}${f.id === 'pdf' ? '.pdf' : f.ext}`;
}

/** Nội dung file để tải về (PDF: trang HTML để in → "Lưu dưới dạng PDF"). */
export function render(f: Format, out: ExportOutput): { blob: Blob } | { printHtml: string } {
  switch (out.kind) {
    case 'sheets':
      return { blob: new Blob([sheetsToXlsx(out.sheets) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
    case 'doc':
      if (f.id === 'pdf') return { printHtml: blocksToHtml(out.title, out.blocks) };
      return { blob: new Blob([blocksToDocx(out.blocks) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) };
    case 'cards':
      return { blob: new Blob([out.text], { type: 'text/plain;charset=utf-8' }) };
    case 'text':
      return { blob: new Blob([out.bom ? '﻿' : '', out.text], { type: `${out.mime};charset=utf-8` }) };
  }
}
