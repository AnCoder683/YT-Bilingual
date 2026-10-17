import { DEFAULT_OPTIONS, fileName, findFormat, findTemplate, FORMATS, render, type ExportOptions, type ExportOutput } from '@/src/export';
import { blocksToHtml, sheetHtml } from '@/src/export/html';
import { sheetNames } from '@/src/export/xlsx';
import { clearVocab, fmtTime, loadVocab, removeVocab, videoLink, type VocabEntry } from '@/src/vocab';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $<HTMLElement>('list');
const search = $<HTMLInputElement>('search');
const empty = $<HTMLParagraphElement>('empty');

let entries: VocabEntry[] = [];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Câu với chữ đã chọn in đậm. */
function sentence(e: VocabEntry): HTMLElement {
  const div = el('div', 'sentence');
  const at = e.picked ? e.sentence.toLowerCase().indexOf(e.picked.toLowerCase()) : -1;
  if (at < 0) div.textContent = e.sentence;
  else div.append(e.sentence.slice(0, at), el('b', undefined, e.sentence.slice(at, at + e.picked.length)), e.sentence.slice(at + e.picked.length));
  return div;
}

function item(e: VocabEntry): HTMLElement {
  const box = el('article', 'item');
  const head = el('div');
  head.append(el('span', 'term', e.term), el('span', 'meta', [e.ipa, e.pos].filter(Boolean).join(' · ')));
  const link = el('a', undefined, `▶ ${fmtTime(e.tMs)} · ${e.title || 'YouTube'}`);
  link.href = videoLink(e);
  link.target = '_blank';
  link.rel = 'noopener';
  const src = el('div', 'source');
  src.append(link, ` · ${new Date(e.addedAt).toLocaleDateString('vi-VN')}`);
  const del = el('button', 'del', '✕');
  del.type = 'button';
  del.title = 'Xóa khỏi sổ';
  del.onclick = async () => {
    await removeVocab(e.id);
    await refresh();
  };
  box.append(head, el('div', 'meaning', e.meaning), el('div', 'def', e.definition));
  if (e.note) box.append(el('div', 'note', e.note));
  box.append(sentence(e));
  if (e.translation) box.append(el('div', 'translation', e.translation));
  box.append(src, del);
  return box;
}

/** Các mục khớp ô tìm kiếm (tất cả nếu ô trống). */
function filtered(): VocabEntry[] {
  const q = search.value.trim().toLowerCase();
  return q
    ? entries.filter((e) => [e.term, e.picked, e.meaning, e.definition, e.sentence, e.translation].some((s) => s.toLowerCase().includes(q)))
    : entries;
}

function renderList(): void {
  $('count').textContent = `(${entries.length})`;
  list.replaceChildren(...filtered().map(item));
  empty.hidden = entries.length > 0;
  if (!box.hidden) updateExport();
}

async function refresh(): Promise<void> {
  entries = await loadVocab();
  renderList();
}

search.oninput = renderList;

$('clear').onclick = async () => {
  if (!entries.length || !confirm(`Xóa cả ${entries.length} từ trong sổ?`)) return;
  await clearVocab();
  await refresh();
};

// Lưu từ ở tab YouTube khác thì trang này cập nhật luôn.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.vocab) void refresh();
});

// ---------- Hộp xuất file ----------

const btn = $<HTMLButtonElement>('exportBtn');
const box = $<HTMLElement>('exportBox');
const fmtSel = $<HTMLSelectElement>('fmt');
const tpls = $<HTMLElement>('tpls');
const preview = $<HTMLElement>('preview');
const optInputs = {
  phonetics: $<HTMLInputElement>('optPhonetics'),
  examples: $<HTMLInputElement>('optExamples'),
  links: $<HTMLInputElement>('optLinks'),
};
const PREFS = 'exportPrefs';

interface Prefs {
  format: string;
  template: string;
  options: ExportOptions;
}
let prefs: Prefs = { format: 'xlsx', template: 'full', options: { ...DEFAULT_OPTIONS } };

fmtSel.replaceChildren(...FORMATS.map((f) => new Option(`${f.name} (${f.ext})`, f.id)));

function savePrefs(): void {
  void browser.storage.local.set({ [PREFS]: prefs });
}

function scoped(): VocabEntry[] {
  const v = document.querySelector<HTMLInputElement>('input[name="scope"]:checked')?.value;
  return v === 'filtered' ? filtered() : entries;
}

function current() {
  const format = findFormat(prefs.format);
  const template = findTemplate(format, prefs.template);
  return { format, template };
}

function renderTemplates(): void {
  const { format, template } = current();
  tpls.replaceChildren(
    ...format.templates.map((t) => {
      const b = el('button', 'tpl');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t.id === template.id));
      const title = el('span', 'tpl-title');
      title.append(el('span', 'dot'), el('span', 'tpl-name', t.name));
      if (t.rec) title.append(el('span', 'badge', 'Nên dùng'));
      b.append(title, el('span', 'tpl-desc', t.desc));
      b.onclick = () => {
        prefs.template = t.id;
        savePrefs();
        updateExport();
      };
      return b;
    }),
  );
}

const HINTS: Record<string, string> = {
  xlsx: 'Dòng tiêu đề cố định, lọc được; cột Video bấm mở đúng chỗ',
  docx: 'Mở bằng Word / Google Docs, sửa được',
  pdf: 'Mở hộp thoại in → chọn “Lưu dưới dạng PDF”',
  anki: 'Anki 2.1.55+ tự nhận kiểu thẻ, HTML và tag',
  quizlet: 'Quizlet: Tạo học phần → Nhập → dán',
  md: 'Dán vào Notion / Obsidian giữ nguyên định dạng',
  csv: 'UTF-8 có BOM: Excel mở đúng tiếng Việt',
};

