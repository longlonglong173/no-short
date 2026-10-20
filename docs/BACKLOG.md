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
- **Bằng chứng hoàn thành:** Đổi thứ tự hiển thị trong `UsagePopoverView.warning`: lỗi đọc dữ liệu → phiên không còn dữ liệu → dữ liệu cũ → thông báo kết nối. Giữ thông báo kết nối để hiển thị lại sau khi dữ liệu phục hồi và vẫn cho phép ẩn. Ba test hồi quy trong `PopoverRenderingTests.swift` đã thất bại trước bản sửa (4 assertion), rồi qua sau bản sửa. `npm run test:usage-menubar`: 71 test Swift và 4 test đóng gói qua; `npm test`: 33 test usage qua; `npm run validate` và `git diff --check` qua. Đã render ảnh minh họa trước/sau bằng giao diện SwiftUI với dữ liệu mẫu; đây không phải kiểm chứng giao diện app đang chạy. Chưa cài lại app hoặc phát hành. Đã merge qua PR #18; các task khác theo trạng thái riêng bên dưới.

### NS-02 — Kiểm tra thư mục nguồn log

- [x] **Trạng thái:** Hoàn thành local (2026-10-19)
- **Ưu tiên:** P1
- **Phụ thuộc:** Không.
- **Nội dung:** Xác nhận cấu trúc `sessions` của Codex hoặc `projects` của Claude và quyền đọc trước khi lưu lựa chọn.
- **Tiêu chí nghiệm thu:** Khi nguồn không hợp lệ hoặc không đọc được, giữ nguồn hiện tại và giải thích cách chọn đúng. Kiểm tra thư mục hợp lệ, sai cấu trúc và thiếu quyền đọc cho cả hai provider.
- **Bằng chứng hoàn thành:** `LogSourceStore` kiểm tra thư mục home và thư mục con `sessions`/`projects` đúng provider, quyền đọc/truy cập và khả năng liệt kê trước khi ghi lựa chọn. Chọn sai giữ nguyên nguồn; app hiển thị hướng dẫn bằng ba ngôn ngữ và không khởi động lại bộ đọc khi bị từ chối. Thư mục log rỗng hợp lệ; reset và nguồn kế thừa không thay đổi. Test hồi quy đã tái hiện việc nguồn không hợp lệ bị lưu trước bản sửa, rồi qua sau bản sửa. `npm run test:usage-menubar`: 75 test Swift (gồm 6 test nguồn log, kiểm tra quyền POSIX thực tế, không skip) và 4 test đóng gói qua. `npm test`: 33 test usage qua; `npm run validate` và `git diff --check` qua. Chưa kiểm chứng hộp chọn thư mục trên app đang chạy, chưa cài lại app hoặc phát hành. Các task tiếp theo theo trạng thái riêng bên dưới.

- [x] **Mở rộng NS-02 — Nhiều thư mục mỗi provider (2026-10-19):** Cửa sổ danh sách cho phép thêm nhiều thư mục, bỏ từng nguồn, hiển thị lỗi từng dòng và chỉ lưu toàn bộ danh sách hợp lệ. Hủy không ghi cấu hình. Lưu danh sách riêng Codex/Claude, đọc cấu hình một nguồn cũ, loại đường dẫn trùng và symlink cùng nguồn; reset chỉ tác động provider tương ứng. `npm run test:usage-menubar`: 79 test Swift và 4 test đóng gói qua. `npm test`: 34 test usage qua, gồm test chạy ccusage thật với phiên riêng và bản sao Codex/Claude trên hai nguồn. Typecheck, validation và diff check qua. Đã render vùng danh sách bằng dữ liệu mẫu ở ba ngôn ngữ; chưa kiểm chứng thao tác cửa sổ modal trên app đang chạy hoặc cài lại app.

### NS-03 — Hướng dẫn lần đầu và chẩn đoán kết nối

