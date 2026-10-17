# YT Bilingual: các chức năng

Tài liệu này mô tả từng chức năng của extension: nó làm gì, dùng thế nào và chạy ra sao. Cách cài đặt xem trong [README.md](README.md); lợi ích và hướng phát triển xem trong [VISION.md](VISION.md).

## Mục lục

1. [Phụ đề song ngữ trên video](#1-phụ-đề-song-ngữ-trên-video)
2. [Dịch bằng Claude có ngữ cảnh](#2-dịch-bằng-claude-có-ngữ-cảnh)
3. [Hiện dần và dịch trước](#3-hiện-dần-và-dịch-trước)
4. [Cache: xem lại không tốn tiền](#4-cache-xem-lại-không-tốn-tiền)
5. [Bảng transcript song ngữ](#5-bảng-transcript-song-ngữ)
6. [Phím tắt theo câu và chế độ tự dừng](#6-phím-tắt-theo-câu-và-chế-độ-tự-dừng)
7. [Chi phí và giới hạn ngân sách](#7-chi-phí-và-giới-hạn-ngân-sách)
8. [Cài đặt trong popup](#8-cài-đặt-trong-popup)
9. [Thông báo và xử lý lỗi](#9-thông-báo-và-xử-lý-lỗi)
10. [Bảo mật và quyền riêng tư](#10-bảo-mật-và-quyền-riêng-tư)
11. [Tóm tắt phím tắt](#11-tóm-tắt-phím-tắt)

---

## 1. Phụ đề song ngữ trên video

- Hiện **hai dòng** ngay trên video: bản dịch ở trên (màu vàng nhạt), câu gốc ở dưới (màu trắng).
- Mỗi phụ đề là **một câu trọn vẹn, ngắn** (khoảng 1 dòng). Câu không bị cắt ngang giữa chừng như phụ đề tự động của YouTube.
- **Phụ đề tự động (ASR)** được Claude thêm dấu câu, viết hoa và sửa những chỗ nghe nhầm rõ ràng. **Phụ đề do người làm** được giữ nguyên chữ, chỉ chia lại chỗ ngắt dòng.
- Thời gian hiện phụ đề tính theo **từng từ**, nên phụ đề khớp với lúc người nói nói câu đó.
- Cỡ chữ tự co giãn theo kích thước player (thường, rạp hát, toàn màn hình) và chỉnh thêm được trong popup.
- Phụ đề gốc của YouTube được ẩn đi để không bị hai lớp chữ chồng lên nhau. Lúc có quảng cáo thì extension tự ẩn.
- **Ba chế độ hiển thị:** song ngữ, chỉ bản dịch, hoặc chỉ bản gốc (đã chia câu và thêm dấu câu, hợp để luyện đọc).

**Cách bật:** mở video và **bật CC** (phím `c`). Extension dùng chính phụ đề mà YouTube tải về khi bật CC, nên video phải có phụ đề (tự động hoặc do người làm).

## 2. Dịch bằng Claude có ngữ cảnh

Mỗi lần dịch, extension gửi cho Claude một **đoạn khoảng 120–180 từ** (cắt ở chỗ ngắt câu hoặc khoảng lặng), kèm ngữ cảnh:

| Ngữ cảnh | Tác dụng |
|---|---|
| Tiêu đề video | Biết chủ đề để chọn từ cho đúng (ví dụ "model" trong video AI khác với trong video thời trang) |
| Glossary tích lũy | Tên riêng, thuật ngữ, cách xưng hô được giữ **nhất quán** suốt video |
| Tóm tắt các đoạn trước | Hiểu câu chuyện đang đi tới đâu |
| Vài câu trước (kèm bản dịch) và vài câu sau | Nối mạch tự nhiên giữa hai đoạn |

- Chọn được **model**: Haiku 5.5 (rẻ nhất, dùng hằng ngày ổn), Sonnet 5.5 (cân bằng), Opus 5.5 (dịch hay nhất).
- Chọn **ngôn ngữ đích**: Việt, Anh, Nhật, Hàn, Trung giản thể, Pháp, Đức, Tây Ban Nha.
- **Ngôn ngữ đích phụ:** nếu video đã ở ngôn ngữ đích chính (ví dụ video tiếng Việt), extension dịch sang ngôn ngữ phụ (ví dụ tiếng Anh).
- Chỉ gọi **API chính thức** của Anthropic, bằng key của chính bạn.

## 3. Hiện dần và dịch trước

- **Streaming:** Claude dịch xong câu nào thì câu đó hiện ngay, không phải chờ cả đoạn. Phần chưa dịch tạm hiện câu gốc.
- **Ưu tiên đoạn đang xem:** đoạn ở vị trí đang xem được dịch ngay, kể cả khi bạn tua tới giữa video.
- **Dịch trước 2 đoạn tiếp theo**, nên khi xem liền mạch gần như không phải đợi.
- Đoạn sau chỉ chạy khi đoạn trước đã xong, để nhận được glossary và tóm tắt mới nhất.
- **Chỉ trả tiền cho phần bạn thật sự xem.** Extension không tự dịch cả video.

## 4. Cache: xem lại không tốn tiền

- Mọi bản dịch được lưu trong trình duyệt (IndexedDB của extension).
- Xem lại, tua lại hay mở lại video hôm sau đều lấy từ cache: **hiện tức thì và không tốn tiền**.
- Cache tách theo track phụ đề, ngôn ngữ đích và model. Đổi model là có bản dịch mới, đổi lại model cũ thì bản cũ vẫn còn.
- Xem hoặc xóa cache: `brave://extensions` → YT Bilingual → **service worker** → DevTools → Application → IndexedDB → `yt-bilingual`.

## 5. Bảng transcript song ngữ

Bảng chứa toàn bộ câu của video, mỗi câu có bản gốc và bản dịch, giống như một "sách song ngữ" của video.

### Tự đặt chỗ theo bố cục

| Bố cục YouTube | Vị trí bảng |
|---|---|
| Màn hình rộng | Cột phải (thay chỗ video đề xuất), cao bằng video, ở lại khi cuộn trang |
| Rạp hát (`t`) | Cột phải bên dưới video, ở lại khi cuộn |
| Cửa sổ hẹp | Ngay dưới video |
| Toàn màn hình (`f`) | Lớp phủ bên phải video, bấm `Q` để hiện/ẩn; phụ đề tự né sang trái |

Đổi bố cục (thu nhỏ cửa sổ, bật rạp hát, toàn màn hình) thì bảng tự chuyển chỗ.

### Chức năng

- **Tô sáng câu đang phát** và tự cuộn theo video.
- **Bấm vào câu để tua tới đó** và phát. Bôi đen chữ để chép thì không bị tua.
- **Tìm kiếm** trong cả câu gốc lẫn bản dịch, **không cần gõ dấu** (`van hoa` vẫn tìm ra "văn hóa"):
  - `Enter` / `Shift+Enter`: kết quả sau / trước;
  - `Esc`: xóa ô tìm.
- **Tự cuộn tạm dừng** khi bạn cuộn bảng để đọc lại, chạy lại sau 10 giây hoặc khi bấm **↓ Câu đang phát**.
- Thu gọn bằng nút ▾ hoặc phím `Q`. Trạng thái thu gọn được nhớ lại.
- **Tắt CC thì bảng vẫn chạy và vẫn dịch.** Chỉ cần bật CC một lần để extension lấy được phụ đề.
- Theo giao diện sáng/tối của YouTube.

## 6. Phím tắt theo câu và chế độ tự dừng

Dành cho luyện nghe:

| Phím | Tác dụng |
|---|---|
| `A` | Về câu trước. Đang ở khoảng lặng giữa hai câu thì nghe lại câu vừa nói. |
| `D` | Sang câu sau |
| `S` | Nghe lại câu hiện tại (video tự phát nếu đang dừng) |

- Video tua về **sớm hơn đầu câu một chút** để không mất âm đầu của từ đầu tiên.
- **Tự dừng sau mỗi câu** (bật trong popup):
  - Video dừng ở cuối mỗi câu, màn hình giữ câu vừa nghe để đọc.
  - `K` hoặc Space để nghe tiếp, `S` để nghe lại, `D` để sang câu sau.
  - Vẫn đúng khi câu sau nối liền ngay hoặc khi bạn tua bằng phím của YouTube.
- Phím tắt **không chạy khi đang gõ chữ** (ô tìm kiếm, bình luận) và không đụng phím tắt của YouTube. Tắt được trong popup.

## 7. Chi phí và giới hạn ngân sách

- Popup hiện **chi phí tháng này** và **tổng chi phí**, tính theo số token thật API trả về.
- Tham khảo: Haiku 5.5 tốn khoảng **$0,06 cho mỗi giờ video**. Sonnet 5.5 đắt hơn khoảng 20 lần.
- Số chính xác xem ở platform.claude.com → Chi phí (cập nhật trễ vài giờ).

**Giới hạn mỗi tháng** (USD, `0` = không giới hạn):

- Có thanh tiến độ trong popup; từ **80%** thì chuyển màu cảnh báo.
- Khi **chạm mức**, extension ngừng gọi API và hiện cảnh báo trên video. **Bản dịch đã có trong cache vẫn xem bình thường.**
- Tăng giới hạn thì extension tự dịch tiếp, không cần tải lại trang.
- Các đoạn đang dịch dở vẫn chạy cho xong, nên có thể vượt mức một chút.

## 8. Cài đặt trong popup

| Mục | Ý nghĩa |
|---|---|
| Bật dịch song ngữ | Tắt thì vẫn hiện câu gốc đã chia câu, không gọi API |
| Claude API key | Lưu key, nút **Kiểm tra** (miễn phí, không tốn token) |
| Model | Haiku / Sonnet / Opus 5.5 |
| Dịch sang / ngôn ngữ phụ | Ngôn ngữ đích chính, và ngôn ngữ dùng khi video đã ở ngôn ngữ chính |
| Hiển thị | Song ngữ / chỉ bản dịch / chỉ bản gốc |
| Cỡ chữ | 70% – 160% |
| Bảng transcript cạnh video | Bật/tắt bảng |
| Phím tắt theo câu | Bật/tắt `A` `D` `S` `Q` |
| Tự dừng sau mỗi câu | Chế độ luyện nghe |
| Giới hạn mỗi tháng | Ngân sách USD |

Thay đổi có hiệu lực ngay, không cần tải lại trang. Đổi model, ngôn ngữ hay key thì dịch lại; đổi cách hiển thị thì giữ bản dịch đã có.

## 9. Thông báo và xử lý lỗi

Khi chưa có bản dịch, dòng bản dịch trên video được dùng để báo trạng thái:

| Thông báo | Nghĩa | Extension làm gì |
|---|---|---|
| *đang dịch…* | Claude đang dịch đoạn này | Chờ, câu nào xong hiện câu đó |
| ⚠ … — sẽ thử lại | Lỗi tạm thời (mạng, quá tải) | Tự thử lại sau 15 giây |
| ⚠ Chưa có API key / key sai / hết credit | Lỗi cần bạn sửa | Dừng gọi API, tự chạy lại khi bạn sửa trong popup |
| ⚠ Đã chạm giới hạn ngân sách tháng | Chạm mức ngân sách | Ngừng dịch mới, tự chạy lại khi bạn tăng mức |

Nếu Claude trả về JSON hỏng, extension tự gọi lại một lần.

## 10. Bảo mật và quyền riêng tư

- **API key** chỉ lưu trong `chrome.storage.local` của trình duyệt và chỉ service worker của extension dùng. Trang YouTube không đọc được key.
- Extension chỉ gửi **nội dung phụ đề và tiêu đề video** tới `api.anthropic.com`. Không có máy chủ trung gian, không thu thập dữ liệu.
- Bản dịch và thống kê chi phí chỉ nằm trong trình duyệt của bạn.
- Mã nguồn mở, có unit test: https://github.com/AnCoder683/YT-Bilingual

## 11. Tóm tắt phím tắt

| Phím | Tác dụng | Ghi chú |
|---|---|---|
| `A` | Câu trước | Của extension |
| `D` | Câu sau | Của extension |
| `S` | Nghe lại câu | Của extension |
| `Q` | Thu gọn/mở bảng transcript; toàn màn hình: hiện/ẩn | Của extension |
| `c` | Bật/tắt phụ đề (CC) | Của YouTube, cần bật một lần để extension chạy |
| `K` / Space | Phát / dừng | Của YouTube |
| `t` | Chế độ rạp hát | Của YouTube |
| `f` | Toàn màn hình | Của YouTube |
