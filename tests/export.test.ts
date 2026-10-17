import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, fileName, FORMATS, render } from '@/src/export';
import { blocksToDocx } from '@/src/export/docx';
import { blocksToHtml } from '@/src/export/html';
import * as T from '@/src/export/templates';
import { colName, sheetNames, sheetsToXlsx } from '@/src/export/xlsx';
import type { VocabEntry } from '@/src/vocab';

const e = (over: Partial<VocabEntry> = {}): VocabEntry => ({
  id: '1',
  addedAt: Date.UTC(2026, 9, 17),
  term: 'burn out',
  ipa: '/bɜːrn aʊt/',
  pos: 'phrasal verb',
  meaning: 'kiệt sức',
  definition: 'to become exhausted',
  note: '',
  picked: 'burned out',
  sentence: "I'm just burned out, really.",
  translation: 'Tôi thật sự kiệt sức.',
  videoId: 'abc',
  title: 'Video A & "B" <1>',
  tMs: 83_500,
  ...over,
});
const ENTRIES = [
  e(),
  e({ id: '2', term: 'kind of', picked: 'kind of', meaning: 'hơi | có phần', sentence: "I'm kind of old-fashioned.", videoId: 'xyz', title: 'Video B', tMs: 13_000 }),
];
const NONE = { phonetics: false, examples: false, links: false };

const unzip = (bytes: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)]));

describe('mọi định dạng × mẫu', () => {
  for (const f of FORMATS) {
    for (const t of f.templates) {
      it(`${f.id}/${t.id}: tạo được với dữ liệu, sổ trống và khi tắt hết tuỳ chọn`, () => {
        for (const [list, o] of [
          [ENTRIES, DEFAULT_OPTIONS],
          [[], DEFAULT_OPTIONS],
          [ENTRIES, NONE],
        ] as const) {
          const out = t.build(list, o);
          const r = render(f, out);
          if (f.id === 'pdf') expect('printHtml' in r).toBe(true);
          else expect('blob' in r && r.blob.size > 0).toBe(true);
        }
        expect(fileName(f, t)).toMatch(/^tu-vung-[a-z-]+\.(xlsx|docx|pdf|txt|md|csv)$/);
      });
    }
  }
});

describe('Excel', () => {
  it('colName và tên trang tính hợp lệ, không trùng', () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    const names = sheetNames(['a/b:c*?[x]', 'x'.repeat(40), 'x'.repeat(40), '']);
    expect(names[0]).toBe('a b c x');
    expect(names[1]).toHaveLength(31);
    expect(names[2]).toHaveLength(31);
    expect(names[2]).not.toBe(names[1]);
    expect(names[3]).toBe('Sheet');
  });

  it('file .xlsx: đủ phần, chữ được escape, link thành HYPERLINK', () => {
    const files = unzip(sheetsToXlsx(T.sheetsFull(ENTRIES, DEFAULT_OPTIONS)));
    expect(Object.keys(files).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort(),
    );
    const sheet = files['xl/worksheets/sheet1.xml']!;
    expect(sheet).toContain('<t xml:space="preserve">burn out</t>');
    expect(sheet).toContain('Video A &amp; &quot;B&quot; &lt;1&gt;');
    expect(sheet).toContain('HYPERLINK(&quot;https://www.youtube.com/watch?v=abc&amp;t=83s&quot;');
    expect(sheet).toContain('<autoFilter ref="A1:J3"/>');
    expect(files['xl/workbook.xml']).toContain('<sheet name="Từ vựng"');
  });

  it('theo video: mỗi video một trang tính, sắp theo mốc', () => {
    const sheets = T.sheetsByVideo([...ENTRIES, e({ id: '3', term: 'early', picked: 'early', tMs: 1000 })], DEFAULT_OPTIONS);
    expect(sheets.map((s) => s.name)).toEqual(['Video A & "B" <1>', 'Video B']);
    expect(sheets[0]!.rows.map((r) => r[1])).toEqual(['early', 'burn out']);
    const files = unzip(sheetsToXlsx(sheets));
    expect(files['xl/worksheets/sheet2.xml']).toContain('kind of');
  });

  it('tuỳ chọn bỏ cột', () => {
    expect(T.sheetsFull(ENTRIES, NONE)[0]!.header).toEqual(['Từ', 'Nghĩa', 'Định nghĩa', 'Ghi chú', 'Ngày lưu']);
  });
});