- [x] **Trạng thái:** Hoàn thành local (2026-10-20)
- **Ưu tiên:** P1
- **Phụ thuộc:** NS-01, NS-02.
- **Nội dung:** Hiển thị trạng thái riêng cho nguồn log, hooks và context Claude; bổ sung hướng dẫn lần đầu.
- **Tiêu chí nghiệm thu:** Phân biệt chưa cấu hình, đã cấu hình nhưng chưa nhận dữ liệu, đang hoạt động và có lỗi. Có thời điểm nhận gần nhất khi có dữ liệu và hướng dẫn xử lý. Không coi việc cấu hình thành công là bằng chứng đã nhận sự kiện. Mọi kết nối vẫn do người dùng chủ động bật.
- **Bằng chứng hoàn thành:** Trang hướng dẫn lần đầu và chẩn đoán riêng nguồn log/hooks theo provider cùng context Claude Code, có thời điểm dữ liệu thực tế và hướng dẫn xử lý. Kiểm tra cấu hình chỉ đọc, đối chiếu đúng lệnh app hiện tại và đủ các hook; cấu hình thành công chỉ là chờ dữ liệu. Đọc context Claude độc lập bộ lọc phiên, không lấy thời điểm render làm thời điểm nhận. Giữ các thao tác kết nối do người dùng chọn và giữ status line riêng. `npm run test:usage-menubar`: 89 test Swift và 4 test đóng gói qua; 34 test Usage qua. Render EN/VI/简体中文 sáng/tối bằng dữ liệu mẫu. Validation cấu hình nguồn và diff check qua; checksum runtime được kiểm tra lại khi build release. Chưa kiểm chứng thao tác trên app cài đặt, nhận sự kiện Claude thực tế hoặc máy sạch.

### NS-04 — Thông tin phiên bản và cập nhật thủ công

- [x] **Trạng thái:** Hoàn thành local (2026-10-20)
- **Ưu tiên:** P1
- **Phụ thuộc:** Không.
- **Nội dung:** Thêm About, phiên bản/build, liên kết release notes và thao tác kiểm tra bản mới.
- **Tiêu chí nghiệm thu:** Hiển thị đúng phiên bản/build đang chạy; kiểm tra được trạng thái có bản mới, đã mới nhất và lỗi mạng. Không tự tải hoặc thay thế app; lỗi mạng không ảnh hưởng theo dõi usage.
- **Bằng chứng hoàn thành:** About đọc `CFBundleShortVersionString`/`CFBundleVersion` từ bundle đang chạy, không dùng hằng số phiên bản phát hành; có liên kết trang tag release notes. Menu trong popover và menu chuột phải đều có About, kiểm tra bản mới và release notes. AppDelegate giữ cửa sổ About riêng và mở sau khi đóng popover. Chỉ thao tác kiểm tra chủ động mới gọi GitHub latest release qua `URLSession` ephemeral, không auth/cookie/cache/credential storage; không có tải hoặc thay thế app. Trạng thái riêng gồm chưa kiểm tra, đang kiểm tra, có bản mới, không có bản mới hơn và lỗi; không dùng hoặc ghi đè `isLoading`/`notice`/`connectionNotice` của usage. Ba ngôn ngữ EN/VI/简体中文 đầy đủ. Test SemVer bao gồm mới hơn, bằng, cũ hơn, không hợp lệ, prerelease/build metadata và số lớn; stub tại ranh giới URLSession kiểm tra HTTP 503/403, JSON/tag/link không hợp lệ, draft và offline; kiểm tra retry, chống request trùng, mở About/đổi ngôn ngữ không gọi mạng và giữ nguyên cảnh báo usage. `swift test --package-path /Users/long/.codex/worktrees/ns04-release-ready/no-short/packages/usage-menubar` đã kết thúc exit 0: **92 test, 0 lỗi** (Swift 6.4, macOS arm64); 4 test đóng gói, `npm run validate` và `git diff --check` qua. Đã render 8 trạng thái About bằng dữ liệu mẫu ở 3 ngôn ngữ và kiểm tra ảnh; đây không phải nghiệm thu thao tác trên app đã cài. Probe local dùng client URLSession thật trả `v0.4.2`, đúng trang tag và trạng thái không có bản mới hơn cho app `0.4.2`.
- **Giới hạn / tích hợp:** Chỉ so sánh phiên bản latest release; không phát hiện asset thử nghiệm được thay mới dưới cùng `v0.4.2`. Không cần release manifest. Parent sẽ cherry-pick NS-04 cùng NS-03, tự bump/build/phát hành `v0.4.3` và runtime MCP tương ứng nếu cần; nhánh này không đổi version, không push/PR/upload/phát hành. Chưa kiểm chứng cài đặt app, thao tác dismiss/focus/VoiceOver trên artifact tích hợp, Intel, signing hoặc notarization. Khi GitHub latest đã trỏ tới `v0.4.3`, app `0.4.2` sẽ báo bản mới; app `0.4.3` sẽ báo không có bản mới hơn.

