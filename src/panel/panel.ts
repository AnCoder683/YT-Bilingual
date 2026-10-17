import { lastStarted } from '../nav';
import { fmtTime } from '../vocab';
import { findActive } from '../overlay/active';
import type { DisplayLine } from '../scheduler';
import { containerFor, pickPlace, readLayout, type PanelPlace } from './place';
import { foldQuery, matches, splitMatches } from './search';

/** Class trên #movie_player khi bảng đang phủ trong player (toàn màn hình): phụ đề né sang trái. */
export const PANEL_OPEN_CLASS = 'yt-bilingual-panel-open';
const HOST_ID = 'yt-bilingual-panel';
const COLLAPSED_STORAGE = 'panelCollapsed';
/** Rebuild danh sách tối đa mỗi chừng này (bản dịch stream về liên tục). */
const REBUILD_MS = 400;
/** Người dùng tự cuộn thì ngừng tự cuộn theo video chừng này. */
const FOLLOW_PAUSE_MS = 10_000;
/** Chờ chừng này mới tua khi bấm câu: nhấp đúp (bôi đen một từ để tra) thì không tua. */
const CLICK_DELAY_MS = 250;
/** Bôi đen dài hơn chừng này từ thì không hiện nút Tra. */
const LOOKUP_MAX_WORDS = 8;

const STYLE = `
:host {
  all: initial;
  display: block;
  box-sizing: border-box;
  font-family: Roboto, Arial, sans-serif;
  --bg: #fff;
  --fg: #0f0f0f;
  --fg2: #606060;
  --line: rgba(0, 0, 0, 0.1);
  --hover: rgba(0, 0, 0, 0.05);
  --act: rgba(6, 95, 212, 0.1);
  --accent: #065fd4;
  --tgt: #8a5a00;
}
:host-context(html[dark]) {
  --bg: #0f0f0f;
  --fg: #f1f1f1;
  --fg2: #aaa;
  --line: rgba(255, 255, 255, 0.14);
  --hover: rgba(255, 255, 255, 0.06);
  --act: rgba(62, 166, 255, 0.16);
  --accent: #3ea6ff;
  --tgt: #ffd98a;
}
:host([data-place='side']),
:host([data-place='theater']) {
  position: sticky;
  top: calc(var(--top, 56px) + 12px);
  z-index: 5;
  margin-bottom: 12px;
  height: var(--h, 480px);
}
:host([data-place='below']) {
  margin: 12px 0;
  height: clamp(220px, 42vh, 460px);
}
:host([data-place='overlay']) {
  /* Chừa thanh tiêu đề (nút ⓘ) ở trên và hàng nút like/share + thanh điều khiển ở dưới. */
  position: absolute;
  top: 64px;
  right: 12px;
  bottom: 132px;
  width: min(34%, 460px);
  z-index: 45;
  --bg: rgba(15, 15, 15, 0.84);
  --fg: #f1f1f1;
  --fg2: #bbb;
  --line: rgba(255, 255, 255, 0.16);
  --hover: rgba(255, 255, 255, 0.08);
  --act: rgba(62, 166, 255, 0.22);
  --accent: #3ea6ff;
  --tgt: #ffe08a;
}
:host([collapsed]) { height: auto !important; bottom: auto; }
.panel {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--line);
}
:host([collapsed]) .head { border-bottom: 0; }
.title { font-size: 14px; font-weight: 500; white-space: nowrap; }
input {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: transparent;
  color: inherit;
  font: 13px Roboto, Arial, sans-serif;
  outline: none;
}
input:focus { border-color: var(--accent); }
.count { font-size: 12px; color: var(--fg2); white-space: nowrap; }
.icon {
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: inherit;
  font-size: 15px;
  cursor: pointer;
}
.icon:hover { background: var(--hover); }
.list {
  flex: 1;
  position: relative;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 0;
}
:host([collapsed]) .list,
:host([collapsed]) .follow { display: none; }
.row {
  display: flex;
  gap: 10px;
  padding: 6px 12px 6px 9px;
  border-left: 3px solid transparent;
  cursor: pointer;
}
.row:hover { background: var(--hover); }
.row.active { background: var(--act); border-left-color: var(--accent); }
.row.hit { outline: 2px solid #f9c513; outline-offset: -2px; }
.time {
  flex: none;
  min-width: 36px;
  padding-top: 1px;
  color: var(--accent);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.txt { min-width: 0; font-size: 14px; line-height: 1.45; user-select: text; }
.tgt { margin-top: 2px; color: var(--tgt); }
.tgt.none { color: var(--fg2); }
mark { background: #f9c513; color: #000; border-radius: 2px; }
.empty { padding: 16px; color: var(--fg2); font-size: 13px; }
.follow {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  padding: 6px 14px;
  border: 0;
  border-radius: 16px;
  background: var(--accent);
  color: #fff;
  font: 500 13px Roboto, Arial, sans-serif;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}
.follow[hidden] { display: none; }
.lookup {
  position: absolute;
  z-index: 2;
  padding: 4px 12px;
  border: 0;
  border-radius: 14px;
  background: var(--accent);
  color: #fff;
  font: 500 13px Roboto, Arial, sans-serif;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: pointer;
}
.lookup[hidden] { display: none; }
`;

