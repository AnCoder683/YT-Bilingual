import { fmtTime, type VocabEntry } from '../vocab';
import {
  byVideo,
  esc,
  linkLabel,
  linkOf,
  phonetic,
  pickedAt,
  sentenceRuns,
  today,
  type Block,
  type Cell,
  type ExportOptions,
  type Para,
  type Sheet,
  type SheetCell,
} from './model';

// ---------- Bảng tính (Excel) ----------

interface Col {
  name: string;
  width: number;
  value: (e: VocabEntry) => SheetCell;
}

const C = {
  term: { name: 'Từ', width: 18, value: (e) => e.term },
  ipa: { name: 'Phiên âm', width: 16, value: (e) => e.ipa },
  pos: { name: 'Loại từ', width: 12, value: (e) => e.pos },
  meaning: { name: 'Nghĩa', width: 28, value: (e) => e.meaning },
  definition: { name: 'Định nghĩa', width: 36, value: (e) => e.definition },
  note: { name: 'Ghi chú', width: 30, value: (e) => e.note },
  sentence: { name: 'Câu ví dụ', width: 44, value: (e) => e.sentence },
  translation: { name: 'Bản dịch', width: 40, value: (e) => e.translation },
  video: { name: 'Video', width: 34, value: (e) => ({ text: linkLabel(e), link: linkOf(e) }) },
  time: { name: 'Mốc', width: 8, value: (e) => fmtTime(e.tMs) },
  timeLink: { name: 'Mốc', width: 8, value: (e) => ({ text: `▶ ${fmtTime(e.tMs)}`, link: linkOf(e) }) },
  added: { name: 'Ngày lưu', width: 12, value: (e) => new Date(e.addedAt).toLocaleDateString('vi-VN') },
} satisfies Record<string, Col>;

function sheet(name: string, cols: Col[], entries: readonly VocabEntry[]): Sheet {
  return { name, header: cols.map((c) => c.name), widths: cols.map((c) => c.width), rows: entries.map((e) => cols.map((c) => c.value(e))) };
}

export function sheetsFull(entries: readonly VocabEntry[], o: ExportOptions): Sheet[] {
  const cols = [
    C.term,
    ...(o.phonetics ? [C.ipa, C.pos] : []),
    C.meaning,
    C.definition,
    C.note,
    ...(o.examples ? [C.sentence, C.translation] : []),
    ...(o.links ? [C.video] : []),
    C.added,
  ];
  return [sheet('Từ vựng', cols, entries)];
}

export function sheetsReview(entries: readonly VocabEntry[], o: ExportOptions): Sheet[] {
  const cols = [C.term, ...(o.phonetics ? [C.ipa] : []), C.meaning, ...(o.examples ? [C.sentence] : [])];
  return [sheet('Ôn nhanh', cols, entries)];
}

export function sheetsByVideo(entries: readonly VocabEntry[], o: ExportOptions): Sheet[] {
  const cols = [
    o.links ? C.timeLink : C.time,
    C.term,
    ...(o.phonetics ? [C.ipa] : []),
    C.meaning,
    ...(o.examples ? [C.sentence, C.translation] : []),
  ];
  return byVideo(entries).map((g) => sheet(g.title, cols, g.entries));
}

// ---------- Tài liệu (Word, PDF) ----------

const p = (...runs: Para): Block => ({ t: 'para', runs });

/** Dòng tiêu đề của một từ: từ (đậm) + phiên âm · loại từ. */
function termLine(e: VocabEntry, o: ExportOptions): Para {
  const ph = o.phonetics ? phonetic(e) : '';
  return [{ text: e.term, b: true }, ...(ph ? [{ text: `   ${ph}`, muted: true }] : [])];
}

export function docNotebook(entries: readonly VocabEntry[], o: ExportOptions): Block[] {
  const blocks: Block[] = [
    { t: 'title', runs: [{ text: 'Sổ tay từ vựng' }] },
    { t: 'subtitle', runs: [{ text: `YT Bilingual · ${entries.length} từ · ${today()}` }] },
  ];
  for (const e of entries) {
    blocks.push({ t: 'heading', runs: termLine(e, o) });
    blocks.push(p({ text: e.meaning, b: true }));
    if (e.definition) blocks.push(p({ text: e.definition, i: true, muted: true }));
    if (e.note) blocks.push(p({ text: e.note }));
    if (o.examples) {
      blocks.push(p({ text: '“' }, ...sentenceRuns(e), { text: '”' }));
      if (e.translation) blocks.push(p({ text: e.translation, muted: true }));
    }
    if (o.links) blocks.push(p({ text: linkLabel(e), link: linkOf(e) }));
  }
  return blocks;
}

const BLANK = '__________';

