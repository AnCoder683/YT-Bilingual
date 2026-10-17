import { joinParts, splitWords, type Part } from '../lookup/words';
import type { DisplayMode } from '../settings';

const HOST_ID = 'yt-bilingual-host';
const ACTIVE_CLASS = 'yt-bilingual-active';
/** Bảng transcript đang phủ trong player (toàn màn hình): phụ đề né sang trái (xem panel.ts). */
const PANEL_OPEN_CLASS = 'yt-bilingual-panel-open';

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
  /* Đặt từ JS (syncPosition): ngay trên thanh điều khiển khi nó hiện, né bảng transcript khi phủ. */
  right: var(--right, 0px);
  bottom: var(--bottom, 4%);
  display: flex;
  justify-content: center;
  transition: bottom 0.15s ease;
}
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
/* Cả lớp trong suốt với chuột (bấm chỗ trống vẫn dừng/phát video); chỉ chữ của câu gốc bấm được để tra. */
.w { pointer-events: auto; cursor: pointer; border-radius: 0.15em; }
.w:hover { text-decoration: underline dotted; text-underline-offset: 0.15em; }
.w.picked { background: rgba(62, 166, 255, 0.5); }
`;

const NATIVE_HIDE_CSS = `#movie_player.${ACTIVE_CLASS} .ytp-caption-window-container { display: none !important; }`;

/** Thông báo ở chỗ bản dịch khi chưa có: lỗi (đỏ nhạt) hoặc đang dịch (mờ). */
export interface Notice {
  kind: 'error' | 'pending';
  text: string;
}

/** Người dùng chọn chữ trên phụ đề để tra: chữ (đúng như trong câu) và vị trí trên màn hình. */
export interface WordPick {
  text: string;
  rect: DOMRect;
}

