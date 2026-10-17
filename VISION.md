# YT Bilingual: lợi ích và hướng phát triển

## 1. App này giải quyết vấn đề gì

Xem video nước ngoài với phụ đề dịch tự động thường gặp mấy chuyện khó chịu: chữ dính vào nhau, câu bị cắt ngang, dịch từng mẩu rời rạc nên sai ngôi, sai giới tính, sai thì, và phụ đề tự động (ASR) nghe nhầm thì bản dịch cũng sai theo. YT Bilingual dùng một mô hình ngôn ngữ lớn (Claude) **đọc cả đoạn hội thoại** rồi mới dịch, nên bản dịch giống người làm phụ đề hơn là máy dịch từng câu.

## 2. Lợi ích chính

### Cho người xem
- **Hiểu đúng hơn.** Claude dịch có ngữ cảnh: biết video nói về gì (tiêu đề, tóm tắt các đoạn trước), ai đang nói với ai, tên riêng và thuật ngữ nào đã dùng. Kết quả là cách xưng hô (anh/em/tôi/bạn…) và thuật ngữ nhất quán từ đầu đến cuối video.
- **Dễ đọc hơn.** Phụ đề được chia lại thành câu trọn vẹn và ngắn (khoảng 1 dòng), hiện đúng lúc người nói nói câu đó. Phụ đề tự động được thêm dấu câu, viết hoa, và sửa những chỗ nghe nhầm rõ ràng.
- **Không phải chờ.** Câu nào dịch xong hiện ngay. Đoạn sắp xem được dịch trước. Xem lại hoặc tua thì lấy từ cache, hiện tức thì.
- **Song ngữ linh hoạt:** hiện cả hai dòng, chỉ bản dịch, hoặc chỉ bản gốc (đã chia câu, có dấu câu); chỉnh được cỡ chữ.

### Cho người học ngoại ngữ
- Đọc câu gốc **có dấu câu và chia câu đúng** ngay cạnh bản dịch tự nhiên. Dễ học hơn hẳn đọc phụ đề ASR liền một mạch.
- Dùng được theo cả hai chiều: video tiếng Anh thì dịch sang tiếng Việt, video tiếng Việt thì dịch sang tiếng Anh (hoặc ngôn ngữ khác).

### Về chi phí, quyền riêng tư và sự minh bạch
- **Rẻ:** với Haiku 5.5, khoảng $0,06 mỗi giờ video. Chỉ trả tiền cho phần thật sự xem, và không phải trả lại cho phần đã xem.
- **Dùng key của chính bạn,** không qua máy chủ trung gian nào. Phụ đề chỉ được gửi thẳng tới API chính thức của Anthropic.
- **Không dựa vào endpoint "chui":** một số extension khác gọi API nội bộ của trình duyệt, có thể bị chặn bất cứ lúc nào.
- **Mã nguồn mở và có test:** biết chính xác extension làm gì với dữ liệu của bạn.

### So với Immersive Translate (đã đo trên video thật)

| Vấn đề ở Immersive Translate | YT Bilingual |
|---|---|
| Dính chữ khi nối mảnh ASR (`cònhai`, `tớikhi`) | Nối mảnh đúng khoảng trắng |
| Cắt đoạn theo kích thước, cắt ngang câu | Claude chia theo câu và mệnh đề, mốc thời gian theo từng từ |
| Dịch từng mẩu, không có ngữ cảnh | Ngữ cảnh: tiêu đề, glossary, tóm tắt, câu trước |
| ASR nghe nhầm thì dịch sai theo | Claude suy ra ý thật và sửa chỗ nghe nhầm rõ ràng |
| Dùng endpoint không chính thức của Edge | API chính thức, key riêng |

## 3. Ý tưởng phát triển

Mỗi ý tưởng có ước lượng **giá trị** và **công sức** (Thấp / Vừa / Cao) để dễ chọn làm trước. ✅ là đã làm.

### 3.1 Học ngoại ngữ (giá trị cao nhất cho người học)

| Ý tưởng | Mô tả | Giá trị | Công sức |
|---|---|---|---|
| ✅ Phím tắt theo câu | `A`/`D` lùi hoặc tiến một câu, `S` lặp lại câu hiện tại, tự dừng sau mỗi câu | Cao | Thấp |
| ✅ Bấm vào từ để tra | Bấm một từ trong dòng gốc → nghĩa theo đúng ngữ cảnh câu (hỏi Claude), phiên âm | Cao | Vừa |
| ✅ Sổ từ vựng | Lưu từ hoặc câu kèm mốc thời gian video; xuất sang Anki/CSV | Cao | Vừa |
| Giải thích thành ngữ, tiếng lóng | Câu có idiom thì hiện biểu tượng 💡, rê chuột để xem giải thích | Vừa | Vừa |
| Chế độ luyện nghe | Ẩn dòng gốc, chỉ hiện khi bấm, hoặc hiện sau vài giây | Vừa | Thấp |

