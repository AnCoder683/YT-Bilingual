# Plan: Extension phụ đề song ngữ YouTube (tốt hơn Immersive Translate)

> Viết ngày 2026-10-17, dựa trên phiên reverse engineering Immersive Translate 1.33.3.
> Session sau: đọc file này trước, rồi bắt đầu từ **Milestone 0**.

## 1. Mục tiêu

Extension Manifest V3 cho Chrome/Brave, hiển thị phụ đề song ngữ trên YouTube với
chất lượng dịch **sát ngữ cảnh** hơn Immersive Translate:

- Không dính chữ, không cắt ngang từ/câu.
- Dịch có ngữ cảnh cả video (nhân vật, xưng hô, thì, thuật ngữ nhất quán).
- Căn bản dịch theo **từng câu** và mốc thời gian, không hiển thị cả cụm.
- Dịch trước (prefetch) để không trễ; có cache.

Không mục tiêu (giai đoạn đầu): dịch trang web, PDF, OCR, nền tảng ngoài YouTube.

## 2. Những gì đã biết về Immersive Translate (bằng chứng từ phiên RE)

Source đã copy tại `~/workspace/immersive-src` (chỉ để tham khảo cơ chế, **không copy code**).

| Bước | Cách họ làm | Bằng chứng |
|---|---|---|
| Lấy phụ đề | Không tự gọi API. Chờ player YouTube (`captions.js`) gọi `timedtext`, rồi chặn ở `XMLHttpRequest.prototype.send` (có cả hook `fetch`) | Call stack: `toggleSubtitles` → `captions.js` → `inject.js:1 l`. Hook trong `video-subtitle/inject.js` |
| Vì sao không tự gọi | Request có `pot` (proof-of-origin token) do player sinh, tự gọi dễ bị 403/429 | Payload `timedtext`: `fmt=json3`, `kind=asr`, `lang=vi`, `pot=...`, không có `tlang` |
| Nhận diện URL | Regex `subtitleUrlRegExp` lấy từ config | `isSubtitleRequest()` trong `inject.js` |
| 2 chế độ | Chỉ đọc `responseText` sau khi xong, hoặc can thiệp trước khi gửi; xử lý riêng lỗi 429 | Đoạn hook `send` trong `inject.js` |
| Cầu nối | `inject.js` (MAIN world) ↔ `content_main.js` qua `window.postMessage` có `from/to/id` | `inject.js` |
| Tiền xử lý | Ghép mảnh ASR thành đoạn ~2–3 câu, gom 4 đoạn/request | Payload `translatetext` là mảng 4 chuỗi |
| Dịch | `background.js` fetch `https://edge.microsoft.com/translate/translatetext?from=vi&to=en&isEnterpriseClient=false` (endpoint nội bộ Edge, không chính thức) | Network của service worker; cấu hình trong `content_main.js` |
| Response | `[{translations:[{text,to,sentLen:{srcSentLen,transSentLen}}]}]`, cùng thứ tự với input | Tab Response |
| Hiển thị | `div#immersive-translate-caption-window` + **Shadow DOM (open)**, `span.source-cue` + `span.target-cue`, style inline co theo player | Elements |
| Đồng bộ | Nghe `video` `timeupdate` → `setActiveCues`; fallback `setInterval` 100ms; `ResizeObserver` co chữ; UI viết bằng React/Preact | grep `content_main.js` |
| Dịch vụ khác có sẵn | Google `translate_a/t`, DeepL jsonrpc, Microsoft, OpenAI, Gemini, Volcengine, server AI riêng | grep URL trong bundle |

Lưu ý môi trường: Brave Shields chèn scriptlet (`VM...` với `proxyApplyFn`) bọc XHR/fetch → xuất hiện đầu call stack, **không phải** của extension. Extension của mình phải chịu được việc XHR/fetch đã bị bọc nhiều lớp.

## 3. Điểm yếu của họ = cơ hội của mình

| # | Điểm yếu quan sát được | Ví dụ thật | Cách mình làm tốt hơn |
|---|---|---|---|
| W1 | Dính chữ khi nối mảnh ASR | `cònhai`, `tớikhi`, `rấtnhiều`, `Ngânđứng` | Nối mảnh có chèn khoảng trắng theo quy tắc (xem §5.2) |
| W2 | Cắt đoạn theo kích thước, cắt ngang từ/câu | Đoạn bắt đầu bằng `nghiệp đấy.` → dịch thành "karma." | Cắt theo câu + khoảng lặng, không bao giờ tách giữa một event |
| W3 | Mỗi đoạn dịch độc lập, không có ngữ cảnh | "forget" sai thì; "his" đoán giới tính | LLM với ngữ cảnh toàn video: tóm tắt + glossary nhân vật/xưng hô |
| W4 | Bỏ qua `sentLen`, hiển thị cả cụm | — | Dịch theo **id câu**, mỗi câu gắn `startMs/endMs` |
| W5 | Nguồn ASR sai (nghe nhầm), không sửa | `nhắc cònhai phone` → "two phones" | Bước tùy chọn: LLM sửa lỗi ASR + thêm dấu câu trước khi dịch |
| W6 | Phụ thuộc endpoint không chính thức | `edge.microsoft.com/translate` | Provider chính thức (Claude/OpenAI/Gemini/DeepL/Azure), có fallback |

