# No Short Usage — ứng dụng menu bar macOS

Ngày: 2026-10-18. Trạng thái: đã triển khai bản local và review; xem bảng kiểm chứng và các mục nghiệm thu thủ công còn lại trong docs/no-short-usage-menubar.md.

## Mục tiêu và phạm vi đã thống nhất

Người dùng muốn xem Usage trên thanh menu macOS, kể cả khi panel Codex đã đóng. Người dùng đã đồng ý hướng ứng dụng nhỏ cài riêng bằng Swift/AppKit, dùng lại bộ đọc dữ liệu của plugin.

Bản đầu hiển thị chi phí ước tính hôm nay trên thanh menu; bấm để xem token, chi phí hôm nay/tháng này và phiên chính gần nhất. Có cập nhật nền, làm mới thủ công, trạng thái dữ liệu cũ/lỗi, tùy chọn mở cùng macOS và thoát ứng dụng.

Các khoản tiền là USD ước tính tương đương API, không phải hóa đơn ChatGPT, số dư hay hạn mức tài khoản. Không thêm đồng bộ đám mây, biểu đồ, tự cập nhật ứng dụng, thay đổi MCP tools hoặc chức năng ghim phiên trong panel.

## Hiện trạng mã nguồn

- `packages/usage/src/main.ts` đã có chế độ `--snapshot` xuất JSON `UsageSnapshot` phiên bản 1 rồi kết thúc.
- `createUsageService` dùng `CODEX_HOME` hoặc `~/.codex`, múi giờ hệ thống và cache có TTL 15 giây.
- `SnapshotStore` đã có khóa liên tiến trình, ghi snapshot nguyên tử và giữ dữ liệu cũ khi đọc báo cáo thất bại.
- Runtime đã bao gồm executable `no-short-usage` và `ccusage` cho arm64/x86_64. Người dùng không cần cài Node/Bun.
- Chưa có app bundle hoặc giao diện menu bar. Working tree hiện có thay đổi của tính năng Usage; không hoàn nguyên hoặc gom các thay đổi đó vào commit đặc tả này.

## Lựa chọn kiến trúc

Chọn ứng dụng Swift/AppKit dùng `NSStatusItem` và menu native. So với Electron/Tauri, cách này dùng framework hệ thống và không thêm web runtime cho giao diện nhỏ. Không dùng ứng dụng chỉ đọc file cache: khi Codex đóng, cache sẽ không có tác nhân làm mới.

Mã Swift nằm trong `packages/usage-menubar/`, dùng Swift Package Manager, deployment target macOS 14. Ứng dụng dùng `LSUIElement` để hiện trên thanh menu và không chiếm biểu tượng Dock. Một app bundle chứa đủ runtime đi kèm và có thể chạy độc lập với việc cài plugin.

Các thành phần:

1. Model Codable đọc snapshot v1; logic trình bày chi phí, trạng thái và chọn phiên độc lập với AppKit.
2. Snapshot client gọi executable đã đóng gói bằng `Process`, truyền trực tiếp đối số `--snapshot`, đọc stdout/stderr bất đồng bộ và kiểm tra kết quả.
3. Refresh controller bảo đảm chỉ có một lần đọc đang chạy, quản lý lịch cập nhật, sleep/wake và dữ liệu thành công gần nhất.
4. App delegate giữ status item/menu, cập nhật giao diện trên main thread và quản lý login item.

Không khởi động MCP server từ ứng dụng menu bar, không mở HTTP server và không gọi shell để ghép câu lệnh.

## Luồng dữ liệu và cập nhật

App gọi `Contents/Resources/runtime/no-short-usage --snapshot`; `ccusage` nằm cùng thư mục với executable này để giữ đúng cơ chế tìm runtime hiện có. App chỉ dùng helper trong bundle của mình, không tìm executable qua PATH hoặc thư mục cache của plugin.

Làm mới ngay khi khởi động, sau đó mỗi 15 giây khi máy thức; mở menu hoặc bấm “Làm mới” yêu cầu cập nhật nếu không có tác vụ đang chạy. Cache TTL và khóa hiện tại cho phép panel Codex và app dùng chung dữ liệu khi cùng nguồn log/múi giờ. Yêu cầu thủ công vẫn tôn trọng TTL, không xóa cache hoặc ép chạy hai báo cáo song song.

Mỗi lần đọc có giới hạn 90 giây; khi quá hạn, hủy helper và các tiến trình báo cáo thuộc lần đọc đó, thu hồi pipe và báo lỗi. Việc hủy phải được kiểm chứng bằng ca kiểm thử timeout để không để lại tiến trình ccusage. Output được thu nhận với giới hạn dung lượng rõ ràng trong triển khai; vượt giới hạn được xử lý như dữ liệu không hợp lệ, không làm treo app.

Khi máy sleep, dừng lịch và hủy lần đọc đang chạy; khi wake, làm mới ngay rồi tiếp tục lịch. Thoát app hủy tác vụ và lịch; không cài daemon hoặc LaunchAgent riêng. Việc mở app lần nữa chỉ kích hoạt instance hiện có.

Mặc định dùng `~/.codex`. Nếu app kế thừa `CODEX_HOME`, helper tiếp tục dùng nguồn đó. Có mục “Chọn thư mục log…” để người dùng chọn một Codex home qua file picker, lưu lựa chọn bằng UserDefaults và truyền qua environment của child process; “Dùng thư mục mặc định” xóa lựa chọn. Điều này giúp app mở từ Finder dùng được nguồn tùy chỉnh mà không phụ thuộc shell. Không ghi đè cấu hình của plugin; menu cho biết nguồn log đang dùng. Hỗ trợ chọn nhiều nguồn qua giao diện nằm ngoài bản đầu.

