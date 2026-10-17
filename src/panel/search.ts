/** Một ký tự về dạng so khớp: chữ thường, bỏ dấu ("Đ" → "d", "ố" → "o"). */
function foldChar(c: string): string {
  if (c === 'đ' || c === 'Đ') return 'd';
  return c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Chuỗi đã gập + vị trí ký tự gốc tương ứng với từng ký tự đã gập. */
function fold(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    for (const f of foldChar(ch)) {
      folded += f;
      map.push(i);
    }
    i += ch.length;
  }
  map.push(text.length);
  return { folded, map };
}

export function foldQuery(q: string): string {
  return fold(q.trim()).folded;
}

/** Cắt text thành các đoạn, đánh dấu đoạn khớp `query` (đã foldQuery). */
export function splitMatches(text: string, query: string): { text: string; hit: boolean }[] {
  if (!query) return [{ text, hit: false }];
  const { folded, map } = fold(text);
  const out: { text: string; hit: boolean }[] = [];
  let pos = 0; // vị trí gốc đã xuất tới
  for (let at = folded.indexOf(query); at >= 0; at = folded.indexOf(query, at + query.length)) {
    const start = map[at]!;
    const end = map[at + query.length]!;
    if (start > pos) out.push({ text: text.slice(pos, start), hit: false });
    out.push({ text: text.slice(start, end), hit: true });
    pos = end;
  }
  if (pos < text.length || !out.length) out.push({ text: text.slice(pos), hit: false });
  return out;
}

export function matches(text: string, query: string): boolean {
  return !!query && fold(text).folded.includes(query);
}
