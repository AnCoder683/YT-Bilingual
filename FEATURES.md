# YT Bilingual: các chức năng

Tài liệu này mô tả từng chức năng của extension: nó làm gì, dùng thế nào và chạy ra sao. Cách cài đặt xem trong [README.md](README.md); lợi ích và hướng phát triển xem trong [VISION.md](VISION.md).

## Mục lục

1. [Phụ đề song ngữ trên video](#1-phụ-đề-song-ngữ-trên-video)
2. [Dịch bằng Claude có ngữ cảnh](#2-dịch-bằng-claude-có-ngữ-cảnh)
3. [Hiện dần và dịch trước](#3-hiện-dần-và-dịch-trước)
4. [Cache: xem lại không tốn tiền](#4-cache-xem-lại-không-tốn-tiền)
5. [Bảng transcript song ngữ](#5-bảng-transcript-song-ngữ)
6. [Tra từ và sổ từ vựng (Anki)](#6-tra-từ-và-sổ-từ-vựng-anki)
7. [Phím tắt theo câu và chế độ tự dừng](#7-phím-tắt-theo-câu-và-chế-độ-tự-dừng)
8. [Chi phí và giới hạn ngân sách](#8-chi-phí-và-giới-hạn-ngân-sách)
9. [Cài đặt trong popup](#9-cài-đặt-trong-popup)
10. [Thông báo và xử lý lỗi](#10-thông-báo-và-xử-lý-lỗi)
11. [Bảo mật và quyền riêng tư](#11-bảo-mật-và-quyền-riêng-tư)
12. [Tóm tắt phím tắt](#12-tóm-tắt-phím-tắt)

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

## 6. Tra từ và sổ từ vựng (Anki)

### Tra từ

| Ở đâu | Cách chọn |
|---|---|
| Phụ đề trên video | **Bấm** một từ của dòng câu gốc; **nhấn giữ rồi kéo** qua nhiều từ để chọn cụm ("burn out", "keep up with") |
| Bảng transcript | **Bôi đen** chữ trong câu gốc (kéo chuột, hoặc nhấp đúp vào một từ) rồi bấm nút **Tra** hiện ngay trên chữ |

- Video **tự dừng** và một ô hiện ra, giải nghĩa **theo đúng câu đang nghe** chứ không phải nghĩa chung chung của từ điển:
  - dạng gốc của từ (ví dụ "burned out" → "burn out"), phiên âm IPA, loại từ;
  - **nghĩa tiếng Việt** trong câu này;
  - **định nghĩa tiếng Anh** ngắn;
  - ghi chú cách dùng nếu có (tiếng lóng, văn phong, nghĩa khác hay gặp);
  - câu gốc với chữ đã chọn được in đậm.
- Nút **＋ Lưu vào sổ** và **↺ Nghe lại câu** (tua về đầu câu và phát).
- Đóng bằng `Esc`, nút ✕ hoặc bấm ra ngoài. Nếu chính extension đã dừng video thì video **tự phát tiếp**; nếu bạn dừng từ trước thì vẫn dừng.
- Chạy cả khi xem toàn màn hình.
- Chi phí khoảng **$0,0001 mỗi lần tra** với Haiku (1.000 lần ≈ $0,1). Tra lại cùng chữ trong cùng câu thì lấy từ cache, miễn phí. Giới hạn ngân sách tháng cũng áp dụng cho tra từ.
- Bấm vào chỗ trống trên video vẫn dừng/phát như bình thường; chỉ chữ của câu gốc mới bấm để tra được. Khi thanh điều khiển của YouTube hiện, phụ đề tự nâng lên ngay trên thanh để không bị che.

### Sổ từ vựng

Mở từ popup → **📒 Sổ từ vựng**. Mỗi mục gồm: từ, phiên âm, loại từ, nghĩa, định nghĩa, câu gốc (chữ đã chọn in đậm), bản dịch câu, và link **▶ mm:ss** mở đúng chỗ trong video.

- Tìm trong sổ (theo từ, nghĩa, câu), xóa từng mục hoặc xóa tất cả.
- Cùng một từ trong cùng một câu chỉ lưu một lần.
- Sổ nằm trong trình duyệt (`chrome.storage.local`), cập nhật ngay khi bạn lưu từ ở tab YouTube.

### Xuất file

Trong sổ từ vựng, bấm **Xuất file ▾**. Hộp xuất gồm:

- **Định dạng file** (danh sách thả xuống) và **Mẫu** của định dạng đó; mẫu nên dùng có nhãn *Nên dùng*.
- **Kèm theo**: phiên âm và loại từ, câu ví dụ và bản dịch, link video (mốc thời gian).
- **Phạm vi**: cả sổ, hoặc chỉ các từ đang hiện theo ô tìm kiếm.
- **Xem trước** đúng nội dung sẽ xuất, đổi ngay khi bạn đổi lựa chọn; tên file; nút **Tải xuống** (và **Chép** với các định dạng văn bản).
- Lựa chọn lần trước được nhớ lại.

| Định dạng | Mẫu | Dùng để |
|---|---|---|
| **Excel** `.xlsx` | **Bảng đầy đủ** (mọi cột) · **Bảng ôn nhanh** (Từ · Nghĩa · Câu) · **Theo video** (mỗi video một trang tính) | Lọc, sắp xếp, tô màu; dòng tiêu đề cố định, có bộ lọc; ô Video bấm mở đúng chỗ |
| **Word** `.docx` | **Sổ tay từ vựng** · **Bài tập điền từ** (câu bị che chữ đã tra, đáp án ở trang cuối) · **Gập đôi tự kiểm tra** (bảng Từ │ Nghĩa, gập giấy để che) | Sửa tiếp trong Word / Google Docs, in ra học |
| **PDF** | Ba mẫu như Word | Bấm **In / Lưu PDF** → hộp thoại in → *Lưu dưới dạng PDF* (khổ A4) |
| **Anki** `.txt` | **Điền chỗ trống (Cloze)**: câu thật bị che đúng chữ đã tra, gợi ý là nghĩa · **Cơ bản**: từ + câu → nghĩa · **Hai chiều**: thêm thẻ nghĩa → từ | Anki: **File → Import**. Header trong file tự chọn kiểu thẻ, HTML và tag `yt-bilingual` (Anki 2.1.55+) |
| **Quizlet** `.txt` | **Từ ↔ Nghĩa** · **Câu ↔ Bản dịch** | Quizlet: Tạo học phần → **Nhập** → dán (giữa thuật ngữ và định nghĩa: Tab; giữa các thẻ: Dòng mới) |
| **Markdown** `.md` | **Bảng** · **Ghi chú theo video** | Dán vào Notion / Obsidian |
| **CSV** `.csv` | **Tất cả các cột** | Dữ liệu thô cho ứng dụng khác; có BOM nên Excel mở đúng tiếng Việt |

Không xuất được âm thanh câu nói (extension không ghi âm từ YouTube); thay vào đó các mẫu đều có link **▶ mm:ss** mở đúng chỗ trong video.

## 7. Phím tắt theo câu và chế độ tự dừng

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

## 8. Chi phí và giới hạn ngân sách

- Popup hiện **chi phí tháng này** và **tổng chi phí**, tính theo số token thật API trả về.
- Tham khảo: Haiku 5.5 tốn khoảng **$0,06 cho mỗi giờ video**. Sonnet 5.5 đắt hơn khoảng 20 lần.
- Số chính xác xem ở platform.claude.com → Chi phí (cập nhật trễ vài giờ).

**Giới hạn mỗi tháng** (USD, `0` = không giới hạn):

- Có thanh tiến độ trong popup; từ **80%** thì chuyển màu cảnh báo.
- Khi **chạm mức**, extension ngừng gọi API và hiện cảnh báo trên video. **Bản dịch đã có trong cache vẫn xem bình thường.**
- Tăng giới hạn thì extension tự dịch tiếp, không cần tải lại trang.
- Các đoạn đang dịch dở vẫn chạy cho xong, nên có thể vượt mức một chút.

## 9. Cài đặt trong popup

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
| 📒 Sổ từ vựng | Mở trang sổ từ vựng (xem, tìm, xóa, xuất file) |

Thay đổi có hiệu lực ngay, không cần tải lại trang. Đổi model, ngôn ngữ hay key thì dịch lại; đổi cách hiển thị thì giữ bản dịch đã có.

## 10. Thông báo và xử lý lỗi

Khi chưa có bản dịch, dòng bản dịch trên video được dùng để báo trạng thái:

| Thông báo | Nghĩa | Extension làm gì |
|---|---|---|
| *đang dịch…* | Claude đang dịch đoạn này | Chờ, câu nào xong hiện câu đó |
| ⚠ … — sẽ thử lại | Lỗi tạm thời (mạng, quá tải) | Tự thử lại sau 15 giây |
| ⚠ Chưa có API key / key sai / hết credit | Lỗi cần bạn sửa | Dừng gọi API, tự chạy lại khi bạn sửa trong popup |
| ⚠ Đã chạm giới hạn ngân sách tháng | Chạm mức ngân sách | Ngừng dịch mới, tự chạy lại khi bạn tăng mức |

Nếu Claude trả về JSON hỏng, extension tự gọi lại một lần.

## 11. Bảo mật và quyền riêng tư

- **API key** chỉ lưu trong `chrome.storage.local` của trình duyệt và chỉ service worker của extension dùng. Trang YouTube không đọc được key.
- Extension chỉ gửi **nội dung phụ đề và tiêu đề video** (và chữ bạn chọn để tra) tới `api.anthropic.com`. Không có máy chủ trung gian, không thu thập dữ liệu.
- Bản dịch, sổ từ vựng và thống kê chi phí chỉ nằm trong trình duyệt của bạn.
- Mã nguồn mở, có unit test: https://github.com/AnCoder683/YT-Bilingual

## 12. Tóm tắt phím tắt

| Phím | Tác dụng | Ghi chú |
|---|---|---|
| `A` | Câu trước | Của extension |
| `D` | Câu sau | Của extension |
| `S` | Nghe lại câu | Của extension |
| `Q` | Thu gọn/mở bảng transcript; toàn màn hình: hiện/ẩn | Của extension |
| `Esc` | Đóng ô tra từ (video phát tiếp nếu extension đã dừng nó) | Của extension |
| `c` | Bật/tắt phụ đề (CC) | Của YouTube, cần bật một lần để extension chạy |
| `K` / Space | Phát / dừng | Của YouTube |
| `t` | Chế độ rạp hát | Của YouTube |
| `f` | Toàn màn hình | Của YouTube |