let lastOut: ExportOutput | null = null;

function renderPreview(out: ExportOutput): void {
  if (!scoped().length) {
    preview.replaceChildren(el('div', 'pv-empty', 'Không có từ nào để xuất.'));
    return;
  }
  if (out.kind === 'sheets') {
    const names = sheetNames(out.sheets.map((s) => s.name));
    const wrap = el('div', 'pv-sheet');
    const tabs = el('div', 'pv-tabs');
    tabs.append(...names.map((n, i) => el('span', i === 0 ? 'tab on' : 'tab', n)));
    const table = el('div', 'pv-table');
    table.innerHTML = sheetHtml(out.sheets[0]!); // nội dung đã escape
    wrap.append(tabs, table);
    preview.replaceChildren(wrap);
  } else if (out.kind === 'doc') {
    const frame = el('iframe', 'pv-doc');
    frame.title = 'Xem trước tài liệu';
    frame.setAttribute('sandbox', '');
    frame.srcdoc = blocksToHtml(out.title, out.blocks);
    const wrap = el('div', 'pv-page');
    wrap.append(frame);
    preview.replaceChildren(wrap);
  } else if (out.kind === 'cards') {
    const c = out.cards[0]!;
    const face = (label: string, html: string) => {
      const f = el('div', 'face');
      const body = el('div', 'face-body');
      const inner = el('div');
      inner.innerHTML = html; // HTML của thẻ, đã escape khi tạo
      body.append(inner);
      f.append(el('div', 'face-label', label), body);
      return f;
    };
    const faces = el('div', 'faces');
    faces.append(face('Mặt trước', c.front), face('Mặt sau', c.back));
    const line = out.text.split('\n').find((l) => l && !l.startsWith('#')) ?? '';
    preview.replaceChildren(faces, el('div', 'hint', 'Dòng đầu trong file:'), el('pre', 'pv-text small', line));
  } else {
    preview.replaceChildren(el('pre', 'pv-text', out.text.split('\n').slice(0, 80).join('\n')));
  }
}

function updateExport(): void {
  const { format, template } = current();
  fmtSel.value = format.id;
  $('fmtDesc').textContent = format.desc;
  renderTemplates();
  for (const [k, input] of Object.entries(optInputs)) {
    input.checked = prefs.options[k as keyof ExportOptions];
    input.disabled = !!format.fixedColumns;
  }
  $('optNote').hidden = !format.fixedColumns;
  $('scopeAll').textContent = `Cả sổ (${entries.length} từ)`;
  const q = search.value.trim();
  const fr = document.querySelector<HTMLInputElement>('input[name="scope"][value="filtered"]')!;
  fr.disabled = !q;
  if (!q && fr.checked) document.querySelector<HTMLInputElement>('input[name="scope"][value="all"]')!.checked = true;
  $('scopeFiltered').textContent = q ? `Kết quả đang tìm (${filtered().length} từ)` : 'Kết quả đang tìm (chưa tìm gì)';

  lastOut = template.build(scoped(), prefs.options);
  renderPreview(lastOut);
  $('pvHint').textContent = HINTS[format.id] ?? '';
  $('fname').textContent = fileName(format, template);
  const dl = $<HTMLButtonElement>('downloadBtn');
  dl.textContent = format.id === 'pdf' ? 'In / Lưu PDF' : 'Tải xuống';
  dl.disabled = !scoped().length;
  $('copyBtn').hidden = !(lastOut.kind === 'text' || lastOut.kind === 'cards');
}

function openExport(open: boolean): void {
  box.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) {
    updateExport();
    fmtSel.focus();
  }
}

btn.onclick = () => openExport(box.hidden !== false); // hidden có thể là 'until-found'
$('exportClose').onclick = () => openExport(false);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !box.hidden) openExport(false);
});
document.addEventListener('pointerdown', (e) => {
  if (!box.hidden && !box.contains(e.target as Node) && !btn.contains(e.target as Node)) openExport(false);
});

fmtSel.onchange = () => {
  prefs.format = fmtSel.value;
  prefs.template = findFormat(fmtSel.value).templates[0]!.id;
  savePrefs();
  updateExport();
};
for (const [k, input] of Object.entries(optInputs)) {
  input.onchange = () => {
    prefs.options = { ...prefs.options, [k]: input.checked };
    savePrefs();
    updateExport();
  };
}
for (const r of document.querySelectorAll<HTMLInputElement>('input[name="scope"]')) r.onchange = updateExport;

/** PDF: in trang HTML trong iframe ẩn; người dùng chọn "Lưu dưới dạng PDF". */
function printHtml(html: string): void {
  const frame = el('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.append(frame);
}

$('downloadBtn').onclick = () => {
  const { format, template } = current();
  const out = template.build(scoped(), prefs.options);
  const r = render(format, out);
  if ('printHtml' in r) return printHtml(r.printHtml);
  const a = el('a');
  a.href = URL.createObjectURL(r.blob);
  a.download = fileName(format, template);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

$('copyBtn').onclick = async () => {
  if (!lastOut || !(lastOut.kind === 'text' || lastOut.kind === 'cards')) return;
  await navigator.clipboard.writeText(lastOut.text);
  const b = $('copyBtn');
  b.textContent = '✓ Đã chép';
  setTimeout(() => (b.textContent = 'Chép'), 1500);
};

void browser.storage.local.get(PREFS).then((got) => {
  const p = got[PREFS] as Partial<Prefs> | undefined;
  if (p) prefs = { format: p.format ?? prefs.format, template: p.template ?? prefs.template, options: { ...DEFAULT_OPTIONS, ...p.options } };
});

void refresh();
