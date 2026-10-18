# Backlog cải thiện No Short Usage

Ngày tạo: 2026-10-19.

Trạng thái được ghi riêng ở từng task. Thực hiện P1 trước, P2 tiếp theo,
P3 để sau. Việc ghi nhận backlog không tự khởi chạy triển khai; chỉ thực hiện
task khi có yêu cầu của người dùng.

## P1 — Độ tin cậy và trải nghiệm bắt đầu

### NS-01 — Ưu tiên cảnh báo lỗi dữ liệu

- [x] **Trạng thái:** Hoàn thành local (2026-10-19)
- **Ưu tiên:** P1
- **Phụ thuộc:** Không.
- **Nội dung:** Tách thông báo kết nối thành công khỏi lỗi dữ liệu.
- **Tiêu chí nghiệm thu:** Thông báo thành công không che lỗi đọc log hoặc cảnh báo dữ liệu cũ. Kiểm tra trường hợp nhiều thông báo xuất hiện đồng thời.
- **Bằng chứng hoàn thành:** Đổi thứ tự hiển thị trong `UsagePopoverView.warning`: lỗi đọc dữ liệu → phiên không còn dữ liệu → dữ liệu cũ → thông báo kết nối. Giữ thông báo kết nối để hiển thị lại sau khi dữ liệu phục hồi và vẫn cho phép ẩn. Ba test hồi quy trong `PopoverRenderingTests.swift` đã thất bại trước bản sửa (4 assertion), rồi qua sau bản sửa. `npm run test:usage-menubar`: 71 test Swift và 4 test đóng gói qua; `npm test`: 33 test usage qua; `npm run validate` và `git diff --check` qua. Đã render ảnh minh họa trước/sau bằng giao diện SwiftUI với dữ liệu mẫu; đây không phải kiểm chứng giao diện app đang chạy. Chưa cài lại app hoặc phát hành. NS-02 trở đi chưa bắt đầu.

### NS-02 — Kiểm tra thư mục nguồn log

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P1
- **Phụ thuộc:** Không.
- **Nội dung:** Xác nhận cấu trúc `sessions` của Codex hoặc `projects` của Claude và quyền đọc trước khi lưu lựa chọn.
- **Tiêu chí nghiệm thu:** Khi nguồn không hợp lệ hoặc không đọc được, giữ nguồn hiện tại và giải thích cách chọn đúng. Kiểm tra thư mục hợp lệ, sai cấu trúc và thiếu quyền đọc cho cả hai provider.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-03 — Hướng dẫn lần đầu và chẩn đoán kết nối

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P1
- **Phụ thuộc:** NS-01, NS-02.
- **Nội dung:** Hiển thị trạng thái riêng cho nguồn log, hooks và context Claude; bổ sung hướng dẫn lần đầu.
- **Tiêu chí nghiệm thu:** Phân biệt chưa cấu hình, đã cấu hình nhưng chưa nhận dữ liệu, đang hoạt động và có lỗi. Có thời điểm nhận gần nhất khi có dữ liệu và hướng dẫn xử lý. Không coi việc cấu hình thành công là bằng chứng đã nhận sự kiện. Mọi kết nối vẫn do người dùng chủ động bật.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-04 — Thông tin phiên bản và cập nhật thủ công

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P1
- **Phụ thuộc:** Không.
- **Nội dung:** Thêm About, phiên bản/build, liên kết release notes và thao tác kiểm tra bản mới.
- **Tiêu chí nghiệm thu:** Hiển thị đúng phiên bản/build đang chạy; kiểm tra được trạng thái có bản mới, đã mới nhất và lỗi mạng. Không tự tải hoặc thay thế app; lỗi mạng không ảnh hưởng theo dõi usage.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-05 — Hoàn tất kiểm chứng phát hành

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P1
- **Phụ thuộc:** Không để bắt đầu kiểm chứng bản hiện tại; kiểm chứng lại artifact cuối cùng sau mọi thay đổi được đưa vào bản phát hành.
- **Nội dung:** Theo dõi riêng notarization, cài đặt trên máy sạch, Intel, hooks/context Claude thực tế, thông báo macOS, sleep/wake, login và VoiceOver.
- **Tiêu chí nghiệm thu:** Mỗi kiểm tra ghi phiên bản, môi trường, kết quả và bằng chứng. Thiếu thiết bị hoặc chứng chỉ được ghi là bị chặn, không đánh dấu đã đạt. Phân biệt bản build local với artifact phát hành được kiểm chứng. Không tự publish.
- **Bằng chứng hoàn thành:** Chưa có; khi thực hiện, đối chiếu checklist tại [release 0.4.2](releases/0.4.2.md) với trạng thái thực tế.

## P2 — Tính nhất quán và khả năng phân tích