## 4. Kiến trúc

```
YouTube page (MAIN world)                Extension (isolated world)            Service worker
┌──────────────────────────┐  postMessage ┌────────────────────────────┐ runtime ┌──────────────────────┐
│ page-hook.ts             │─────────────▶│ content.ts                 │────────▶│ background.ts        │
│ - bọc XHR.send + fetch   │  (json3 raw) │ - transcript/parse.ts      │ message │ - providers/*        │
│ - lọc URL timedtext      │              │ - transcript/segment.ts    │◀────────│ - cache (IndexedDB)  │
│ - đọc response, không    │              │ - scheduler (prefetch)     │         │ - rate limit / retry │
│   sửa response           │              │ - overlay/ (Shadow DOM)    │         │ - API key (storage)  │
└──────────────────────────┘              │ - sync theo video time     │         └──────────────────────┘
                                          └────────────────────────────┘
```

Quyết định kỹ thuật:
- **Framework build:** WXT (Vite, hỗ trợ MV3, TypeScript, hot reload). Phương án thay thế: Vite + CRXJS.
- **Hook trong trang:** content script khai báo `"world": "MAIN"`, `run_at: document_start` (MV3 hỗ trợ sẵn). Không cần web_accessible inject như họ.
- **Bridge:** `window.postMessage` với `source: "<tên-ext>"` + nonce sinh mỗi lần tải trang; content script chỉ nhận message có nonce đúng (trang khác không giả mạo được dễ dàng).
- **UI overlay:** Preact hoặc vanilla TS, render trong Shadow DOM gắn vào `#movie_player`; ẩn phụ đề gốc bằng CSS (`.ytp-caption-window-container { display:none }`) khi bật chế độ song ngữ.
- **Dịch gọi từ service worker** (tránh CORS, giữ API key khỏi trang).

## 5. Thiết kế chi tiết các phần khó

### 5.1 Dữ liệu json3
`events[]`, mỗi event có `tStartMs`, `dDurationMs`, `segs[{utf8, tOffsetMs?}]`. Event có `aAppend: 1` hoặc `segs` chỉ là `"\n"` cần bỏ. ASR có thể có `tOffsetMs` theo từ → dùng làm mốc thời gian chi tiết.

### 5.2 Nối mảnh (sửa W1)
- Chuẩn hóa từng `utf8` (trim newline, gộp whitespace).
- Khi nối A + B: chèn 1 dấu cách nếu A không kết thúc bằng whitespace và B không bắt đầu bằng whitespace/dấu câu đóng. Với ngôn ngữ không dùng dấu cách (zh/ja/th) thì không chèn.
- Unit test bắt buộc với chính các ví dụ lỗi: `còn` + `hai`, `tới` + `khi`, `Ngân` + `đứng`.

### 5.3 Chia câu (sửa W2)
Một câu kết thúc khi có một trong các điều kiện (ưu tiên từ trên xuống):
1. Dấu kết câu `. ? ! …` (và `。？！` cho CJK).
2. Khoảng lặng giữa hai từ/segment ≥ ~700 ms (tham số hóa).
3. Câu đã dài > ~12 s hoặc > ~120 ký tự → cắt ở khoảng lặng lớn nhất bên trong.
Không bao giờ cắt giữa một segment. Mỗi câu: `{id, text, startMs, endMs}`.

**Bài học từ fixture `AdygBbbEnco` (ASR tiếng Anh, nói nhanh):** ASR không có dấu câu và gần như không có khoảng lặng, nên quy tắc 2–3 chỉ cắt được ở "chỗ nghỉ dài nhất trong ~120 ký tự", vẫn còn cắt giữa ý (`…programmer not | only will…`). Heuristic chỉ là **đơn vị hiển thị tạm**. Cách sửa gốc thuộc M4/M5: gửi cho LLM chuỗi từ ASR đã đánh số, để LLM trả về **ranh giới câu theo chỉ số token** kèm bản gốc có dấu câu và bản dịch. Mốc thời gian lấy lại từ token nên vẫn chính xác. Phụ đề người làm (có dấu câu) thì giữ cách chia hiện tại.

