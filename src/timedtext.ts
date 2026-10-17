export interface TimedtextInfo {
  videoId: string | null;
  /** Ngôn ngữ của track gốc, vd `vi`, `en`. */
  lang: string | null;
  /** `asr` = phụ đề tự động; null = phụ đề do người làm. */
  kind: string | null;
  /** Có giá trị khi người dùng bật "Tự động dịch" của YouTube. */
  tlang: string | null;
  fmt: string | null;
}

/** Trả về info nếu URL là request phụ đề của player, ngược lại null. */
export function parseTimedtextUrl(url: string, base?: string): TimedtextInfo | null {
  let u: URL;
  try {
    u = new URL(url, base);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(u.hostname) || u.pathname !== '/api/timedtext') return null;
  const p = u.searchParams;
  return {
    videoId: p.get('v'),
    lang: p.get('lang'),
    kind: p.get('kind'),
    tlang: p.get('tlang'),
    fmt: p.get('fmt'),
  };
}

/** Khóa phân biệt track; cùng track bị tải lại thì trùng khóa. */
export function trackKey(info: TimedtextInfo): string {
  return [info.videoId, info.lang, info.kind ?? 'manual', info.tlang ?? ''].join('|');
}