/** Hiển thị 1 cặp dòng (gốc + dịch) trên player, trong Shadow DOM. */
export class Overlay {
  private host: HTMLElement;
  private box: HTMLElement;
  private srcEl: HTMLElement;
  private tgtEl: HTMLElement;
  private player: HTMLElement | null = null;
  private resizeObs = new ResizeObserver(() => {
    this.fitFont();
    this.syncPosition();
  });
  /** YouTube đổi class trên player khi hiện/ẩn thanh điều khiển, toàn màn hình… */
  private classObs = new MutationObserver(() => this.syncPosition());
  private lastKey = '';
  private display: DisplayMode = 'both';
  private fontScale = 1;
  private lang = 'en';
  private root: ShadowRoot;
  private parts: Part[] = [];
  private words: HTMLElement[] = [];
  /** Đang kéo chọn: mẩu bắt đầu và mẩu hiện tại (chỉ số trong `parts`). */
  private drag: { from: number; to: number } | null = null;
  /** Gọi khi người dùng bấm một từ hoặc kéo chọn một cụm. */
  onPick: ((pick: WordPick) => void) | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    const root = (this.root = this.host.attachShadow({ mode: 'open' }));
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
    this.bindPicking();

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
      this.classObs.disconnect();
      this.classObs.observe(player, { attributes: true, attributeFilter: ['class'] });
    }
    if (this.host.parentElement !== player) player.append(this.host);
    this.fitFont();
    this.syncPosition();
  }

  /** Bật/tắt chế độ của mình: ẩn phụ đề gốc của YouTube khi bật. */
  setEnabled(on: boolean): void {
    this.player?.classList.toggle(ACTIVE_CLASS, on);
    if (!on) this.show(null, null);
  }

  /** Ngôn ngữ câu gốc, để tách từ đúng. */
  setLang(lang: string): void {
    if (lang === this.lang) return;
    this.lang = lang;
    this.lastKey = '';
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
    this.renderSource(src ?? '');
    this.tgtEl.textContent = tgt ?? note?.text ?? '';
    this.tgtEl.classList.toggle('notice', !tgt && note?.kind === 'error');
    this.tgtEl.classList.toggle('pending', !tgt && note?.kind === 'pending');
    this.srcEl.classList.toggle('dim', !!tgt);
    this.box.hidden = !src && !tgt;
  }

  /** Bỏ tô sáng chữ đã chọn (đóng ô tra từ). */
  clearPick(): void {
    for (const w of this.words) w.classList.remove('picked');
  }

  private renderSource(text: string): void {
    this.drag = null;
    this.parts = text ? splitWords(text, this.lang) : [];
    this.words = [];
    this.srcEl.replaceChildren(
      ...this.parts.map((p, i) => {
        if (!p.word) return document.createTextNode(p.text);
        const span = document.createElement('span');
        span.className = 'w';
        span.dataset.i = String(i);
        span.textContent = p.text;
        this.words.push(span);
        return span;
      }),
    );
  }

  private partAt(x: number, y: number): number | null {
    const el = this.root.elementFromPoint(x, y);
    return el instanceof HTMLElement && el.classList.contains('w') ? Number(el.dataset.i) : null;
  }

  private highlight(a: number, b: number): void {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    for (const w of this.words) {
      const i = Number(w.dataset.i);
      w.classList.toggle('picked', i >= lo && i <= hi);
    }
  }

  /**
   * Bấm một từ = tra từ đó; nhấn giữ rồi kéo sang từ khác = tra cả cụm.
   * Tự theo dõi chuột (không dùng bôi đen của trình duyệt: trong Shadow DOM
   * trên player YouTube nó không ổn định), và chặn sự kiện để YouTube không
   * dừng/phát video hay bật toàn màn hình.
   */
  private bindPicking(): void {
    for (const ev of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerup', 'contextmenu']) {
      this.srcEl.addEventListener(ev, (e) => {
        if ((e.target as Element).closest?.('.w')) {
          e.stopPropagation();
          e.preventDefault();
        }
      });
    }
    this.srcEl.addEventListener('pointerdown', (e) => {
      const i = this.partAt(e.clientX, e.clientY);
      if (i === null || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      this.drag = { from: i, to: i };
      this.highlight(i, i);

      const move = (m: PointerEvent) => {
        const j = this.partAt(m.clientX, m.clientY);
        if (this.drag && j !== null && j !== this.drag.to) {
          this.drag.to = j;
          this.highlight(this.drag.from, j);
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
        const d = this.drag;
        this.drag = null;
        if (!d) return;
        const text = joinParts(this.parts, d.from, d.to);
        const [lo, hi] = d.from <= d.to ? [d.from, d.to] : [d.to, d.from];
        const spans = this.words.filter((w) => Number(w.dataset.i) >= lo && Number(w.dataset.i) <= hi);
        const rects = spans.map((w) => w.getBoundingClientRect());
        const left = Math.min(...rects.map((r) => r.left));
        // Ô tra từ đặt trên cả khung phụ đề, không che dòng bản dịch.
        const top = Math.min(this.box.getBoundingClientRect().top, ...rects.map((r) => r.top));
        const right = Math.max(...rects.map((r) => r.right));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        if (text) this.onPick?.({ text, rect: new DOMRect(left, top, right - left, bottom - top) });
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    });
  }

  /**
   * Thanh điều khiển hiện (di chuột, đang dừng) thì đặt phụ đề ngay trên nó,
   * để không bị che và bấm được vào chữ; ẩn thì hạ xuống gần đáy. Đo bằng JS vì
   * thanh điều khiển cao khác nhau giữa các bản YouTube và :host-context không
   * cập nhật khi class của player đổi.
   */
  private syncPosition(): void {
    const p = this.player;
    if (!p) return;
    const ctrl = p.querySelector<HTMLElement>('.ytp-chrome-bottom');
    let bottom = `${Math.round(p.clientHeight * 0.04)}px`;
    if (ctrl && !p.classList.contains('ytp-autohide')) {
      const gap = p.getBoundingClientRect().bottom - ctrl.getBoundingClientRect().top;
      if (gap > 0) bottom = `${Math.round(gap + 8)}px`;
    }
    const right = p.classList.contains(PANEL_OPEN_CLASS) ? 'calc(min(34%, 460px) + 12px)' : '0px';
    if (this.host.style.getPropertyValue('--bottom') !== bottom) this.host.style.setProperty('--bottom', bottom);
    if (this.host.style.getPropertyValue('--right') !== right) this.host.style.setProperty('--right', right);
  }

  destroy(): void {
    this.setEnabled(false);
    this.resizeObs.disconnect();
    this.classObs.disconnect();
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