describe('Word / PDF', () => {
  it('sổ tay: chữ đã chọn in đậm trong câu, link video', () => {
    const blocks = T.docNotebook(ENTRIES, DEFAULT_OPTIONS);
    const html = blocksToHtml('Sổ tay', blocks);
    expect(html).toContain('“I&#39;m just <b>burned out</b>, really.”'.replace('&#39;', "'"));
    expect(html).toContain('href="https://www.youtube.com/watch?v=abc&amp;t=83s"');
    const files = unzip(blocksToDocx(blocks));
    expect(files['word/document.xml']).toContain('<w:t xml:space="preserve">burned out</w:t>');
    expect(files['word/_rels/document.xml.rels']).toContain('TargetMode="External"');
    expect(files['word/document.xml']).toContain('<w:hyperlink r:id="rId101"');
  });

  it('bài tập điền từ: che đúng chữ, đáp án sau ngắt trang; không thấy chữ thì hỏi theo nghĩa', () => {
    expect(T.blanked(ENTRIES[0]!)).toBe("I'm just __________, really.");
    expect(T.blanked(e({ picked: 'xyz' }))).toBeNull();
    const blocks = T.docCloze([ENTRIES[0]!, e({ picked: 'xyz', meaning: 'abc' })], DEFAULT_OPTIONS);
    const html = blocksToHtml('Bài tập', blocks);
    expect(html).toContain("1. </b>I'm just __________, really.".replace('</b>', '</b>'));
    expect(html).toContain('Từ có nghĩa “abc”');
    expect(blocks.findIndex((b) => b.t === 'pagebreak')).toBeGreaterThan(0);
    expect(html).toContain('<b>burned out</b>');
  });

  it('gập đôi: bảng 2 cột, đường gập nét đứt', () => {
    const blocks = T.docFold(ENTRIES, DEFAULT_OPTIONS);
    const xml = unzip(blocksToDocx(blocks))['word/document.xml']!;
    expect(xml).toContain('<w:insideV w:val="dashed"');
    expect(xml.match(/<w:tr>/g)).toHaveLength(3);
  });
});

describe('Anki', () => {
  it('cloze: header chọn sẵn kiểu thẻ, che đúng chữ, gợi ý là nghĩa', () => {
    const { text, cards } = T.anki(ENTRIES, DEFAULT_OPTIONS, 'cloze');
    const lines = text.trimEnd().split('\n');
    expect(lines.slice(0, 4)).toEqual(['#separator:Comma', '#html:true', '#notetype:Cloze', '#tags column:3']);
    expect(lines[4]).toContain(`"I'm just {{c1::burned out::kiệt sức}}, really."`);
    expect(lines[4]!.endsWith(',"yt-bilingual"')).toBe(true);
    expect(cards[0]!.front).toBe("I'm just <b>[kiệt sức]</b>, really.");
  });

  it('cơ bản / hai chiều', () => {
    expect(T.anki(ENTRIES, DEFAULT_OPTIONS, 'basic').text).toContain('#notetype:Basic\n');
    const rev = T.anki(ENTRIES, DEFAULT_OPTIONS, 'reverse');
    expect(rev.text).toContain('#notetype:Basic (and reversed card)');
    expect(rev.cards).toHaveLength(4);
    // Dấu " trong tiêu đề video: escape HTML (&quot;) nên không phá trường CSV.
    expect(rev.text).toContain('Video A &amp; &quot;B&quot; &lt;1&gt;');
  });
});

describe('Quizlet / Markdown / CSV', () => {
  it('Quizlet: mỗi thẻ một dòng, một Tab', () => {
    const lines = T.quizlet([e({ meaning: 'a\tb\nc' })], DEFAULT_OPTIONS, 'term').trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.split('\t')).toHaveLength(2);
    expect(T.quizlet(ENTRIES, NONE, 'term')).toBe('burn out\tkiệt sức\nkind of\thơi | có phần\n');
    expect(T.quizlet(ENTRIES, NONE, 'sentence').split('\n')[0]).toBe("I'm just burned out, really.\tTôi thật sự kiệt sức.");
  });

  it('Markdown: bảng escape |, in đậm chữ đã chọn; ghi chú nhóm theo video', () => {
    const md = T.markdownTable(ENTRIES, DEFAULT_OPTIONS);
    expect(md).toContain('hơi \\| có phần');
    expect(md).toContain("I'm just **burned out**, really.");
    expect(md).toContain('[▶ 1:23](https://www.youtube.com/watch?v=abc&t=83s)');
    const notes = T.markdownNotes(ENTRIES, DEFAULT_OPTIONS);
    expect(notes).toContain('## Video A & "B" <1>');
    expect(notes.indexOf('## Video B')).toBeGreaterThan(notes.indexOf('## Video A'));
  });

  it('CSV: đủ cột, BOM khi tải', async () => {
    const csv = T.csvRaw(ENTRIES);
    expect(csv.split('\r\n')[0]).toBe('term,ipa,pos,meaning,definition,note,picked,sentence,translation,video_title,video_id,time,link,added');
    expect(csv).toContain('"Video A & ""B"" <1>"');
    const csvFormat = FORMATS.find((f) => f.id === 'csv')!;
    const r = render(csvFormat, csvFormat.templates[0]!.build(ENTRIES, DEFAULT_OPTIONS));
    const bytes = new Uint8Array(await ('blob' in r ? r.blob : new Blob()).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
