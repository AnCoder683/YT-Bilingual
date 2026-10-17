import { DEFAULT_OPTIONS, fileName, findFormat, findTemplate, FORMATS, render, type ExportOptions, type ExportOutput } from '@/src/export';
import { blocksToHtml, sheetHtml } from '@/src/export/html';
import { sheetNames } from '@/src/export/xlsx';
import { fmtTime, loadVocab, removeVocab, videoLink, type VocabEntry } from '@/src/vocab';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $<HTMLElement>('list');
const search = $<HTMLInputElement>('search');
const empty = $<HTMLParagraphElement>('empty');

let entries: VocabEntry[] = [];
/** Id các thẻ đang chọn (giữ nguyên khi đổi ô tìm kiếm). */
const selected = new Set<string>();
/** Thẻ vừa bấm chọn, để Shift+bấm chọn cả dải. */
let anchorId: string | null = null;

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
  const box = el('article', selected.has(e.id) ? 'item selected' : 'item');
  const head = el('div');
  const pick = el('div', 'pick');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.checked = selected.has(e.id);
  cb.setAttribute('aria-label', `Chọn “${e.term}”`);
  cb.onclick = (ev) => toggle(e.id, cb.checked, ev.shiftKey);
  pick.append(cb);
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
  del.setAttribute('aria-label', `Xóa “${e.term}”`);
  del.onclick = async () => {
    await removeVocab(e.id);
    selected.delete(e.id);
    await refresh();
  };
  const body = el('div', 'body');
  body.append(head, el('div', 'meaning', e.meaning));
  if (e.definition) body.append(el('div', 'def', e.definition));
  if (e.note) body.append(el('div', 'note', e.note));
  body.append(sentence(e));
  if (e.translation) body.append(el('div', 'translation', e.translation));
  body.append(src);
  box.append(pick, body, del);
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
  renderSelBar();
  if (!box.hidden) updateExport();
}

async function refresh(): Promise<void> {
  entries = await loadVocab();
  const ids = new Set(entries.map((e) => e.id));
  for (const id of selected) if (!ids.has(id)) selected.delete(id);
  renderList();
}

// ---------- Chọn thẻ ----------

/** Bấm ô chọn; Shift+bấm chọn (hoặc bỏ chọn) cả dải từ thẻ bấm trước đó. */
function toggle(id: string, on: boolean, range: boolean): void {
  const shown = filtered().map((e) => e.id);
  const a = anchorId ? shown.indexOf(anchorId) : -1;
  const b = shown.indexOf(id);
  const ids = range && a >= 0 && b >= 0 ? shown.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
  for (const x of ids) on ? selected.add(x) : selected.delete(x);
  anchorId = id;
  renderList();
}

const selBar = $<HTMLElement>('selBar');
const selAll = $<HTMLInputElement>('selAll');

/** Thanh chọn luôn hiện (trừ khi sổ trống); có thẻ chọn thì hiện Bỏ chọn / Xóa. */
function renderSelBar(): void {
  const n = selected.size;
  const shown = filtered();
  const onShown = shown.filter((e) => selected.has(e.id)).length;
  selBar.hidden = entries.length === 0;
  selBar.classList.toggle('active', n > 0);
  selAll.checked = shown.length > 0 && onShown === shown.length;
  selAll.indeterminate = onShown > 0 && onShown < shown.length;
  selAll.disabled = shown.length === 0;
  const all = search.value.trim() ? 'Chọn hết kết quả' : 'Chọn tất cả';
  const text = $('selText');
  if (n) text.replaceChildren(el('span', 'unit', 'Đã chọn '), `${n} / ${entries.length}`, el('span', 'unit', ' từ'));
  else text.textContent = all;
  selAll.setAttribute('aria-label', all);
  $('selNone').hidden = $('selDelete').hidden = !n;
  // Màn hình hẹp ẩn phần .unit: "Xóa" / "Xuất".
  $('selDeleteLabel').replaceChildren('Xóa', el('span', 'unit', ` ${n} từ`));
  if (n) $('exportLabel').replaceChildren('Xuất', el('span', 'unit', ` ${n} từ`));
  else $('exportLabel').textContent = 'Xuất file';
}

/** Đã chọn hết các thẻ đang hiện → bỏ chọn chúng; ngược lại chọn hết. */
selAll.onchange = () => {
  const shown = filtered();
  const allOn = shown.every((e) => selected.has(e.id));
  for (const e of shown) allOn ? selected.delete(e.id) : selected.add(e.id);
  renderList();
};
$('selNone').onclick = () => {
  selected.clear();
  renderList();
};
$('selDelete').onclick = async () => {
  const n = selected.size;
  if (!n || !confirm(`Xóa ${n} từ đã chọn khỏi sổ?`)) return;
  await removeVocab([...selected]);
  selected.clear();
  await refresh();
};

search.oninput = renderList;


// Lưu từ ở tab YouTube khác thì trang này cập nhật luôn.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.vocab) void refresh();
});

// ---------- Hộp xuất file ----------

const btn = $<HTMLButtonElement>('exportBtn');
/** Lớp phủ chứa hộp xuất (hidden = đang đóng). */
const box = $<HTMLElement>('exportOverlay');
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

const scopeRadio = (v: 'all' | 'selected') => document.querySelector<HTMLInputElement>(`input[name="scope"][value="${v}"]`)!;

/** Các mục sẽ xuất, giữ thứ tự trong sổ. */
function scoped(): VocabEntry[] {
  return scopeRadio('selected').checked ? entries.filter((e) => selected.has(e.id)) : entries;
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
  const n = selected.size;
  const sel = scopeRadio('selected');
  sel.disabled = !n;
  if (!n && sel.checked) scopeRadio('all').checked = true;
  $('scopeSelected').textContent = n ? `Các thẻ đang chọn (${n} từ)` : 'Các thẻ đang chọn (chưa chọn thẻ nào)';

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
  const wasOpen = box.hidden === false;
  box.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('modal-open', open); // trang phía sau không cuộn theo
  if (!open && wasOpen) btn.focus();
  // Mở hộp khi đang có thẻ chọn thì mặc định xuất các thẻ đó.
  if (open && !wasOpen && selected.size) scopeRadio('selected').checked = true;
  if (open) {
    updateExport();
    fmtSel.focus();
  }
}

btn.onclick = () => openExport(true);
$('exportClose').onclick = () => openExport(false);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!box.hidden) openExport(false);
  else if (selected.size) {
    selected.clear();
    renderList();
  }
});
// Bấm vào vùng mờ bên ngoài hộp thì đóng.
box.addEventListener('pointerdown', (e) => {
  if (e.target === box) openExport(false);
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
