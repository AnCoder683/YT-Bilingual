import { BRIDGE_SOURCE, isBridgeMessage, type BridgeMessage } from '@/src/bridge';
import { parseTimedtextUrl, trackKey, type TimedtextInfo } from '@/src/timedtext';

// Chạy trong MAIN world: bọc XHR/fetch để ĐỌC response timedtext mà player
// YouTube tự gọi (có token `pot`). Không sửa request/response, luôn gọi tiếp
// bản gốc (có thể đã bị Brave Shields/uBO bọc trước).
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const nonce = crypto.randomUUID();
    const post = (msg: BridgeMessage) => window.postMessage(msg, location.origin);
    const sayHello = () => post({ source: BRIDGE_SOURCE, type: 'hello', nonce });

    window.addEventListener('message', (e) => {
      if (e.source === window && isBridgeMessage(e.data) && e.data.type === 'ready') sayHello();
    });
    sayHello();

    // Chỉ bản dev (`npm run dev`): giữ bản mới nhất của mỗi track, gọi
    // ytBilingualDump() trong console để dump ra MỘT file làm fixtures.
    const captures = new Map<string, { info: TimedtextInfo; body: string }>();
    if (import.meta.env.DEV) Object.defineProperty(window, 'ytBilingualDump', {
      configurable: true,
      value: () => {
        const tracks = [...captures.values()].map(({ info, body }) => ({ info, json3: JSON.parse(body) }));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify({ tracks })], { type: 'application/json' }));
        a.download = `yt-bilingual-capture-${Date.now()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        return [...captures.keys()];
      },
    });

    const emit = (url: string, info: TimedtextInfo, body: string) => {
      if (!body) return;
      if (import.meta.env.DEV) captures.set(trackKey(info), { info, body });
      post({ source: BRIDGE_SOURCE, type: 'timedtext', nonce, url, info, body });
    };

    // --- XMLHttpRequest ---
    const xhrUrls = new WeakMap<XMLHttpRequest, string>();
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      try {
        xhrUrls.set(this, String(args[1]));
      } catch {}
      return (origOpen as (...a: unknown[]) => void).apply(this, args);
    } as typeof origOpen;

    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
      const url = xhrUrls.get(this);
      const info = url ? parseTimedtextUrl(url, location.href) : null;
      if (url && info) {
        this.addEventListener('load', () => {
          if (this.status < 200 || this.status >= 300) {
            console.warn('[yt-bilingual] timedtext XHR status', this.status);
            return;
          }
          try {
            emit(url, info, readXhrBody(this));
          } catch (err) {
            console.warn('[yt-bilingual] không đọc được timedtext XHR', err);
          }
        });
      }
      return (origSend as (...a: unknown[]) => void).apply(this, args);
    } as typeof origSend;

    // --- fetch ---
    const origFetch = window.fetch;
    window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      const promise = origFetch.apply(this, args);
      const url = requestUrl(args[0]);
      const info = url ? parseTimedtextUrl(url, location.href) : null;
      if (url && info) {
        promise
          .then((res) => {
            if (!res.ok) {
              console.warn('[yt-bilingual] timedtext fetch status', res.status);
              return;
            }
            return res.clone().text().then((body) => emit(url, info, body));
          })
          .catch(() => {});
      }
      return promise;
    } as typeof fetch;
  },
});

function readXhrBody(xhr: XMLHttpRequest): string {
  switch (xhr.responseType) {
    case '':
    case 'text':
      return xhr.responseText;
    case 'json':
      return JSON.stringify(xhr.response);
    case 'arraybuffer':
      return new TextDecoder().decode(xhr.response as ArrayBuffer);
    default:
      return '';
  }
}

function requestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return null;
}
