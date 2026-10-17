# CLAUDE.md

Extension MV3 **YT Bilingual**: phụ đề song ngữ YouTube dịch bằng Claude (API key riêng của người dùng), kèm bảng transcript, tra từ, sổ từ vựng và xuất file. Người dùng nạp `.output/chrome-mv3` bằng tay vào Brave.

## Đọc trước khi làm

1. `PLAN.md` §8, dòng **Trạng thái**: đang ở đâu, quyết định gần nhất.
2. `README.md` mục Phát triển: bản đồ thư mục.
3. `FEATURES.md`: hành vi từng chức năng (cập nhật khi đổi chức năng). `VISION.md`: hướng tiếp theo.

## Quy tắc (người dùng đã chốt)

- **Trả lời bằng tiếng Việt**, giải thích từng bước.
- **Chỉ commit/push khi người dùng yêu cầu.** Cuối commit message thêm dòng `Co-Authored-By` theo hướng dẫn của phiên.
- **Thay đổi giao diện: vẽ bản thiết kế (artifact) cho người dùng duyệt trước**, duyệt xong mới code.
- **API key** chỉ nằm trong `chrome.storage.local` (`anthropicApiKey`) và chỉ service worker dùng. Không bao giờ yêu cầu người dùng dán key vào chat, không log key.
- Chỉ gọi Claude qua `@anthropic-ai/sdk` tới API chính thức; **không dùng endpoint không chính thức** (Google/Edge translate…).
- `~/workspace/immersive-src` là bản sao source Immersive Translate **chỉ để tham khảo cơ chế, không bao giờ chép code**.
- Đổi prompt dịch / tra từ thì tăng `PROMPT_VERSION` / `LOOKUP_VERSION` (là một phần khóa cache).

## Lệnh

Node 22 ở `~/.nvm/versions/node/v22.23.3/bin`, **không có sẵn trong PATH** của Claude Code:

```bash
export PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH
npm run compile   # tsc --noEmit
npm test          # Vitest (fakeBrowser import từ 'wxt/testing/fake-browser')
npm run build     # → .output/chrome-mv3
```

Sau mỗi lần build, nhắc người dùng bấm **↻** ở YT Bilingual trong `brave://extensions` rồi tải lại tab YouTube.

## Kiến trúc cần nhớ

- Content script bắt `timedtext` json3 → `buildTranscript` → `makeChunks` (120–180 từ) → service worker gọi Claude; Claude tự chia phụ đề theo chỉ số từ, thêm dấu câu (ASR), stream kết quả từng phần về tab.
- `src/scheduler.ts`: chỉ dịch đoạn đang xem + `LOOKAHEAD` đoạn sau; ngữ cảnh = tiêu đề, glossary tích lũy, tóm tắt 4 đoạn trước, 3 câu trước.
- Cache IndexedDB `yt-bilingual` trong service worker (`src/translate/cache.ts`), khóa theo track/ngôn ngữ/model/phiên bản prompt; tự dọn theo `cacheDays`.
- Ngân sách tháng: vượt thì service worker trả lỗi `budget`, đoạn đó `blocked`, bản trong cache vẫn hiện.
- Overlay, bảng transcript, ô tra từ dùng Shadow DOM; YouTube là SPA nên phải theo dõi đổi video và đổi bố cục (`ytd-watch-flexy`, fullscreen).

## Kiểm thử trên trình duyệt thật

Không có key thật. Cách đã dùng: chạy `brave-browser` với `--user-data-dir` tạm trong scratchpad, `--remote-debugging-port=9333`, `--disable-features=DisableLoadExtensionCommandLineSwitch`, `--load-extension=<repo>/.output/chrome-mv3`, rồi điều khiển bằng script CDP nhỏ (Node 22 có sẵn `WebSocket`). Trong target service worker: đặt `anthropicApiKey` giả và ghi đè `globalThis.fetch` cho `api.anthropic.com` để trả SSE giả. Lưu ý:

- Service worker ngủ nhanh: mở `popup.html` trong một tab và gửi `{type:'test_key'}` để đánh thức trước khi attach.
- `chrome.runtime.reload()` làm mất extension nạp bằng cờ: build lại thì khởi động Brave mới.
- Đợi hết quảng cáo YouTube trước khi kiểm tra phụ đề.