/** Câu với chữ đã chọn thay bằng chỗ trống; null nếu không tìm thấy chữ trong câu. */
export function blanked(e: VocabEntry): string | null {
  const at = pickedAt(e);
  return at < 0 ? null : e.sentence.slice(0, at) + BLANK + e.sentence.slice(at + e.picked.length);
}

export function docCloze(entries: readonly VocabEntry[], o: ExportOptions): Block[] {
  const blocks: Block[] = [
    { t: 'title', runs: [{ text: 'Bài tập điền từ' }] },
    { t: 'subtitle', runs: [{ text: `Điền từ còn thiếu vào chỗ trống · ${entries.length} câu · ${today()}` }] },
  ];
  entries.forEach((e, i) => {
    const q = blanked(e) ?? `Từ có nghĩa “${e.meaning}”: ${BLANK}`;
    blocks.push({ t: 'heading', runs: [{ text: `${i + 1}. ` }, { text: q, b: false }] });
    blocks.push(p({ text: `Gợi ý: ${e.meaning}`, i: true, muted: true }));
    if (o.examples && e.translation) blocks.push(p({ text: e.translation, muted: true }));
  });
  blocks.push({ t: 'pagebreak' });
  blocks.push({ t: 'title', runs: [{ text: 'Đáp án' }] });
  entries.forEach((e, i) => {
    const ph = o.phonetics ? phonetic(e) : '';
    blocks.push(
      p(
        { text: `${i + 1}. ` },
        { text: e.picked || e.term, b: true },
        ...(e.picked && e.picked.toLowerCase() !== e.term.toLowerCase() ? [{ text: ` (${e.term})` }] : []),
        ...(ph ? [{ text: `  ${ph}`, muted: true }] : []),
        { text: ` — ${e.meaning}` },
      ),
    );
    if (o.links) blocks.push(p({ text: linkLabel(e), link: linkOf(e) }));
  });
  return blocks;
}

export function docFold(entries: readonly VocabEntry[], o: ExportOptions): Block[] {
  const rows: Cell[][] = entries.map((e) => {
    const left: Cell = [[{ text: e.term, b: true }]];
    if (o.phonetics && phonetic(e)) left.push([{ text: phonetic(e), muted: true }]);
    if (o.examples) left.push(sentenceRuns(e, { i: true }));
    const right: Cell = [[{ text: e.meaning, b: true }]];
    if (e.definition) right.push([{ text: e.definition, i: true, muted: true }]);
    if (o.examples && e.translation) right.push([{ text: e.translation, muted: true }]);
    if (o.links) right.push([{ text: linkLabel(e), link: linkOf(e) }]);
    return [left, right];
  });
  return [
    { t: 'title', runs: [{ text: 'Gập đôi tự kiểm tra' }] },
    { t: 'subtitle', runs: [{ text: 'Gập giấy theo đường nét đứt: nhìn cột trái, đoán nghĩa rồi mở ra xem.' }] },
    { t: 'table', header: ['Từ', 'Nghĩa'], rows, fold: true },
  ];
}

// ---------- Văn bản ----------

const csvField = (s: string) => `"${s.replace(/"/g, '""')}"`;
const oneLine = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();
const br = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join('<br>');

/** Mặt sau thẻ Anki (HTML đã escape). */
function ankiBack(e: VocabEntry, o: ExportOptions, withTerm: boolean): string {
  const ph = o.phonetics ? phonetic(e) : '';
  return br([
    withTerm && `<b>${esc(e.term)}</b>${ph ? ` · ${esc(ph)}` : ''}`,
    !withTerm && ph && esc(ph),
    `<b>${esc(e.meaning)}</b>`,
    e.definition && `<i>${esc(e.definition)}</i>`,
    e.note && esc(e.note),
    o.examples && e.translation && `<br>${esc(e.translation)}`,
    o.links && `<a href="${esc(linkOf(e))}">${esc(linkLabel(e))}</a>`,
  ]);
}

/** Câu với chữ đã chọn in đậm (HTML). */
function boldSentence(e: VocabEntry): string {
  return sentenceRuns(e)
    .map((r) => (r.b ? `<b>${esc(r.text)}</b>` : esc(r.text)))
    .join('');
}

export type AnkiKind = 'basic' | 'reverse' | 'cloze';

/**
 * File văn bản để Anki (2.1.55+) nhập: header `#...` chọn sẵn kiểu thẻ, dấu
 * phân cách, HTML và cột tag. Cloze: câu thật với `{{c1::chữ::nghĩa}}`.
 */
