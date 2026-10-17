import { esc, type Block, type Para, type Sheet } from './model';

const runsHtml = (runs: Para, headingBold = false) =>
  runs
    .map((r) => {
      let h = esc(r.text);
      if (r.b ?? headingBold) h = `<b>${h}</b>`;
      if (r.i) h = `<i>${h}</i>`;
      if (r.muted) h = `<span class="m">${h}</span>`;
      if (r.link) h = `<a href="${esc(r.link)}">${h}</a>`;
      return h;
    })
    .join('');

/**
 * Trang HTML khổ A4 của một tài liệu: dùng để xem trước và để in / lưu PDF
 * (hộp thoại in của trình duyệt → "Lưu dưới dạng PDF").
 */
export function blocksToHtml(title: string, blocks: readonly Block[]): string {
  const body = blocks
    .map((b) => {
      if (b.t === 'pagebreak') return '<div class="pb"></div>';
      if (b.t === 'title') return `<h1>${runsHtml(b.runs)}</h1>`;
      if (b.t === 'subtitle') return `<p class="sub">${runsHtml(b.runs)}</p>`;
      if (b.t === 'heading') return `<h2>${runsHtml(b.runs, true)}</h2>`;
      if (b.t !== 'table') return `<p>${runsHtml(b.runs)}</p>`;
      const head = `<tr>${b.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
      const rows = b.rows.map((r) => `<tr>${r.map((c) => `<td>${c.map((pp) => `<p>${runsHtml(pp)}</p>`).join('')}</td>`).join('')}</tr>`).join('');
      return `<table class="${b.fold ? 'fold' : ''}"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
    })
    .join('\n');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: A4; margin: 18mm; }
html { background: #fff; }
body { margin: 0; padding: 18mm; color: #1f2937; font: 11pt/1.5 Georgia, "Times New Roman", serif; }
@media print { body { padding: 0; } }
h1 { margin: 0 0 2pt; font-size: 18pt; }
.sub { margin: 0 0 14pt; color: #6b7280; font-size: 10pt; }
h2 { margin: 12pt 0 2pt; font-size: 12pt; font-weight: 400; break-after: avoid; }
p { margin: 0 0 2pt; }
.m { color: #6b7280; }
a { color: #1d4ed8; }
.pb { break-after: page; height: 0; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 1px solid #d1d5db; padding: 5pt 7pt; vertical-align: top; text-align: left; }
th { background: #dfe8e0; }
tr { break-inside: avoid; }
table.fold th:first-child, table.fold td:first-child { border-right: 1.5px dashed #9ca3af; }
</style></head><body>${body}</body></html>`;
}

/** Bảng HTML của một trang tính (xem trước). */
export function sheetHtml(s: Sheet, maxRows = 8): string {
  const head = `<tr>${s.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const rows = s.rows
    .slice(0, maxRows)
    .map((r) => `<tr>${r.map((c) => `<td>${typeof c === 'string' ? esc(c) : `<a>${esc(c.text)}</a>`}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}