// Tạo DOM thủ công: YouTube bật Trusted Types nên tránh innerHTML.
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Bảng transcript song ngữ: toàn bộ câu (gốc + dịch), tô sáng câu đang phát,
 * tự cuộn theo video, bấm vào câu để tua, tìm kiếm (bỏ dấu, không phân biệt hoa thường).
 */
/** Bôi đen chữ trong bảng để tra: chữ, câu chứa nó, vị trí trên màn hình. */
export interface PanelPick {
  text: string;
  line: DisplayLine;
  rect: DOMRect;
}

export class TranscriptPanel {
  private host = el('div');
  private root: ShadowRoot;
  private panel = el('div', 'panel');
  private lookupBtn = el('button', 'lookup', 'Tra');
  private pendingPick: PanelPick | null = null;
  private clickTimer = 0;
  private list = el('div', 'list');
  private input = el('input');
  private count = el('span', 'count');
  private collapseBtn = el('button', 'icon');
  private followBtn = el('button', 'follow', '↓ Câu đang phát');
  private rows: HTMLElement[] = [];
  /** Dòng đang vẽ trên bảng, và dòng mới nhất (vẽ lại có giãn cách). */
  private shown: readonly DisplayLine[] | null = null;
  private latest: readonly DisplayLine[] = [];
  private rebuildTimer = 0;
  private lastRebuild = 0;
  private active = -1;
  private near = -1;
  private follow = true;
  private userScrollAt = 0;
  private query = '';
  private hits: number[] = [];
  private hitPos = -1;
  private place: PanelPlace | null = null;
  private collapsed = false;
  /** Lớp phủ khi toàn màn hình: mặc định tắt để không che video, bật bằng phím Q. */
  private overlayOpen = false;
  private player: HTMLElement | null = null;
  private down: { x: number; y: number } | null = null;

