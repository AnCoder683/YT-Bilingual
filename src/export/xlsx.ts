import { strToU8, zipSync } from 'fflate';
import type { Sheet } from './model';
import { xml, XML_HEAD } from './xml';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** A, B, …, Z, AA, … */
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Tên trang tính hợp lệ: bỏ []:*?/\, tối đa 31 ký tự, không trùng. */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = raw.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').replace(/\s+/g, ' ').trim() || 'Sheet';
    let name = base.slice(0, 31);
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base.slice(0, 31 - ` (${k})`.length)} (${k})`;
    used.add(name.toLowerCase());
    return name;
  });
}

function sheetXml(s: Sheet): string {
  const lastCol = colName(Math.max(0, s.header.length - 1));
  const lastRow = s.rows.length + 1;
  const str = (ref: string, text: string, style = 0) =>
    `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  const header = s.header.map((h, i) => str(`${colName(i)}1`, h, 1)).join('');
  const rows = s.rows
    .map((row, r) => {
      const cells = row
        .map((cell, i) => {
          const ref = `${colName(i)}${r + 2}`;
          if (typeof cell === 'string') return cell ? str(ref, cell) : '';
          // Link: công thức HYPERLINK, kèm giá trị hiển thị sẵn.
          const f = `HYPERLINK("${cell.link.replace(/"/g, '""')}","${cell.text.replace(/"/g, '""')}")`;
          return `<c r="${ref}" t="str" s="2"><f>${xml(f)}</f><v>${xml(cell.text)}</v></c>`;
        })
        .join('');
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join('');
  const cols = s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return (
    XML_HEAD +
    `<worksheet xmlns="${NS}" xmlns:r="${NS_R}">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData><row r="1">${header}</row>${rows}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
    `</worksheet>`
  );
}

const STYLES =
  XML_HEAD +
  `<styleSheet xmlns="${NS}">` +
  `<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><u/><sz val="11"/><color rgb="FF1D4ED8"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDFE8E0"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** File .xlsx tối giản (OOXML), mở được bằng Excel, Google Sheets, LibreOffice. */
export function sheetsToXlsx(sheets: readonly Sheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: 'Từ vựng', header: [], widths: [], rows: [] }];
  const names = sheetNames(list.map((s) => s.name));
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, text: string) => (files[path] = strToU8(text));

  put(
    '[Content_Types].xml',
    XML_HEAD +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      `</Types>`,
  );
  put(
    '_rels/.rels',
    XML_HEAD +
      `<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  const quoted = (n: string) => `'${n.replace(/'/g, "''")}'`;
  put(
    'xl/workbook.xml',
    XML_HEAD +
      `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>` +
      names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      `</sheets><definedNames>` +
      list
        .map(
          (s, i) =>
            `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xml(quoted(names[i]!))}!$A$1:$${colName(Math.max(0, s.header.length - 1))}$${s.rows.length + 1}</definedName>`,
        )
        .join('') +
      `</definedNames></workbook>`,
  );
  put(
    'xl/_rels/workbook.xml.rels',
    XML_HEAD +
      `<Relationships xmlns="${NS_PKG}">` +
      list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  put('xl/styles.xml', STYLES);
  list.forEach((s, i) => put(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zipSync(files, { level: 6 });
}
