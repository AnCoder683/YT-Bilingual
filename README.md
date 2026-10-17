# YT Bilingual

Extension cho Brave / Chrome / Edge, hiển thị **phụ đề song ngữ trên YouTube**, dịch bằng Claude theo từng câu và có ngữ cảnh.

- Claude chia lại phụ đề thành câu trọn vẹn, ngắn và dễ đọc. Phụ đề tự động (ASR) được thêm dấu câu; phụ đề người làm giữ nguyên chữ.
- Bản dịch có ngữ cảnh: tiêu đề video, glossary tên riêng/thuật ngữ, tóm tắt các đoạn trước, cách xưng hô nhất quán.
- Câu nào dịch xong hiện ngay, không phải chờ dịch hết video.
- Bản dịch được cache trong trình duyệt, nên xem lại không tốn thêm tiền.
- Chọn được model (Haiku / Sonnet / Opus 5.5), ngôn ngữ đích, chế độ hiển thị (song ngữ / chỉ bản dịch / chỉ bản gốc) và cỡ chữ.

Cần **Claude API key của riêng bạn**, lấy tại [platform.claude.com](https://platform.claude.com) → Khóa API. Với Haiku 5.5, chi phí khoảng $0,06 cho mỗi giờ video.

## Cài đặt

Extension chưa có trên Chrome Web Store, nên phải cài dạng *unpacked*.

### Cách A: từ mã nguồn (cần Node.js 22+)

```bash
git clone https://github.com/AnCoder683/YT-Bilingual.git
cd YT-Bilingual
npm install
npm run build      # tạo thư mục .output/chrome-mv3
```

### Cách B: từ file zip (không cần Node)

Trên máy đã build, chạy `npm run zip` để tạo `.output/yt-bilingual-<version>-chrome.zip`. Chép file zip sang máy cần cài rồi giải nén ra một thư mục cố định. Đừng xóa thư mục này, xóa đi thì extension mất.

### Nạp vào trình duyệt

1. Mở `brave://extensions` (Chrome thì mở `chrome://extensions`, Edge thì mở `edge://extensions`).
2. Bật **Developer mode**.
3. Bấm **Load unpacked** và chọn thư mục `.output/chrome-mv3` (hoặc thư mục vừa giải nén từ zip).
4. Ghim **YT Bilingual** lên thanh công cụ (biểu tượng 🧩).

## Sử dụng

1. Mở popup YT Bilingual, dán API key, bấm **Lưu key**. Phải thấy "✓ Key hợp lệ".
2. Chọn model, ngôn ngữ đích, cách hiển thị và cỡ chữ.
3. Mở video YouTube và **bật phụ đề CC** (phím `c`). Bước này bắt buộc, vì extension dùng chính phụ đề mà YouTube tải về khi bật CC.

Popup hiển thị chi phí ước tính của tháng này và tổng chi phí. Số chính xác xem ở platform.claude.com → Chi phí (cập nhật trễ vài giờ).

## Cập nhật

```bash
git pull
npm run build
```

Sau đó vào trang extensions và bấm **↻** ở YT Bilingual. Key và cache được giữ nguyên.

## Bảo mật và dữ liệu

- API key chỉ lưu trong `chrome.storage.local` của trình duyệt và chỉ service worker của extension dùng; trang YouTube không đọc được. Đừng chia sẻ key. Lỡ lộ thì xóa key trên Console và tạo key mới.
- Extension chỉ gửi nội dung phụ đề (kèm tiêu đề video) tới `api.anthropic.com` để dịch.
- Cache bản dịch lưu trong IndexedDB `yt-bilingual` của service worker. Muốn xem hoặc xóa: vào trang extensions, bấm link **service worker** → DevTools → Application → IndexedDB.

## Phát triển

```bash
npm run dev        # build dev; có thêm ytBilingualDump() trong console để lưu phụ đề làm fixtures
npm test           # unit test (Vitest)
npm run compile    # kiểm tra kiểu TypeScript
```

Cấu trúc chính:

| Đường dẫn | Vai trò |
|---|---|
| `entrypoints/page-hook.content.ts` | Bắt request `timedtext` (json3) của player YouTube |
| `entrypoints/content.ts`, `src/controller.ts` | Nhận transcript, đồng bộ với video, điều khiển overlay |
| `src/transcript/` | Tách từ và chia câu tạm (heuristic) |
| `src/translate/chunks.ts` | Chia transcript thành đoạn khoảng 40 giây để gửi Claude |
| `src/scheduler.ts` | Lịch dịch (đoạn đang xem + dịch trước), ghép ngữ cảnh, hiện dần |
| `src/translate/` | Prompt, gọi Claude (streaming), cache, chi phí |
| `entrypoints/background.ts` | Service worker: giữ key, gọi API, cache |
| `entrypoints/popup/` | Giao diện cài đặt |

Kế hoạch và các quyết định thiết kế nằm trong [PLAN.md](PLAN.md).