export function anki(entries: readonly VocabEntry[], o: ExportOptions, kind: AnkiKind): { text: string; cards: { front: string; back: string }[] } {
  const notetype = kind === 'cloze' ? 'Cloze' : kind === 'reverse' ? 'Basic (and reversed card)' : 'Basic';
  const cards: { front: string; back: string }[] = [];
  const rows = entries.map((e) => {
    let front: string;
    let back: string;
    if (kind === 'cloze') {
      const at = pickedAt(e);
      const hint = e.meaning.replace(/::|\}\}/g, ' ');
      front =
        at < 0
          ? `{{c1::${esc(e.term)}::${esc(hint)}}}`
          : `${esc(e.sentence.slice(0, at))}{{c1::${esc(e.sentence.slice(at, at + e.picked.length))}::${esc(hint)}}}${esc(e.sentence.slice(at + e.picked.length))}`;
      back = ankiBack(e, o, true);
      cards.push({ front: front.replace(/\{\{c1::.*?::(.*?)\}\}/, '<b>[$1]</b>'), back: `${boldSentence(e)}<br><br>${back}` });
    } else if (kind === 'reverse') {
      front = `<b>${esc(e.term)}</b>${o.examples ? `<br><br>${boldSentence(e)}` : ''}`;
      back = ankiBack(e, o, false);
      cards.push({ front, back }, { front: back, back: front });
    } else {
      front = `<b>${esc(e.term)}</b>${o.examples ? `<br><br>${boldSentence(e)}` : ''}`;
      back = ankiBack(e, o, false);
      cards.push({ front, back });
    }
    return [front, back, 'yt-bilingual'].map(csvField).join(',');
  });
  const text = ['#separator:Comma', '#html:true', `#notetype:${notetype}`, '#tags column:3', ...rows].join('\n') + '\n';
  return { text, cards };
}

/** Quizlet: "thuật ngữ<Tab>định nghĩa", mỗi thẻ một dòng (Tạo học phần → Nhập). */
export function quizlet(entries: readonly VocabEntry[], o: ExportOptions, kind: 'term' | 'sentence'): string {
  return (
    entries
      .map((e) => {
        if (kind === 'sentence') return `${oneLine(e.sentence)}\t${oneLine(e.translation || e.meaning)}`;
        const ph = o.phonetics && e.ipa ? ` ${e.ipa}` : '';
        const ex = o.examples ? ` — ${e.sentence}` : '';
        return `${oneLine(e.term + ph)}\t${oneLine(e.meaning + ex)}`;
      })
      .join('\n') + '\n'
  );
}

const mdCell = (s: string) => oneLine(s).replace(/\|/g, '\\|');
const mdBold = (e: VocabEntry) =>
  sentenceRuns(e)
    .map((r) => (r.b ? `**${r.text}**` : r.text))
    .join('');

export function markdownTable(entries: readonly VocabEntry[], o: ExportOptions): string {
  const head = ['Từ', ...(o.phonetics ? ['Phiên âm'] : []), 'Nghĩa', 'Định nghĩa', ...(o.examples ? ['Câu ví dụ', 'Bản dịch'] : []), ...(o.links ? ['Video'] : [])];
  const rows = entries.map((e) => [
    `**${mdCell(e.term)}**`,
    ...(o.phonetics ? [mdCell(phonetic(e))] : []),
    mdCell(e.meaning),
    mdCell(e.definition),
    ...(o.examples ? [mdCell(mdBold(e)), mdCell(e.translation)] : []),
    ...(o.links ? [`[▶ ${fmtTime(e.tMs)}](${linkOf(e)})`] : []),
  ]);
  return [`# Sổ từ vựng · ${today()}`, '', `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') + '\n';
}

export function markdownNotes(entries: readonly VocabEntry[], o: ExportOptions): string {
  const out: string[] = [`# Sổ từ vựng · ${today()}`];
  for (const g of byVideo(entries)) {
    out.push('', `## ${g.title}`, '');
    for (const e of g.entries) {
      const ph = o.phonetics && phonetic(e) ? ` ${phonetic(e)}` : '';
      out.push(`- **${e.term}**${ph} — ${e.meaning}`);
      if (e.definition) out.push(`  *${e.definition}*`);
      if (o.examples) {
        out.push(`  > ${mdBold(e)}`);
        if (e.translation) out.push(`  > ${e.translation}`);
      }
      if (o.links) out.push(`  [▶ ${fmtTime(e.tMs)}](${linkOf(e)})`);
    }
  }
  return out.join('\n') + '\n';
}

/** CSV thô: đủ mọi cột, không phụ thuộc tuỳ chọn. */
export function csvRaw(entries: readonly VocabEntry[]): string {
  const head = ['term', 'ipa', 'pos', 'meaning', 'definition', 'note', 'picked', 'sentence', 'translation', 'video_title', 'video_id', 'time', 'link', 'added'];
  const rows = entries.map((e) =>
    [e.term, e.ipa, e.pos, e.meaning, e.definition, e.note, e.picked, e.sentence, e.translation, e.title, e.videoId, fmtTime(e.tMs), linkOf(e), new Date(e.addedAt).toISOString()]
      .map(csvField)
      .join(','),
  );
  return [head.join(','), ...rows].join('\r\n') + '\r\n';
}
