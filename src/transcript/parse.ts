import type { Json3, Piece } from './types';

/**
 * Lấy các mảnh chữ từ json3. Bỏ event không có chữ (vd chỉ có "\n" của ASR).
 * Mảnh có `tOffsetMs` (ASR theo từ) dùng mốc riêng; mảnh kết thúc ở đầu mảnh kế
 * trong cùng event, mảnh cuối kết thúc ở cuối event. Event ASR chồng lên nhau
 * (dòng cũ còn hiện khi dòng mới chạy), nên cuối cùng kẹp endMs ≤ startMs của
 * mảnh kế tiếp.
 */
export function parseJson3(json: Json3): Piece[] {
  const pieces: Piece[] = [];
  for (const ev of json.events ?? []) {
    if (!ev.segs?.length || ev.tStartMs == null) continue;
    const evStart = ev.tStartMs;
    const evEnd = evStart + (ev.dDurationMs ?? 0);
    const segs = ev.segs.filter((s) => s.utf8 != null && s.utf8.replace(/\s+/g, '') !== '');
    segs.forEach((seg, i) => {
      const startMs = evStart + (seg.tOffsetMs ?? 0);
      const next = segs[i + 1];
      const endMs = next ? evStart + (next.tOffsetMs ?? 0) : evEnd;
      pieces.push({ text: seg.utf8!, startMs, endMs: Math.max(endMs, startMs) });
    });
  }
  pieces.sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i + 1 < pieces.length; i++) {
    const cur = pieces[i]!;
    cur.endMs = Math.max(cur.startMs, Math.min(cur.endMs, pieces[i + 1]!.startMs));
  }
  return pieces;
}