## Giao diện và trạng thái

Thanh menu mặc định là `NS $2.35`, dùng hôm nay theo múi giờ của snapshot. Khi chưa có dữ liệu hiển thị `NS …`; không đọc được giá hiển thị `NS —`; chi phí một phần hiển thị `NS ≥$2.35`. Dữ liệu cũ thêm ký hiệu cảnh báo và tooltip giải thích. Không chuyển giá không xác định thành 0.

Menu gồm:

- Tiêu đề No Short Usage; nhãn “Ước tính tương đương API · USD”.
- Hôm nay: tiền và token input/output/cache read/cache write.
- Tháng này: tiền và tổng token.
- Phiên chính gần nhất: tiêu đề, tiền và tổng token; không nhận diện tab Codex đang focus và không cộng subagent vào phiên cha. Chọn theo cùng quy tắc trong adapter hiện có; nếu không có phiên phù hợp, hiển thị trạng thái trống.
- Thời điểm cập nhật, nguồn log và thông báo dữ liệu cũ/lỗi nếu có.
- Làm mới; chọn nguồn log; mở cùng macOS; thoát.

Token và chi phí đầy đủ có trong tooltip hoặc dòng menu dễ đọc; tên phiên dài được rút gọn trên menu và giữ đầy đủ trong tooltip. Dùng màu hệ thống, hỗ trợ light/dark, nhãn truy cập và điều hướng bàn phím của menu native.

Snapshot `ready`/`empty`/`stale`/`error` và giá `estimated`/`partial`/`unknown` được xử lý riêng. Nếu helper lỗi, JSON sai hoặc schema không được hỗ trợ: giữ snapshot thành công gần nhất, đánh dấu cũ và hiển thị lỗi ngắn; nếu chưa từng có snapshot thì hiển thị không khả dụng. Không đưa stderr thô, đường dẫn riêng tư hoặc stack trace vào thông báo lỗi chung.

## Mở cùng macOS và quyền riêng tư

Mở cùng macOS mặc định tắt. Dùng `SMAppService.mainApp`, chỉ đăng ký khi người dùng bật. Đọc trạng thái thực từ hệ thống; nếu cần phê duyệt, hiển thị trạng thái và nút mở cài đặt Login Items. Đăng ký thất bại phải hiện lỗi, không giả vờ đã bật. Tắt tùy chọn sẽ hủy đăng ký; thoát app không tự thay đổi tùy chọn này.

App không đọc cookies/tokens, không sửa log Codex và không gửi nội dung phiên ra mạng. Helper vẫn có thể tải bảng giá công khai theo chính sách cache hiện tại. Không thêm telemetry. Dữ liệu snapshot và tên phiên tiếp tục tuân theo tài liệu quyền riêng tư của Usage.

## Build, đóng gói và phân phối

Thêm lệnh build/test/package riêng cho menu bar ở package gốc. Build Swift cho arm64 và x86_64, tạo app bundle riêng cho từng kiến trúc với đúng cặp runtime đã được build/kiểm tra checksum. Không trộn runtime hai phiên bản và không phụ thuộc đường dẫn checkout trên máy người phát triển.

Artifact local nằm dưới `.artifacts/usage-menubar/`, cung cấp ZIP chứa `No Short Usage.app` và hướng dẫn chép vào Applications. Plugin ZIP hiện tại tiếp tục có cấu trúc riêng; ứng dụng menu bar là artifact tùy chọn. Không tự cài app hoặc tự bật login item trong bước build.

Ký helper trước, ký app sau và kiểm tra chữ ký toàn bundle. Nếu có Developer ID đã cấu hình, dùng danh tính đó; nếu không, build phát triển dùng ad-hoc signing và ghi rõ chưa notarized. Không tuyên bố Gatekeeper/notarization thành công từ việc build hoặc ký ad-hoc. Không tự publish, tạo release hoặc thay đổi plugin đang cài.

## Kiểm thử và tiêu chí hoàn tất

- Swift unit tests: decode snapshot thực tế/fixture, schema sai, chọn phiên, định dạng tiền/token, giá một phần/không xác định, stale/error/empty và giữ dữ liệu cũ.
- Process tests với helper giả: thành công, exit khác 0, JSON hỏng, output vượt giới hạn, timeout/hủy và dọn tiến trình; kiểm tra không có lần đọc chồng nhau.
- Chạy các kiểm tra Usage hiện có để bảo đảm app không làm hỏng panel/runtime; kiểm tra `--snapshot` thật và cache khi panel/app cùng đọc.
- Build/codesign cả hai kiến trúc; chỉ ghi nhận chạy thực tế cho kiến trúc đã chạy. Kiểm tra bundle không chứa symlink/đường dẫn quay lại checkout và runtime không cần Node/Bun trên PATH.
- Trên máy hiện tại, mở app thật và kiểm tra status item, menu, dữ liệu log thật, refresh, thoát và mở lại, kể cả khi panel Codex đóng. Nếu không có công cụ quan sát tương ứng, ghi rõ phần nào cần người dùng xác nhận.
- Kiểm tra login item từ bundle đã đặt ở vị trí ổn định, trạng thái trong hệ thống, bật/tắt và việc dọn cấu hình thử nghiệm. Không đánh dấu đăng nhập lại, sleep/wake thực, Intel vật lý hoặc máy sạch là đã kiểm chứng nếu chưa thực hiện.

## Tài liệu Apple

- NSStatusItem: https://developer.apple.com/documentation/appkit/nsstatusitem
- SMAppService.mainApp: https://developer.apple.com/documentation/servicemanagement/smappservice/mainapp
- Đăng ký dịch vụ: https://developer.apple.com/documentation/servicemanagement/smappservice/register()