  constructor(
    private onSeek: (ms: number) => void,
    private onLookup: (pick: PanelPick) => void,
  ) {
    this.host.id = HOST_ID;
    const root = (this.root = this.host.attachShadow({ mode: 'open' }));
    const style = el('style');
    style.textContent = STYLE;

    this.input.type = 'search';
    this.input.placeholder = 'Tìm trong transcript…';
    this.input.spellcheck = false;
    this.collapseBtn.type = 'button';
    this.followBtn.type = 'button';
    this.followBtn.hidden = true;
    const head = el('div', 'head');
    head.append(el('span', 'title', 'Transcript'), this.input, this.count, this.collapseBtn);
    const panel = this.panel;
    this.lookupBtn.type = 'button';
    this.lookupBtn.hidden = true;
    panel.append(head, this.list, this.followBtn, this.lookupBtn);
    root.append(style, panel);
    this.lookupBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // giữ nguyên vùng bôi đen
    this.lookupBtn.addEventListener('click', () => {
      const p = this.pendingPick;
      this.hideLookup();
      this.selection()?.removeAllRanges(); // bảng được vẽ lại bình thường
      if (p) this.onLookup(p);
    });
    this.list.addEventListener('mouseup', () => setTimeout(() => this.checkSelection(), 0));
    this.list.addEventListener('scroll', () => this.hideLookup(), { passive: true });
    document.addEventListener('selectionchange', () => {
      if (!this.selectedText()) this.hideLookup();
    });

    // Trong player (toàn màn hình), click/double-click sẽ làm YouTube dừng
    // video / thoát toàn màn hình; phím gõ trong ô tìm kiếm không được thành phím tắt.
    for (const ev of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) {
      this.host.addEventListener(ev, (e) => e.stopPropagation());
    }
    for (const ev of ['keydown', 'keyup', 'keypress']) {
      this.input.addEventListener(ev, (e) => e.stopPropagation());
    }

    this.input.addEventListener('input', () => this.setQuery(this.input.value));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.nextHit(e.shiftKey ? -1 : 1);
      else if (e.key === 'Escape') {
        this.input.value = '';
        this.setQuery('');
        this.input.blur();
      }
    });
    this.collapseBtn.addEventListener('click', () => this.toggle());
    this.followBtn.addEventListener('click', () => this.resumeFollow());

    const userScroll = () => {
      this.follow = false;
      this.userScrollAt = Date.now();
      this.followBtn.hidden = false;
    };
    this.list.addEventListener('wheel', userScroll, { passive: true });
    this.list.addEventListener('touchmove', userScroll, { passive: true });
    window.addEventListener('pointerup', () => setTimeout(() => (this.down = null), CLICK_DELAY_MS + 50), true);
    this.list.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY };
      if (e.target === this.list) userScroll(); // kéo thanh cuộn
    });
    this.list.addEventListener('click', (e) => this.onRowClick(e));

    void browser.storage.local.get(COLLAPSED_STORAGE).then((got) => {
      this.collapsed = got[COLLAPSED_STORAGE] === true;
      this.syncCollapsed();
    });
    this.syncCollapsed();
  }

  /** Phím Q / nút thu gọn: toàn màn hình thì bật/tắt lớp phủ, bình thường thì thu gọn/mở. */
  toggle(): void {
    if (this.place === 'overlay') {
      this.overlayOpen = !this.overlayOpen;
    } else {
      this.collapsed = !this.collapsed;
      void browser.storage.local.set({ [COLLAPSED_STORAGE]: this.collapsed });
    }
    this.syncCollapsed();
    if (this.player) this.attach(this.player, true);
    this.scrollToNear(false);
  }

  /** Đặt bảng đúng chỗ theo bố cục hiện tại (gọi mỗi khung hình, rẻ khi không đổi). */
  attach(player: HTMLElement, visible: boolean): void {
    this.player = player;
    const place = visible ? pickPlace(readLayout(player)) : null;
    const show = place !== null && (place !== 'overlay' || this.overlayOpen);
    player.classList.toggle(PANEL_OPEN_CLASS, show && place === 'overlay');
    const container = show ? containerFor(place, player) : null;
    if (!container || !place) {
      this.host.remove();
      this.place = place;
      return;
    }
    if (place !== this.place || this.host.parentElement !== container) {
      this.place = place;
      this.host.dataset.place = place;
      this.syncCollapsed();
      if (place === 'overlay') container.append(this.host);
      else container.prepend(this.host);
      requestAnimationFrame(() => this.scrollToNear(false));
    }
    if (place === 'side') {
      // Cao bằng video, nhưng không quá màn hình (bảng dính khi cuộn trang).
      const masthead = document.querySelector('#masthead-container')?.getBoundingClientRect().height || 56;
      const h = Math.max(320, Math.min(player.clientHeight, innerHeight - masthead - 24));
      this.host.style.setProperty('--h', `${h}px`);
      this.host.style.setProperty('--top', `${masthead}px`);
    } else if (place === 'theater') {
      const masthead = document.querySelector('#masthead-container')?.getBoundingClientRect().height || 56;
      this.host.style.setProperty('--h', `${Math.max(320, innerHeight - masthead - 24)}px`);
      this.host.style.setProperty('--top', `${masthead}px`);
    }
  }

  hide(): void {
    this.player?.classList.remove(PANEL_OPEN_CLASS);
    this.host.remove();
    this.place = null;
  }

  /** Gọi mỗi khung hình với các dòng hiển thị hiện tại và thời điểm video. */
  update(lines: readonly DisplayLine[], tMs: number): void {
    this.latest = lines;
    if (lines !== this.shown) this.scheduleRebuild();
    const shown = this.shown;
    if (!shown || !this.host.isConnected) return;

    const active = findActive(shown, tMs);
    if (active !== this.active) {
      this.rows[this.active]?.classList.remove('active');
      this.rows[active]?.classList.add('active');
      this.active = active;
    }
    if (!this.follow && !this.query && Date.now() - this.userScrollAt > FOLLOW_PAUSE_MS) this.resumeFollow();
    const near = lastStarted(shown, tMs);
    if (near !== this.near) {
      this.near = near;
      if (this.follow) this.scrollToNear(true);
    }
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer) return;
    const wait = this.shown ? Math.max(0, REBUILD_MS - (Date.now() - this.lastRebuild)) : 0;
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = 0;
      this.rebuild();
    }, wait);
  }

  private rebuild(): void {
    // Vẽ lại sẽ xóa vùng đang bôi đen (để tra / chép): đợi người dùng xong đã.
    if (this.down || this.selectedText()) {
      this.rebuildTimer = window.setTimeout(() => {
        this.rebuildTimer = 0;
        this.rebuild();
      }, REBUILD_MS);
      return;
    }
    const lines = this.latest;
    this.lastRebuild = Date.now();
    const keepTop = this.list.scrollTop;
    this.shown = lines;
    this.hits = this.query
      ? lines.flatMap((l, i) => (matches(l.source, this.query) || (!!l.translation && matches(l.translation, this.query)) ? [i] : []))
      : [];
    this.hitPos = Math.min(this.hitPos, this.hits.length - 1);
    this.rows = lines.map((l, i) => this.row(l, i));
    this.list.replaceChildren(...(this.rows.length ? this.rows : [el('div', 'empty', 'Chưa có phụ đề.')]));
    this.rows[this.active]?.classList.add('active');
    this.rows[this.hits[this.hitPos] ?? -1]?.classList.add('hit');
    this.showCount();
    if (this.follow) this.scrollToNear(false);
    else this.list.scrollTop = keepTop;
  }

  private row(l: DisplayLine, i: number): HTMLElement {
    const row = el('div', 'row');
    row.dataset.i = String(i);
    const txt = el('div', 'txt');
    const src = el('div', 'src');
    src.append(...this.marked(l.source));
    const tgt = el('div', l.translation ? 'tgt' : 'tgt none');
    if (l.translation) tgt.append(...this.marked(l.translation));
    else tgt.textContent = '…';
    txt.append(src, tgt);
    row.append(el('span', 'time', fmtTime(l.startMs)), txt);
    return row;
  }

  private marked(text: string): Node[] {
    return splitMatches(text, this.query).map((p) => (p.hit ? el('mark', undefined, p.text) : document.createTextNode(p.text)));
  }

  private onRowClick(e: MouseEvent): void {
    clearTimeout(this.clickTimer);
    // Kéo chuột hoặc nhấp đúp để bôi đen chữ (tra từ, chép) thì không tua.
    const d = this.down;
    if (e.detail > 1 || (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4)) return;
    const row = (e.target as Element).closest<HTMLElement>('.row');
    const line = row ? this.shown?.[Number(row.dataset.i)] : undefined;
    if (!line) return;
    this.clickTimer = window.setTimeout(() => {
      if (this.selectedText()) return;
      this.onSeek(line.startMs);
      this.resumeFollow();
    }, CLICK_DELAY_MS);
  }

  /** Chrome có getSelection() trên ShadowRoot (chưa chuẩn): vùng bôi đen bên trong bảng. */
  private selection(): Selection | null {
    const r = this.root as ShadowRoot & { getSelection?: () => Selection | null };
    return r.getSelection?.() ?? document.getSelection();
  }

  private selectedText(): string {
    return this.selection()?.toString().trim() ?? '';
  }

  /** Bôi đen gọn trong câu gốc của một dòng thì hiện nút Tra ngay trên vùng bôi đen. */
  private checkSelection(): void {
    const sel = this.selection();
    const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (!sel || !text || sel.rangeCount === 0 || text.split(' ').length > LOOKUP_MAX_WORDS) return this.hideLookup();
    const srcOf = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('.src') ?? null;
    const src = srcOf(sel.anchorNode);
    if (!src || src !== srcOf(sel.focusNode)) return this.hideLookup();
    const row = src.closest<HTMLElement>('.row');
    const line = row ? this.shown?.[Number(row.dataset.i)] : undefined;
    if (!line) return this.hideLookup();

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    this.pendingPick = { text, line, rect };
    clearTimeout(this.clickTimer);
    const box = this.panel.getBoundingClientRect();
    this.lookupBtn.hidden = false;
    const bw = this.lookupBtn.offsetWidth;
    const left = Math.min(Math.max(4, rect.left + rect.width / 2 - bw / 2 - box.left), box.width - bw - 4);
    const top = rect.top - box.top - this.lookupBtn.offsetHeight - 6;
    this.lookupBtn.style.left = `${left}px`;
    this.lookupBtn.style.top = `${top < 44 ? rect.bottom - box.top + 6 : top}px`;
  }

  private hideLookup(): void {
    this.lookupBtn.hidden = true;
    this.pendingPick = null;
  }

  private setQuery(raw: string): void {
    this.query = foldQuery(raw);
    this.hitPos = -1;
    if (!this.query) this.resumeFollow();
    this.rebuild();
  }

  private nextHit(dir: 1 | -1): void {
    const n = this.hits.length;
    if (!n) return;
    this.rows[this.hits[this.hitPos] ?? -1]?.classList.remove('hit');
    this.hitPos = (this.hitPos + dir + n) % n;
    const i = this.hits[this.hitPos]!;
    this.rows[i]?.classList.add('hit');
    this.follow = false;
    this.userScrollAt = Date.now();
    this.followBtn.hidden = false;
    this.scrollToRow(i, true);
    this.showCount();
  }

  private showCount(): void {
    const n = this.hits.length;
    this.count.textContent = !this.query ? '' : !n ? '0' : this.hitPos >= 0 ? `${this.hitPos + 1}/${n}` : `${n}`;
  }

  private resumeFollow(): void {
    this.follow = true;
    this.followBtn.hidden = true;
    this.scrollToNear(true);
  }

  private scrollToNear(smooth: boolean): void {
    if (this.near >= 0) this.scrollToRow(this.near, smooth);
  }

  /** Cuộn để dòng i nằm ở khoảng 1/3 trên của bảng. */
  private scrollToRow(i: number, smooth: boolean): void {
    const row = this.rows[i];
    if (!row || this.collapsed || !this.host.isConnected) return;
    const top = row.offsetTop - this.list.clientHeight / 3;
    this.list.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }

  private syncCollapsed(): void {
    const overlay = this.place === 'overlay';
    this.host.toggleAttribute('collapsed', this.collapsed && !overlay);
    this.collapseBtn.textContent = overlay ? '✕' : this.collapsed ? '▸' : '▾';
    this.collapseBtn.title = overlay ? 'Đóng (Q)' : this.collapsed ? 'Mở bảng (Q)' : 'Thu gọn (Q)';
  }
}