### 5.4 Dịch có ngữ cảnh (sửa W3, W4, W5)
- Đơn vị gửi: **lô ~20–40 câu** theo thứ tự thời gian, kèm:
  - `context.summary`: tóm tắt ngắn phần đã dịch trước đó (cập nhật dần).
  - `context.glossary`: tên riêng, nhân vật + giới tính/xưng hô (anh/em/chị…), thuật ngữ — tích lũy qua các lô.
  - 3–5 câu trước và sau lô (chỉ để tham khảo, không dịch).
- Yêu cầu output **JSON có cấu trúc** `[{id, translation}]` + `glossary_updates`; validate số lượng/id, thiếu thì retry đúng các id thiếu.
- Tùy chọn "Sửa phụ đề tự động": LLM trả thêm `corrected_source` cho câu ASR (hiển thị dòng gốc đã sửa).
- Provider dạng interface chung `translateBatch(sentences, context) → results`:
  - `claude` (khuyến nghị mặc định cho chất lượng; model id lấy theo tài liệu Anthropic mới nhất lúc build),
  - `openai`, `gemini`, `deepl`, `azure` (NMT, không ngữ cảnh — làm fallback rẻ/nhanh).

### 5.5 Lịch dịch (prefetch)
- Khi có transcript: dịch ngay lô chứa `currentTime` và lô kế tiếp; sau đó chạy nền phần còn lại theo thứ tự.
- Khi người dùng tua: đưa lô quanh vị trí mới lên đầu hàng đợi.
- Giới hạn song song (2–3 request), backoff khi 429/5xx.

### 5.6 Cache
IndexedDB key = `videoId + sourceLang + kind(asr|manual) + targetLang + provider + promptVersion` → mảng bản dịch theo id câu. Mở lại video là có ngay, không tốn tiền API.

### 5.7 Hiển thị & đồng bộ
- Tìm câu active bằng binary search trên `startMs` mỗi `timeupdate` + `requestAnimationFrame` khi đang play (mượt hơn `timeupdate` ~250ms).
- `ResizeObserver` trên player → font-size theo chiều cao video; hỗ trợ fullscreen/theater/miniplayer.
- Tùy chọn: chỉ bản dịch / song ngữ / chỉ gốc; vị trí; cỡ chữ; kéo-thả.

### 5.8 Các ca biên phải xử lý
- YouTube là SPA: nghe `yt-navigate-finish`, reset state khi đổi video.
- Quảng cáo: bỏ qua khi `#movie_player` có class `ad-showing`.
- Đổi track phụ đề / bật-tắt CC → request `timedtext` mới, phải thay transcript.
- Người dùng chưa bật CC → hiện nút nhắc bật CC (vì không tự gọi timedtext).
- XHR/fetch đã bị bọc bởi adblock (Brave Shields, uBO) — hook phải gọi tiếp bản gốc đúng cách và không làm hỏng chúng.

## 6. Milestones

| M | Nội dung | Tiêu chí xong |
|---|---|---|
| **M0** | Khởi tạo project WXT + TypeScript + Vitest; load unpacked vào Brave | Extension hiện trong `brave://extensions`, log "hello" trên trang YouTube |
| **M1** | `page-hook` bắt `timedtext` (XHR + fetch), bridge sang content script; lưu 2–3 file json3 thật vào `fixtures/` | Console in số event + ngôn ngữ khi bật CC; có fixtures cho test |
| **M2** | `parse` + `join` + `segment` + unit test | Test pass với fixtures; không còn ca dính chữ; không câu nào bắt đầu bằng nửa từ |
| **M3** | Overlay Shadow DOM hiển thị **câu gốc** đã chia, đồng bộ thời gian, resize/fullscreen | Phụ đề gốc của mình khớp thời gian với video, ẩn được phụ đề YouTube |
| **M4** | Provider đầu tiên (Claude) + popup/options nhập API key + scheduler + cache | Song ngữ chạy end-to-end; mở lại video dùng cache |
| **M5** | Ngữ cảnh: summary + glossary + câu lân cận; tùy chọn sửa ASR | So sánh với Immersive Translate trên cùng video (§7) cho kết quả tốt hơn |
| **M6** | Thêm provider fallback, xử lý SPA/ads/lỗi, tùy chỉnh giao diện | Dùng ổn định 1 tuần không lỗi lớn |

## 7. Cách đánh giá chất lượng

- Chọn 3 video: (a) ASR tiếng Việt kể chuyện (như video đã test `3PCyK5Wwoi8`), (b) phụ đề người làm tiếng Anh, (c) nội dung kỹ thuật nhiều thuật ngữ.
- Mỗi video lấy ~30 câu, chấm: đúng nghĩa / đúng xưng hô–giới tính / thì nhất quán / thuật ngữ nhất quán / đọc tự nhiên (1–5).
- So sánh: Immersive Translate (Microsoft) vs bản của mình (NMT fallback) vs bản của mình (LLM + ngữ cảnh).

