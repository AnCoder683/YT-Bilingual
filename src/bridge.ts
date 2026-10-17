import type { TimedtextInfo } from './timedtext';

// Giao tiếp MAIN world -> isolated world qua window.postMessage.
// MAIN world sinh nonce ngẫu nhiên lúc document_start và gửi `hello`; content
// script khóa nonce đầu tiên nhận được (luôn là của mình, vì chạy trước mọi
// script của trang) và bỏ qua mọi message không mang đúng nonce đó.

export const BRIDGE_SOURCE = 'yt-bilingual';

export type BridgeMessage =
  | { source: typeof BRIDGE_SOURCE; type: 'ready' }
  | { source: typeof BRIDGE_SOURCE; type: 'hello'; nonce: string }
  | {
      source: typeof BRIDGE_SOURCE;
      type: 'timedtext';
      nonce: string;
      url: string;
      info: TimedtextInfo;
      body: string;
    };

export function isBridgeMessage(data: unknown): data is BridgeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === BRIDGE_SOURCE &&
    typeof (data as { type?: unknown }).type === 'string'
  );
}