### 3.2 Bảng transcript và xuất file

| Ý tưởng | Mô tả | Giá trị | Công sức |
|---|---|---|---|
| ✅ Bảng transcript song ngữ | Panel bên cạnh video: toàn bộ câu gốc và câu dịch, tự cuộn theo video, bấm vào câu để tua, tìm kiếm được | Cao | Vừa |
| Xuất phụ đề | Tải về file `.srt`/`.vtt` song ngữ, hoặc Markdown để đọc lại | Vừa | Thấp |
| Tóm tắt và hỏi đáp video | Tóm tắt theo chương; hỏi Claude "đoạn này nói gì?" kèm mốc thời gian | Vừa | Vừa |

### 3.3 Chất lượng dịch

| Ý tưởng | Mô tả | Giá trị | Công sức |
|---|---|---|---|
| Glossary theo kênh | Nhớ tên riêng, thuật ngữ, cách xưng hô theo **kênh YouTube**, dùng lại cho video sau của cùng kênh | Cao | Vừa |
| Sửa bản dịch bằng tay | Bấm vào câu dịch để sửa; lưu vào cache và glossary để các đoạn sau học theo | Vừa | Vừa |
| Nhận diện người nói | Phân biệt người nói (phỏng vấn, podcast), giữ xưng hô đúng cho từng người | Vừa | Cao |
| Giọng dịch | Chọn kiểu: tự nhiên / sát nghĩa (cho người học) / trang trọng | Vừa | Thấp |
| Tự chọn model | Video kỹ thuật hoặc nhiều thuật ngữ dùng Sonnet, nói chuyện thường ngày dùng Haiku | Thấp | Vừa |

### 3.4 Chi phí và vận hành

| Ý tưởng | Mô tả | Giá trị | Công sức |
|---|---|---|---|
| ✅ Giới hạn ngân sách | Đặt mức tối đa mỗi tháng; gần chạm thì cảnh báo, chạm thì dừng | Cao | Thấp |
| Dịch trước cả playlist / "Xem sau" | Dịch nền bằng Message Batches API (rẻ hơn khoảng 50%) để xem là có ngay | Vừa | Vừa |
| Dọn cache tự động | Xóa bản dịch của video lâu không xem, giới hạn dung lượng | Thấp | Thấp |
| Đồng bộ cài đặt | Đồng bộ cài đặt (không gồm key) giữa các máy qua `chrome.storage.sync` | Thấp | Thấp |

### 3.5 Mở rộng nền tảng

| Ý tưởng | Mô tả | Giá trị | Công sức |
|---|---|---|---|
| Firefox | WXT build được cho Firefox; cần thử và chỉnh lại | Vừa | Thấp |
| Chrome Web Store | Đóng gói và phát hành để cài bằng một cú bấm, tự cập nhật | Cao | Vừa |
| Nền tảng khác | Coursera, Udemy, TED, Bilibili, Netflix: mỗi nơi lấy phụ đề một cách | Cao | Cao |
| Video không có phụ đề | Nhận dạng giọng nói (speech-to-text) từ âm thanh tab rồi dịch | Vừa | Cao |
| Giao diện đa ngôn ngữ | Popup có tiếng Anh, tiếng Việt… | Thấp | Thấp |

### 3.6 Xa hơn

- **Lồng tiếng (TTS):** đọc bản dịch bằng giọng tổng hợp, cho người không muốn đọc phụ đề.
- **Cache cộng đồng (tùy chọn):** video phổ biến chỉ cần dịch một lần rồi chia sẻ bản dịch. Cần máy chủ riêng và phải tính kỹ về quyền riêng tư và chi phí.
- **Provider khác:** OpenAI, Gemini, DeepL làm phương án dự phòng hoặc để so sánh.

## 4. Gợi ý thứ tự làm tiếp

1. ✅ **Phím tắt theo câu + giới hạn ngân sách:** đã xong.
2. ✅ **Bảng transcript song ngữ** (đã xong). Xuất file để sau, làm chung với sổ từ vựng / Anki.
3. ✅ **Bấm vào từ để tra + sổ từ vựng + xuất CSV cho Anki** (đã xong). Tiếp theo: glossary theo kênh, chế độ luyện nghe.
4. **Phát hành Chrome Web Store / Firefox:** khi đã dùng ổn định một thời gian.