## 8. Quyết định đã chốt (2026-10-17)

1. Provider mặc định: **Claude**, dùng API key cá nhân.
2. Ngôn ngữ: **cả hai chiều**. Tự nhận ngôn ngữ nguồn từ track `timedtext`, ngôn ngữ đích chọn trong options.
3. UI: **vanilla TS** (không framework).
4. Thư mục project: `~/workspace/yt-bilingual`.

Trạng thái: **M0–M6 xong** (2026-10-17; prompt v3 thử thật trên Hdw5xOjA9wc: phụ đề người làm giờ mỗi câu 1 dòng). Giai đoạn tiếp: người dùng dùng hằng ngày, gom góp ý. Chi tiết M6: **M6 đã code, người dùng thử thật OK** (2026-10-17; streaming chạy với Haiku 5.5). Sau phản hồi (phụ đề người làm dài 3+2 dòng), bỏ hẳn mode `lines`: mọi track đều để Claude chia phụ đề theo chỉ số từ (prompt v3; track "human" giữ nguyên chữ và dấu câu, chỉ chọn chỗ ngắt; đoạn ưu tiên cắt sau dấu kết câu). M6: streaming (service worker gửi `partial` về tab, phụ đề hiện dần, phần chưa dịch vẫn hiện câu gốc), báo "đang dịch…" / lỗi mạng "sẽ thử lại" ở chỗ bản dịch, popup thêm chế độ hiển thị (song ngữ / chỉ dịch / chỉ gốc) + cỡ chữ (đổi không dịch lại), `ytBilingualDump` chỉ còn ở bản dev, sửa bug makeChunks khi transcript chỉ dài 120–180 từ; quảng cáo: overlay ẩn đúng (thấy khi test). Bỏ qua provider dự phòng (Haiku 5.5 đủ rẻ). Đã kiểm thử bằng API giả dạng SSE. M5 (2026-10-17): người dùng chạy thật với Haiku 5.5 trên H0HwFqBG9KE (6:49), câu trọn vẹn, có dấu câu, dịch tự nhiên; người dùng thấy Haiku 5.5 đủ tốt (rẻ hơn Sonnet ~20 lần). M4 chạy thật: P0Fk-K2eZF8 (1:55, ASR en→vi, Sonnet 5.5) tốn ~$0.02, cache hoạt động. M5 (prompt v2): ASR chia thành đoạn 120–180 từ (cắt ở khoảng lặng lớn nhất, mẩu dư < 60 từ gộp vào đoạn trước), Claude nhận từ đánh số và trả `{last_word, source có dấu câu, text}`; phụ đề người làm vẫn dịch 1:1 theo lô 25 câu. Mỗi request kèm tiêu đề video, glossary tích lũy, tóm tắt 4 đoạn trước, 3 dòng trước (có bản dịch). Đoạn sau chỉ chạy khi đoạn trước xong (để có ngữ cảnh), đoạn đang xem chạy ngay. Cache theo băm nội dung đoạn. Đã kiểm thử end-to-end trong Brave bằng API giả (chia đoạn, ngữ cảnh, cache, tua, SPA). Ước tính Sonnet 5.5 ≈ $1.2/giờ ASR (gấp đôi M4 vì trả cả bản gốc có dấu câu). Còn lại: chỗ nối giữa 2 đoạn có thể cắt giữa câu (~1 lần/40 s với video nói liền); độ trễ đoạn đầu ~10 s (nếu chậm thì M6 làm streaming); so sánh Haiku/Sonnet/Opus: người dùng tự đánh giá dần qua quá trình sử dụng (đổi model trong popup, cache tách theo model).

## 9. Nguyên tắc

- **Không copy code** từ `~/workspace/immersive-src`; chỉ dùng làm tham khảo cơ chế (§2).
- Không dùng endpoint không chính thức (`edge.microsoft.com/translate`, `translate_a/t`) cho bản chính thức.
- API key chỉ lưu trong `chrome.storage.local`, chỉ service worker dùng.

## 10. Môi trường đã có trên máy

- Node.js v22.23.3 qua nvm (`~/.nvm/versions/node/v22.23.3/bin`). Nếu Claude Code không thấy `node`/`npx`, thêm PATH đó.
- Brave; Immersive Translate 1.33.3 (ID `bpoadfkcbjbfhfodiogcnhhhpibjhbnh`) đang cài để đối chiếu.
- REA MCP (`rea-agents@6.5.0`) đã đăng ký cho Claude Code (user scope), không cài Hopper.
- Bản sao source Immersive Translate: `~/workspace/immersive-src`.