### NS-05 — Hoàn tất kiểm chứng phát hành

- [ ] **Trạng thái:** Đang thực hiện — bản Experimental 0.5.0 (2026-10-21)
- **Ưu tiên:** P1
- **Phụ thuộc:** Không để bắt đầu kiểm chứng bản hiện tại; kiểm chứng lại artifact cuối cùng sau mọi thay đổi được đưa vào bản phát hành.
- **Nội dung:** Theo dõi riêng notarization, cài đặt trên máy sạch, Intel, hooks/context Claude thực tế, thông báo macOS, sleep/wake, login và VoiceOver.
- **Tiêu chí nghiệm thu:** Mỗi kiểm tra ghi phiên bản, môi trường, kết quả và bằng chứng. Thiếu thiết bị hoặc chứng chỉ được ghi là bị chặn, không đánh dấu đã đạt. Phân biệt bản build local với artifact phát hành được kiểm chứng. Không tự publish.
- **Bằng chứng hiện có:** 102 test Swift tích hợp, 4 test đóng gói và 34 test Usage; build/provenance/signature/smoke cùng artifact được ghi tại [release 0.4.3](releases/0.4.3.md) và `release-validation.json`. Notarization, máy sạch, Intel runtime, hooks/context thực tế, thông báo, sleep/wake, login và VoiceOver chưa được đánh dấu đạt. PR riêng theo dõi phần chuẩn bị Experimental; task chưa hoàn tất.

### NS-14 — Cập nhật trong app có xác nhận

- [ ] **Trạng thái:** Thiết kế đã duyệt — chờ duyệt kế hoạch và chọn cách thực thi (2026-10-21).
- **Ưu tiên:** P1 — chuỗi tin cậy khi cài executable.
- **Phụ thuộc:** Chốt thiết kế/key/feed; giữ NS-05 signing và nghiệm thu thiết bị riêng.
- **Nội dung:** Sparkle kiểm tra/tải/xác minh/cài/relaunch khi người dùng yêu cầu; không cài nền. Cần một lần cài tay bản bootstrap sau 0.5.0.
- **Tiêu chí nghiệm thu:** Archive/feed được ký; không cài khi xác minh lỗi; cancel/error giữ bản cũ; chờ reader/maintenance trước terminate; dữ liệu/cấu hình không bị xóa. Test A→B trên app copies và test key/feed cô lập, không đụng app thật. Có PR riêng, không tự merge/phát hành.
- **Thiết kế:** [NS-14 signed in-app updates](superpowers/specs/2026-10-21-ns14-signed-in-app-updates-design.md).
- **Kế hoạch:** [NS-14 implementation](superpowers/plans/2026-10-21-ns14-signed-in-app-updates.md) — chưa bắt đầu code.
- **Bằng chứng hoàn thành:** Chưa triển khai code; chỉ khảo sát và thiết kế. Bản 0.5.0 công khai vẫn chỉ kiểm tra cập nhật thủ công.

## P2 — Tính nhất quán và khả năng phân tích

### NS-06 — Đồng bộ khả năng giữa panel và app native