### NS-06 — Đồng bộ khả năng giữa panel và app native

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Thêm bộ lọc provider cho panel khi nguồn Claude được cấu hình; thêm bảng chi phí theo model trong app native.
- **Tiêu chí nghiệm thu:** Ghi rõ nguồn và phạm vi tổng; số liệu theo provider/model khớp dữ liệu nguồn, giữ đúng trạng thái giá thiếu hoặc chưa biết. Giữ tương thích snapshot schema v1 và trường hợp chỉ có Codex.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-07 — Popover thích ứng màn hình

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Giới hạn chiều cao theo vùng hiển thị và cho phép cuộn khi cần.
- **Tiêu chí nghiệm thu:** Kiểm tra màn hình thấp, ba ngôn ngữ và nhiều cảnh báo. Nội dung và mọi nút vẫn truy cập được bằng chuột lẫn bàn phím; bố cục thích ứng khi cảnh báo xuất hiện hoặc biến mất.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-08 — Đo và tối ưu quét metadata

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Đo thời gian quét với lịch sử lớn, bổ sung cache theo file thay đổi.
- **Tiêu chí nghiệm thu:** Ghi số đo trước/sau trên cùng bộ dữ liệu và môi trường. Kiểm tra đổi tên, ghi thêm, xóa và chuyển nguồn; kết quả metadata sau tối ưu phải giữ nguyên, không trả dữ liệu cũ hoặc lẫn nguồn.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-09 — Mở rộng lịch sử

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-06 để thống nhất bộ lọc provider trên hai giao diện.
- **Nội dung:** Hỗ trợ 7 ngày, 30 ngày, tháng này, tháng trước và khoảng ngày tùy chọn trên cả hai giao diện.
- **Tiêu chí nghiệm thu:** Tổng và biểu đồ tuân theo khoảng ngày, provider, múi giờ và trạng thái thiếu giá. Kiểm tra ranh giới ngày/tháng, khoảng không có dữ liệu và khoảng ngày không hợp lệ. Không thay đổi ý nghĩa chi phí toàn phiên hoặc làm hỏng consumer schema v1.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-10 — Xuất CSV/JSON

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-09.
- **Nội dung:** Xuất thống kê theo khoảng ngày và provider, kèm múi giờ và trạng thái giá.
- **Tiêu chí nghiệm thu:** Dữ liệu xuất khớp bộ lọc và số liệu hiển thị. Mặc định không xuất tên/ID phiên; người dùng có thể bật rõ ràng. Không xuất nội dung hội thoại. Kiểm tra Unicode, ký tự đặc biệt trong CSV và dữ liệu thiếu giá.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-11 — Ngân sách chi phí ước tính

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-01, NS-06.
- **Nội dung:** Cho đặt ngưỡng ngày/tháng theo tổng hoặc provider, mặc định tắt.
- **Tiêu chí nghiệm thu:** Cảnh báo khi vượt ngưỡng, tránh gửi lặp và ghi rõ đây là chi phí API quy đổi. Thiếu giá không được hiển thị như ngân sách còn chính xác. Kiểm tra đổi ngày/tháng, đổi ngưỡng, khởi động lại, dữ liệu cũ và quyền thông báo bị từ chối.
- **Bằng chứng hoàn thành:** Chưa có.

### NS-12 — Quản lý dữ liệu và gỡ app

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Thêm thao tác xóa cache có xác nhận và hướng dẫn ngắt hooks/context/login.
- **Tiêu chí nghiệm thu:** Phân biệt dữ liệu dùng chung với plugin, bản sao cấu hình và log gốc. Xóa đúng phạm vi đã xác nhận, xử lý việc đọc/ghi đang diễn ra và lỗi quyền truy cập. Không xóa log Codex/Claude hoặc cấu hình bên thứ ba; hướng dẫn rõ dữ liệu nào còn lại sau khi gỡ app.
- **Bằng chứng hoàn thành:** Chưa có.

## P3 — Phân tích nâng cao

### NS-13 — Thống kê theo dự án và nhóm phiên cha–con

- [ ] **Trạng thái:** Chưa bắt đầu
- **Ưu tiên:** P3
- **Phụ thuộc:** Xác minh metadata thực tế và chốt thiết kế trước khi triển khai; phối hợp với NS-09 và NS-10 khi bổ sung bộ lọc hoặc xuất dữ liệu theo dự án.
- **Nội dung:** Khảo sát khả năng xác định dự án và quan hệ phiên cha–con từ metadata thực tế.
- **Tiêu chí nghiệm thu:** Chỉ nhóm khi có quan hệ đáng tin cậy; phiên không xác định được giữ riêng. Không cộng trùng, tổng khớp dữ liệu gốc và không xuất đường dẫn dự án mặc định. Thiết kế phải nêu rõ nguồn metadata, mức tin cậy và cách xử lý dữ liệu thiếu.
- **Bằng chứng hoàn thành:** Chưa có.

## Quy tắc chung

- Mỗi task lưu mức ưu tiên, trạng thái, phụ thuộc, tiêu chí nghiệm thu và bằng chứng khi hoàn thành.
- Giữ ba ngôn ngữ, xử lý local và phân biệt giá chưa biết với giá bằng 0.
- Chi phí là ước tính API quy đổi, không phải hóa đơn, credit hoặc quota thuê bao.
- Tách kết quả test local khỏi kiểm chứng trên app đang chạy, máy sạch và bản phát hành.
- Các mốc phụ thuộc chỉ mô tả thứ tự công việc, không cho phép tự khởi chạy task.
- Tạo backlog không bao gồm sửa chức năng, commit, push, phát hành hay khởi chạy các task.
