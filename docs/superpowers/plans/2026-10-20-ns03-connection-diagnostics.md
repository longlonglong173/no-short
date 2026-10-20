# NS-03 — Hướng dẫn và chẩn đoán kết nối

Phạm vi đã được yêu cầu trong BACKLOG NS-03; sửa và kiểm chứng trước bản Experimental.

- Đọc cấu hình hooks/status line an toàn, kiểm tra lệnh của app hiện tại, phân biệt không cấu hình, chờ dữ liệu và lỗi.
- Chỉ nhận trạng thái hoạt động từ log phiên, sự kiện hook hoặc bản ghi context hợp lệ; thời điểm lấy từ bản ghi.
- Hiển thị nguồn log và hooks riêng Codex/Claude; context Claude được chẩn đoán độc lập bộ lọc phiên.
- Trang hướng dẫn xuất hiện lần đầu, lưu việc đã xem, mở lại từ footer/Cài đặt; nội dung cuộn và ba ngôn ngữ.
- Giữ kết nối là thao tác chủ động. Chẩn đoán không ghi cấu hình bên thứ ba.
- Test hồi quy: cấu hình sai/thiếu/liên kết/lệnh cũ, hook chưa đủ, status line riêng, snapshot rỗng/cũ, thời điểm nhận và hướng dẫn lần đầu. Render dữ liệu mẫu ba ngôn ngữ, sáng/tối.
- Tạo PR riêng. Kiểm chứng app cài đặt và máy sạch được theo dõi ở NS-05.
