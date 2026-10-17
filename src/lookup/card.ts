import type { LookupResult } from '../messages';

/** Vì sao ô tra từ đóng: quyết định có phát tiếp video không. */
export type CloseReason = 'esc' | 'button' | 'outside' | 'player' | 'replay' | 'external';

export interface CardCallbacks {
  onSave(): void;
  onClose(reason: CloseReason): void;
}

const STYLE = `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483000;
  width: min(360px, calc(100vw - 16px));
  font-family: Roboto, Arial, sans-serif;
  --bg: #fff;
  --fg: #0f0f0f;
  --fg2: #606060;
  --line: rgba(0, 0, 0, 0.12);
  --accent: #065fd4;
}
:host-context(html[dark]), :host(.on-video) {
  --bg: #212121;
  --fg: #f1f1f1;
  --fg2: #aaa;
  --line: rgba(255, 255, 255, 0.16);
  --accent: #3ea6ff;
}
.card {
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--fg);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  font-size: 14px;
  line-height: 1.45;
}
.top { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding-right: 24px; }
.term { font-size: 18px; font-weight: 600; }
.ipa { color: var(--fg2); }
.pos { color: var(--fg2); font-style: italic; font-size: 13px; }
.close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--fg2);
  font-size: 14px;
  cursor: pointer;
}
.close:hover { background: var(--line); }
.meaning { margin-top: 6px; font-size: 15px; font-weight: 500; }
.def { margin-top: 2px; color: var(--fg2); font-style: italic; }
.note { margin-top: 6px; font-size: 13px; }
.sentence { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); color: var(--fg2); font-size: 13px; }
.sentence b { color: var(--fg); }
.status { margin-top: 6px; color: var(--fg2); }
.status.err { color: #e5534b; }
.actions { display: flex; gap: 8px; margin-top: 10px; }
.actions button {
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: none;
  color: inherit;
  font: 500 13px Roboto, Arial, sans-serif;
  cursor: pointer;
}
.actions button.primary { border-color: var(--accent); background: var(--accent); color: #fff; }
.actions button:disabled { opacity: 0.7; cursor: default; }
[hidden] { display: none !important; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Câu với chữ đã chọn in đậm (DOM, không dùng innerHTML vì Trusted Types). */
function sentenceNodes(sentence: string, picked: string): Node[] {
  const at = picked ? sentence.toLowerCase().indexOf(picked.toLowerCase()) : -1;
  if (at < 0) return [document.createTextNode(sentence)];
  return [
    document.createTextNode(sentence.slice(0, at)),
    el('b', undefined, sentence.slice(at, at + picked.length)),
    document.createTextNode(sentence.slice(at + picked.length)),
  ];
}

/** Ô tra từ nổi cạnh chữ vừa chọn (trên phụ đề hoặc trong bảng transcript). */
export class LookupCard {
  private host = el('div');
  private term = el('span', 'term');
  private ipa = el('span', 'ipa');
  private pos = el('span', 'pos');
  private meaning = el('div', 'meaning');
  private def = el('div', 'def');
  private note = el('div', 'note');
  private sentence = el('div', 'sentence');
  private status = el('div', 'status');
  private saveBtn = el('button', 'primary', '＋ Lưu vào sổ');
  private replayBtn = el('button', undefined, '↺ Nghe lại câu');
  private anchor = new DOMRect();
  private isOpen = false;

  constructor(private cb: CardCallbacks) {
    this.host.id = 'yt-bilingual-lookup';
    const root = this.host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = STYLE;
    const close = el('button', 'close', '✕');
    close.title = 'Đóng (Esc)';
    const top = el('div', 'top');
    top.append(this.term, this.ipa, this.pos);
    const actions = el('div', 'actions');
    actions.append(this.saveBtn, this.replayBtn);
    const card = el('div', 'card');
    card.append(close, top, this.meaning, this.def, this.note, this.status, this.sentence, actions);
    root.append(style, card);

    close.addEventListener('click', () => this.close('button'));
    this.saveBtn.addEventListener('click', () => this.cb.onSave());
    this.replayBtn.addEventListener('click', () => this.close('replay'));
    // Ô có thể nằm trong player (toàn màn hình): click không được lọt xuống YouTube.
    for (const ev of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'wheel']) {
      this.host.addEventListener(ev, (e) => e.stopPropagation());
    }

    document.addEventListener(
      'keydown',
      (e) => {
        if (this.isOpen && e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          this.close('esc');
        }
      },
      true,
    );
    // Bấm ra ngoài thì đóng. Bấm vào chữ trên phụ đề / bảng thì không: nơi đó tự mở lại ô cho chữ mới.
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.isOpen) return;
        const path = e.composedPath();
        if (path.includes(this.host)) return;
        const ids = path.map((n) => (n instanceof HTMLElement ? n.id : ''));
        if (ids.includes('yt-bilingual-host') || ids.includes('yt-bilingual-panel')) return;
        this.close(ids.includes('movie_player') ? 'player' : 'outside');
      },
      true,
    );
    document.addEventListener('fullscreenchange', () => this.isOpen && this.close('outside'));
    window.addEventListener('resize', () => this.isOpen && this.place());
  }

  get opened(): boolean {
    return this.isOpen;
  }

  /** Mở ô ở trạng thái "đang tra…" cạnh vùng `anchor`. */
  open(anchor: DOMRect, picked: string, sentence: string, onVideo: boolean): void {
    this.anchor = anchor;
    this.term.textContent = picked;
    this.ipa.textContent = '';
    this.pos.textContent = '';
    this.meaning.textContent = '';
    this.def.textContent = '';
    this.note.hidden = true;
    this.status.textContent = 'Đang tra…';
    this.status.className = 'status';
    this.status.hidden = false;
    this.sentence.replaceChildren(...sentenceNodes(sentence, picked));
    this.saveBtn.disabled = true;
    this.saveBtn.textContent = '＋ Lưu vào sổ';
    this.host.classList.toggle('on-video', onVideo);
    (document.fullscreenElement ?? document.body).append(this.host);
    this.isOpen = true;
    this.place();
  }

  setResult(r: LookupResult, saved: boolean): void {
    this.term.textContent = r.term;
    this.ipa.textContent = r.ipa;
    this.pos.textContent = r.pos;
    this.meaning.textContent = r.meaning;
    this.def.textContent = r.definition;
    this.def.hidden = !r.definition;
    this.note.textContent = r.note;
    this.note.hidden = !r.note;
    this.status.hidden = true;
    this.setSaved(saved);
    this.place();
  }

  setError(message: string): void {
    this.status.textContent = `⚠ ${message}`;
    this.status.className = 'status err';
    this.place();
  }

  setSaved(saved: boolean): void {
    this.saveBtn.disabled = saved;
    this.saveBtn.textContent = saved ? '✓ Đã lưu' : '＋ Lưu vào sổ';
  }

  close(reason: CloseReason): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.host.remove();
    this.cb.onClose(reason);
  }

  /** Đặt phía trên vùng chữ; không đủ chỗ thì phía dưới; luôn nằm trong màn hình. */
  private place(): void {
    const w = this.host.offsetWidth;
    const h = this.host.offsetHeight;
    const a = this.anchor;
    const gap = 10;
    let top = a.top - h - gap;
    if (top < 8) top = Math.min(a.bottom + gap, innerHeight - h - 8);
    const left = Math.min(Math.max(8, a.left + a.width / 2 - w / 2), innerWidth - w - 8);
    this.host.style.top = `${Math.max(8, top)}px`;
    this.host.style.left = `${left}px`;
  }
}
