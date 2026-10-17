import { BRIDGE_SOURCE, isBridgeMessage } from '@/src/bridge';
import { Controller } from '@/src/controller';
import type { PartialMessage } from '@/src/messages';
import { handlePartial } from '@/src/scheduler';
import { trackKey } from '@/src/timedtext';
import { buildTranscript, type Json3 } from '@/src/transcript';

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_start',
  main() {
    let nonce: string | null = null;
    const seen = new Set<string>();
    const controller = new Controller();

    // Phụ đề dịch xong dần trong lúc Claude đang stream.
    browser.runtime.onMessage.addListener((msg: PartialMessage) => {
      if (msg?.type === 'partial') handlePartial(msg);
    });

    window.addEventListener('message', (e) => {
      if (e.source !== window || !isBridgeMessage(e.data)) return;
      const msg = e.data;

      if (msg.type === 'hello') {
        nonce ??= msg.nonce;
        return;
      }
      if (msg.type !== 'timedtext' || !nonce || msg.nonce !== nonce) return;

      if (msg.info.fmt !== 'json3') {
        console.warn('[yt-bilingual] timedtext không phải json3, bỏ qua', msg.info);
        return;
      }
      let data: Json3;
      try {
        data = JSON.parse(msg.body);
      } catch (err) {
        console.warn('[yt-bilingual] json3 lỗi parse', err);
        return;
      }
      const key = trackKey(msg.info);
      if (!seen.has(key)) {
        seen.add(key);
        console.log('[yt-bilingual] timedtext mới:', { ...msg.info, events: data.events?.length ?? 0 });
      }
      controller.setTranscript(msg.info, buildTranscript(data, msg.info.lang));
    });

    // Nếu page-hook đã gửi hello trước khi listener này có, xin gửi lại.
    window.postMessage({ source: BRIDGE_SOURCE, type: 'ready' }, location.origin);
  },
});