- [x] **Trạng thái:** Hoàn thành local (2026-10-20) — chưa phát hành
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Thêm bộ lọc provider cho panel khi nguồn Claude được cấu hình; thêm bảng chi phí theo model trong app native.
- **Tiêu chí nghiệm thu:** Ghi rõ nguồn và phạm vi tổng; số liệu theo provider/model khớp dữ liệu nguồn, giữ đúng trạng thái giá thiếu hoặc chưa biết. Giữ tương thích snapshot schema v1 và trường hợp chỉ có Codex.
- **Bằng chứng hoàn thành:** 38 test Usage, 23 test Playwright, 114 test Swift và 4 test đóng gói đều đạt; typecheck, validate, build panel, build native arm64/x64 và smoke/provenance/signature đều đạt local. Bộ lọc dùng đúng breakdown provider, giữ ghim/cấu hình host khôi phục muộn, không phát lại tool metadata cũ; bảng model native có cuộn và phân biệt toàn phiên với tổng hôm nay. Đã kiểm tra render giả lập EN/VI/zh, sáng/tối và bảng dài. Schema v1 chỉ Codex và trường hợp thiếu breakdown được kiểm tra riêng. Review không còn P1/P2. Chưa kiểm chứng thao tác trên app cài đặt/host Codex thực tế hoặc Intel runtime; không thay đổi download v0.4.3 và không tự publish. Xem [panel](no-short-usage.md#provider-filters-ns-06-source-not-yet-in-v043-downloads) và [native](no-short-usage-menubar.md#costs-by-model-ns-06-source-not-yet-in-v043-downloads).

### NS-07 — Popover thích ứng màn hình

- [x] **Trạng thái:** Hoàn thành local (2026-10-20) — chưa phát hành
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Giới hạn chiều cao theo vùng hiển thị và cho phép cuộn khi cần.
- **Tiêu chí nghiệm thu:** Kiểm tra màn hình thấp, ba ngôn ngữ và nhiều cảnh báo. Nội dung và mọi nút vẫn truy cập được bằng chuột lẫn bàn phím; bố cục thích ứng khi cảnh báo xuất hiện hoặc biến mất.
- **Bằng chứng hoàn thành:** Viewport giới hạn theo vùng màn hình dưới status item, nội dung cuộn theo chiều cao tự nhiên; resize theo thay đổi cảnh báo/ngôn ngữ và màn hình. Home/End/Page Up/Page Down đi tới toàn nội dung. Test hồi quy đã thất bại vì dashboard không có viewport cuộn trước bản sửa. 120 test Swift, 4 test đóng gói, 38 test Usage và validation qua. Render giả lập các trạng thái hiện có qua; chưa nghiệm thu click/VoiceOver trên app cài đặt hoặc màn hình vật lý phụ. Không phát hành.

### NS-08 — Đo và tối ưu quét metadata

- [x] **Trạng thái:** Hoàn thành local (2026-10-21) — chưa phát hành
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Đo thời gian quét với lịch sử lớn, bổ sung cache theo file thay đổi.
- **Phát hiện cần khảo sát:** Trong fixture nhiều nguồn, ccusage 20.0.34 có thể gộp sự kiện của hai phiên Codex khác nhau nếu timestamp và số token hoàn toàn giống nhau: hai phiên đều có 110 token nhưng tổng ngày chỉ 110. Fixture với thời điểm riêng cho mỗi phiên và bản sao giữ nguyên timestamp trả đúng tổng 220. Đây là giới hạn quan sát được của bộ đọc hiện tại, chưa được sửa trong phần chọn nhiều nguồn; cần giữ thành ca điều tra riêng khi đánh giá độ tin cậy tổng ngày.
- **Tiêu chí nghiệm thu:** Ghi số đo trước/sau trên cùng bộ dữ liệu và môi trường. Kiểm tra đổi tên, ghi thêm, xóa và chuyển nguồn; kết quả metadata sau tối ưu phải giữ nguyên, không trả dữ liệu cũ hoặc lẫn nguồn.
- **Bằng chứng hoàn thành:** Cache metadata riêng mỗi file bằng device/inode/size/mtime/ctime; liệt kê/stat lại, đọc lại title index, bỏ file xóa/đổi nguồn, ghi atomic và giới hạn cache. Test append/rename/delete/nguồn mới/cache hỏng/symlink qua. Benchmark synthetic cùng 240 file × 501 dòng trên macOS arm64: bản trước 103.82 ms; cache lạnh 67.06 ms, cache ấm 7.58 ms, 240 hit/0 đọc nội dung, kết quả không đổi. Đây là số đo metadata, không phải tốc độ toàn bộ ccusage. 43 test Usage và 23 test browser qua, typecheck/validate/diff check qua. Test CLI thật tái hiện va chạm timestamp/token (110 thay vì 220), thay timestamp trả 220; giới hạn upstream vẫn còn, không được ghi là đã sửa. Xem hướng dẫn benchmark trong docs.

### NS-09 — Mở rộng lịch sử

- [x] **Trạng thái:** Hoàn thành local (2026-10-21) — chưa phát hành
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-06 để thống nhất bộ lọc provider trên hai giao diện.
- **Nội dung:** Hỗ trợ 7 ngày, 30 ngày, tháng này, tháng trước và khoảng ngày tùy chọn trên cả hai giao diện.
- **Tiêu chí nghiệm thu:** Tổng và biểu đồ tuân theo khoảng ngày, provider, múi giờ và trạng thái thiếu giá. Kiểm tra ranh giới ngày/tháng, khoảng không có dữ liệu và khoảng ngày không hợp lệ. Không thay đổi ý nghĩa chi phí toàn phiên hoặc làm hỏng consumer schema v1.
- **Bằng chứng hoàn thành:** Optional daily/provider/model history từ cùng báo cáo ccusage, cache revision, cửa sổ native duy nhất có resize và tab lịch sử panel độc lập pin/follow. Preset 7/30 ngày, tháng này/trước và ngày tùy chọn; tổng khoảng khác toàn phiên, chọn ngày xem model. 96 test Usage, 28 test browser, 137 test Swift và 4 test đóng gói qua; typecheck, UI build, validation/diff check qua. Fixture chung 375 token/$7; CLI 6 năm 4.400 records/1 lần scan. Review P2 đã tái hiện và sửa: giá partial-zero có marker riêng, custom range giữ qua đổi múi giờ; đối chiếu unknown + aggregate rỗng khớp TS/Swift. Review lại không còn P1/P2. Render EN/VI/zh sáng/tối/màn hình thấp bằng fixture đã kiểm tra; chưa nghiệm thu app cài đặt/host thực/VoiceOver/Intel. Chưa phát hành.

### NS-10 — Xuất CSV/JSON

- [x] **Trạng thái:** Hoàn thành local (2026-10-21) — chưa phát hành
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-09.
- **Nội dung:** Xuất thống kê theo khoảng ngày và provider, kèm múi giờ và trạng thái giá.
- **Tiêu chí nghiệm thu:** Dữ liệu xuất khớp bộ lọc và số liệu hiển thị. Mặc định không xuất tên/ID phiên; người dùng có thể bật rõ ràng. Không xuất nội dung hội thoại. Kiểm tra Unicode, ký tự đặc biệt trong CSV và dữ liệu thiếu giá.
- **Bằng chứng hoàn thành:** CSV/JSON từ cùng projection ngày/provider của NS-09, kèm múi giờ/generatedAt/pricing status và cost basis; unknown amount là null/blank, không phải 0. Mặc định không có tên/ID hoặc cột identifier. Opt-in chỉ thêm tham chiếu lastActivity trong khoảng/provider, ghi rõ không phân bổ chi phí và không đầy đủ phiên đóng góp. CSV chống formula injection kể cả BOM, quote/newline/Unicode. Native đóng băng payload trước Save dialog; panel dùng SDK host downloadFile, chỉ preview mới Blob download; host cũ báo lỗi rõ. 118 test Usage, 32 test browser, 146 test Swift và 4 test đóng gói qua; typecheck/UI build/validate/diff check qua. Đã thử tải file JSON/CSV thật trong Chrome preview và lỗi host legacy; chưa nghiệm thu Save dialog app cài đặt hoặc host Codex chấp thuận tải thực tế. Chưa phát hành.

### NS-11 — Ngân sách chi phí ước tính

- [x] **Trạng thái:** Hoàn thành local (2026-10-21) — chưa phát hành
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-01, NS-06.
- **Nội dung:** Cho đặt ngưỡng ngày/tháng theo tổng hoặc provider, mặc định tắt.
- **Tiêu chí nghiệm thu:** Cảnh báo khi vượt ngưỡng, tránh gửi lặp và ghi rõ đây là chi phí API quy đổi. Thiếu giá không được hiển thị như ngân sách còn chính xác. Kiểm tra đổi ngày/tháng, đổi ngưỡng, khởi động lại, dữ liệu cũ và quyền thông báo bị từ chối.
- **Bằng chứng hoàn thành:** Native settings với ngưỡng ngày/tháng All/Codex/Claude, mặc định tắt và thông báo budget mặc định tắt. Save kiểm tra số hữu hạn dương, Cancel không ghi; lưu local. Evaluator dùng đúng period/provider, chặn stale/error/sai ngày/thiếu breakdown; partial chỉ cảnh báo khi phần đã biết vượt ngưỡng, không hiển thị số còn lại chính xác. Tracker hash source/timezone/provider/kỳ, lưu qua restart và giới hạn 512 khóa, không báo lặp do sửa ngưỡng/refresh. Budget chỉ xin quyền OS khi Save bật rõ ràng; refresh kiểm tra quyền không prompt. Cảnh báo trong app không phụ thuộc OS và không che lỗi đọc usage. Test hồi quy vòng lặp render/delivery đã thất bại trước sửa callback rồi qua. 118 test Usage, 32 browser, 162 Swift và 4 test đóng gói qua; typecheck/validation/diff check qua. Render ba ngôn ngữ sáng/tối dùng fixture; quyền/banners macOS thực tế chưa nghiệm thu. Không thay workflow context hiện có, chưa phát hành.

### NS-12 — Quản lý dữ liệu và gỡ app

- [x] **Trạng thái:** Hoàn thành local, chưa phát hành
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Thêm thao tác xóa cache có xác nhận và hướng dẫn ngắt hooks/context/login.
- **Tiêu chí nghiệm thu:** Phân biệt dữ liệu dùng chung với plugin, bản sao cấu hình và log gốc. Xóa đúng phạm vi đã xác nhận, xử lý việc đọc/ghi đang diễn ra và lỗi quyền truy cập. Không xóa log Codex/Claude hoặc cấu hình bên thứ ba; hướng dẫn rõ dữ liệu nào còn lại sau khi gỡ app.
- **Bằng chứng hoàn thành:** Cửa sổ Data management được giữ một instance, xác nhận mặc định Cancel; chỉ xóa file cache đã biết trong thư mục mặc định, từ chối override/symlink/nguồn được bảo vệ/scan đang chạy. Suspend và chờ reader kết thúc trước khi xóa; shutdown chờ maintenance hoàn tất. Guard chung có owner/nonce và kernel flock ổn định cho native; TS chỉ kiểm tra hoặc bỏ qua guard đã bỏ lại sau xác minh, không xóa guard. Giữ file lạ, log gốc, cấu hình và bản sao; hướng dẫn ngắt hooks/context/login và gỡ app, không tự thay cấu hình. Test hồi quy stale-recovery/shutdown/localization có RED trước sửa; 143 Usage (25 maintenance), 32 browser, 181 Swift và 4 đóng gói qua; typecheck/build UI/validation qua. Safety review không còn P1/P2. Chỉ dùng fixture cô lập, không xóa cache thật của người dùng; UI tương tác app đã cài/VoiceOver chưa nghiệm thu.

### NS-14 — Cập nhật trong app có xác nhận và chữ ký

- [x] **Trạng thái:** Source và E2E local đã kiểm chứng (2026-10-21); chưa merge/phát hành/bootstrap hoặc bật feed production.
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-04; chủ dự án quản lý key production và duyệt phát hành riêng. NS-05 Developer ID/notarization/máy sạch/Intel/quyền OS/VoiceOver vẫn độc lập.
- **Nội dung:** Kiểm tra theo yêu cầu, xác nhận tải/cài, xác minh feed/archive, shutdown an toàn, thay app và mở lại bằng Sparkle 2.10.0 đã pin. Không tự kiểm tra/tải/cài nền, profiling hay JavaScript.
- **Tiêu chí nghiệm thu:** Shared About/menu state; cấu hình/architecture fail closed; framework ký đúng và symlink không thoát; actual A→B có xác nhận, giữ dữ liệu; hủy/chữ ký sai/feed bị sửa/mạng lỗi/sai version hoặc kiến trúc không thay app. Không thay app đang dùng hoặc public0.5.0.
- **Bằng chứng local:** 189 Swift,19 packaging/policy/crypto/harness,144 Usage,32 browser,15 website qua; typecheck qua. Actual test-only A0.6.0→B0.6.1 qua standard UI,53 quan sát giữ A khi maintenance đang chạy;8 tình huống âm giữ nguyên executable/version/log/export. Key test ephemeral; prefs riêng và cache bridge test-ID có phê duyệt, đã dọn. [Báo cáo kiểm chứng và gate còn lại](releases/ns14-local-validation.md). PR #34 chỉ source, chưa có production key/feed hay phát hành0.6.0.

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
