import { strToU8, zipSync } from 'fflate';
import type { Block, Cell, Para, Run } from './model';
import { xml, XML_HEAD } from './xml';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MUTED = '6B7280';
const LINK = '1D4ED8';

/** Cỡ chữ (nửa point) và khoảng cách theo loại khối. */
const STYLE = {
  title: { sz: 36, bold: true, before: 0, after: 60 },
  subtitle: { sz: 20, bold: false, before: 0, after: 240, muted: true },
  heading: { sz: 24, bold: true, before: 240, after: 40 },
  para: { sz: 22, bold: false, before: 0, after: 40 },
} as const;

/** File .docx tối giản (A4), mở được bằng Word, Google Docs, LibreOffice. */
export function blocksToDocx(blocks: readonly Block[]): Uint8Array {
  const links: string[] = [];
  const linkId = (url: string) => {
    links.push(url);
    return `rId${links.length + 100}`;
  };

  const run = (r: Run, base: { sz: number; bold: boolean; muted?: boolean }) => {
    const bold = r.b ?? base.bold;
    const color = r.link ? LINK : r.muted || base.muted ? MUTED : '';
    const props =
      `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>` +
      (bold ? '<w:b/>' : '') +
      (r.i ? '<w:i/>' : '') +
      (color ? `<w:color w:val="${color}"/>` : '') +
      (r.link ? '<w:u w:val="single"/>' : '') +
      `<w:sz w:val="${base.sz}"/><w:szCs w:val="${base.sz}"/>`;
    const t = `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xml(r.text)}</w:t></w:r>`;
    return r.link ? `<w:hyperlink r:id="${linkId(r.link)}" w:history="1">${t}</w:hyperlink>` : t;
  };
  const para = (runs: Para, s: { sz: number; bold: boolean; before: number; after: number; muted?: boolean }) =>
    `<w:p><w:pPr><w:spacing w:before="${s.before}" w:after="${s.after}"/></w:pPr>${runs.map((r) => run(r, s)).join('')}</w:p>`;

  const cell = (c: Cell, widthPct: number, shade?: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="${widthPct * 50}" w:type="pct"/>${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>` +
    (c.length ? c.map((pp) => para(pp, { ...STYLE.para, after: 20 })).join('') : '<w:p/>') +
    `</w:tc>`;

  const table = (b: Extract<Block, { t: 'table' }>) => {
    const n = b.header.length || 1;
    const pct = Math.floor(100 / n);
    const line = (val: string, sz = 4, color = 'D1D5DB') => `w:val="${val}" w:sz="${sz}" w:space="0" w:color="${color}"`;
    const borders =
      `<w:tblBorders><w:top ${line('single')}/><w:left ${line('single')}/><w:bottom ${line('single')}/><w:right ${line('single')}/>` +
      `<w:insideH ${line('single')}/><w:insideV ${b.fold ? line('dashed', 12, '9CA3AF') : line('single')}/></w:tblBorders>`;
    const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.header.map((h) => cell([[{ text: h, b: true }]], pct, 'DFE8E0')).join('')}</w:tr>`;
    const rows = b.rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c) => cell(c, pct)).join('')}</w:tr>`).join('');
    const grid = b.header.map(() => `<w:gridCol w:w="${Math.floor(9638 / n)}"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${head}${rows}</w:tbl><w:p/>`;
  };

  const body = blocks
    .map((b) => {
      if (b.t === 'pagebreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (b.t === 'table') return table(b);
      return para(b.runs, STYLE[b.t]);
    })
    .join('');

  const doc =
    XML_HEAD +
    `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`;

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      XML_HEAD +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    ),
    '_rels/.rels': strToU8(
      XML_HEAD +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    'word/_rels/document.xml.rels': strToU8(
      XML_HEAD +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        links.map((u, i) => `<Relationship Id="rId${i + 101}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(u)}" TargetMode="External"/>`).join('') +
        `</Relationships>`,
    ),
    'word/document.xml': strToU8(doc),
  };
  return zipSync(files, { level: 6 });
}
