import type { DisplayMode } from '../settings';

const HOST_ID = 'yt-bilingual-host';
const ACTIVE_CLASS = 'yt-bilingual-active';

const STYLE = `
:host {
  all: initial;
  position: absolute;
  inset: 0;
  z-index: 40;
  pointer-events: none;
  font-size: 20px;
}
.wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 64px;
  display: flex;
  justify-content: center;
  transition: bottom 0.15s ease;
}
:host-context(.ytp-autohide) .wrap { bottom: 4%; }
:host-context(.ytp-fullscreen:not(.ytp-autohide)) .wrap { bottom: 96px; }
/* Bảng transcript đang phủ bên phải (toàn màn hình): phụ đề né sang trái. */
:host-context(.yt-bilingual-panel-open) .wrap { right: calc(min(34%, 460px) + 12px); }
.box {
  max-width: 84%;
  padding: 0.15em 0.5em;
  border-radius: 0.2em;
  background: rgba(8, 8, 8, 0.72);
  color: #fff;
  font-family: "YouTube Noto", Roboto, Arial, Helvetica, sans-serif;
  line-height: 1.35;
  text-align: center;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.box[hidden] { display: none; }
.line { display: block; text-wrap: balance; }
.line:empty { display: none; }
.tgt { color: #ffe9a8; }
.tgt.notice { color: #ffb4a8; font-size: 0.75em; }
.tgt.pending { color: #fff; opacity: 0.6; font-size: 0.7em; font-style: italic; }
.src.dim { font-size: 0.8em; opacity: 0.85; }
`;

const NATIVE_HIDE_CSS = `#movie_player.${ACTIVE_CLASS} .ytp-caption-window-container { display: none !important; }`;

/** Thông báo ở chỗ bản dịch khi chưa có: lỗi (đỏ nhạt) hoặc đang dịch (mờ). */
export interface Notice {
  kind: 'error' | 'pending';
  text: string;
}

/** Hiển thị 1 cặp dòng (gốc + dịch) trên player, trong Shadow DOM. */
export class Overlay {
  private host: HTMLElement;
  private box: HTMLElement;
  private srcEl: HTMLElement;
  private tgtEl: HTMLElement;
  private player: HTMLElement | null = null;
  private resizeObs = new ResizeObserver(() => this.fitFont());
  private lastKey = '';
  private display: DisplayMode = 'both';
  private fontScale = 1;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    const root = this.host.attachShadow({ mode: 'open' });
    // Tạo DOM thủ công: YouTube bật Trusted Types nên tránh innerHTML.
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };
    const style = el('style');
    style.textContent = STYLE;
    const wrap = el('div', 'wrap');
    this.box = el('div', 'box');
    this.box.hidden = true;
    this.tgtEl = el('span', 'line tgt');
    this.srcEl = el('span', 'line src');
    this.box.append(this.tgtEl, this.srcEl);
    wrap.append(this.box);
    root.append(style, wrap);

    if (!document.getElementById(`${HOST_ID}-style`)) {
      const style = document.createElement('style');
      style.id = `${HOST_ID}-style`;
      style.textContent = NATIVE_HIDE_CSS;
      (document.head ?? document.documentElement).append(style);
    }
  }

  /** Gắn vào player (gọi lại an toàn; YouTube có thể thay DOM). */
  attach(player: HTMLElement): void {
    if (this.player !== player) {
      if (this.player) this.resizeObs.unobserve(this.player);
      this.player = player;
      this.resizeObs.observe(player);
    }
    if (this.host.parentElement !== player) player.append(this.host);
    this.fitFont();
  }

  /** Bật/tắt chế độ của mình: ẩn phụ đề gốc của YouTube khi bật. */
  setEnabled(on: boolean): void {
    this.player?.classList.toggle(ACTIVE_CLASS, on);
    if (!on) this.show(null, null);
  }

  setOptions(display: DisplayMode, fontScale: number): void {
    this.display = display;
    this.fontScale = fontScale;
    this.lastKey = '';
    this.fitFont();
  }

  /** `notice` hiện ở chỗ bản dịch khi chưa có bản dịch (và có câu gốc). */
  show(source: string | null, translation: string | null, notice: Notice | null = null): void {
    const key = `${source}\u0000${translation}\u0000${notice?.kind}${notice?.text}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const mode = this.display;
    // Chỉ bản dịch: chưa có bản dịch thì vẫn hiện câu gốc cho khỏi trống.
    const src = mode === 'target' && translation ? null : source;
    const tgt = mode === 'source' ? null : translation;
    const note = mode !== 'source' && !translation && source ? notice : null;
    this.srcEl.textContent = src ?? '';
    this.tgtEl.textContent = tgt ?? note?.text ?? '';
    this.tgtEl.classList.toggle('notice', !tgt && note?.kind === 'error');
    this.tgtEl.classList.toggle('pending', !tgt && note?.kind === 'pending');
    this.srcEl.classList.toggle('dim', !!tgt);
    this.box.hidden = !src && !tgt;
  }

  destroy(): void {
    this.setEnabled(false);
    this.resizeObs.disconnect();
    this.host.remove();
    this.player = null;
  }

  private fitFont(): void {
    const h = this.player?.clientHeight ?? 0;
    if (!h) return;
    const px = Math.min(44, Math.max(13, h * 0.042)) * this.fontScale;
    this.host.style.fontSize = `${px.toFixed(1)}px`;
  }
}
