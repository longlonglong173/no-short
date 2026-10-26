# Backlog cải thiện No Short Usage

Ngày tạo: 2026-10-19.

Cập nhật backlog: 2026-10-27, đối chiếu `main` bản 0.6.1. Chỉ cập nhật tài liệu, không tự triển khai các task.

Trạng thái được ghi riêng ở từng task. Thực hiện P1 trước, P2 tiếp theo.
Việc ghi nhận backlog không tự khởi chạy triển khai; chỉ thực hiện task khi
có yêu cầu của người dùng.

## P1 — Độ tin cậy, trải nghiệm bắt đầu và phân tích theo công việc

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

- [ ] **Trạng thái:** Đang thực hiện — mốc kiểm chứng bản Experimental 0.6.1 (cập nhật 2026-10-27); các gate thiết bị chưa hoàn tất
- **Ưu tiên:** P1
- **Phụ thuộc:** Không để bắt đầu kiểm chứng bản hiện tại; kiểm chứng lại artifact cuối cùng sau mọi thay đổi được đưa vào bản phát hành.
- **Nội dung:** Theo dõi riêng notarization, cài đặt trên máy sạch, Intel, hooks/context Claude thực tế, thông báo macOS, sleep/wake, login và VoiceOver.
- **Tiêu chí nghiệm thu:** Mỗi kiểm tra ghi phiên bản, môi trường, kết quả và bằng chứng. Thiếu thiết bị hoặc chứng chỉ được ghi là bị chặn, không đánh dấu đã đạt. Phân biệt bản build local với artifact phát hành được kiểm chứng. Không tự publish.
- **Bằng chứng hiện có:** 102 test Swift tích hợp, 4 test đóng gói và 34 test Usage; build/provenance/signature/smoke cùng artifact được ghi tại [release 0.4.3](releases/0.4.3.md) và `release-validation.json`. Notarization, máy sạch, Intel runtime, hooks/context thực tế, thông báo, sleep/wake, login và VoiceOver chưa được đánh dấu đạt. PR riêng theo dõi phần chuẩn bị Experimental; task chưa hoàn tất.

- **Mốc kiểm chứng hiện tại:** Đối chiếu [release 0.6.1](releases/0.6.1.md) và [các nghiệm thu còn thiếu từ 0.5.0](releases/0.5.0.md#ns-05-acceptance-still-outstanding). Theo dõi riêng từng gate Developer ID/notarization, máy sạch, Intel, hooks/context Claude thực tế, quyền và banner thông báo, sleep/wake, login và VoiceOver. Việc cập nhật backlog không cung cấp bằng chứng nghiệm thu mới hoặc thay thế các bằng chứng 0.4.3 ở trên.

### NS-14 — Cập nhật trong app có xác nhận và chữ ký

- [x] **Trạng thái:** Đã phát hành bootstrap0.6.0 (2026-10-26); triển khai feed/website qua PR #36.
- **Ưu tiên:** P1 — chuỗi tin cậy khi cài executable.
- **Phụ thuộc:** NS-04; chủ dự án quản lý key production và duyệt phát hành riêng. NS-05 Developer ID/notarization/máy sạch/Intel/quyền OS/VoiceOver vẫn độc lập.
- **Nội dung:** Kiểm tra theo yêu cầu, xác nhận tải/cài, xác minh feed/archive, shutdown an toàn, thay app và mở lại bằng Sparkle 2.10.0 đã pin. Chính sách bootstrap 0.6.0 không tự kiểm tra/tải/cài nền, không profiling hay JavaScript. Từ 0.6.1, [NS-15](#ns-15--phiên-bản-và-thông-báo-cập-nhật-trong-app) bổ sung kiểm tra nền chỉ đọc có bật/tắt; tải và cài vẫn cần xác nhận.
- **Tiêu chí nghiệm thu:** Shared About/menu state; cấu hình/architecture fail closed; framework ký đúng và symlink không thoát; actual A→B có xác nhận, giữ dữ liệu; hủy/chữ ký sai/feed bị sửa/mạng lỗi/sai version hoặc kiến trúc không thay app. Không thay app đang dùng hoặc public0.5.0.
- **Bằng chứng local:** 190 Swift,19 packaging/policy/crypto/harness,144 Usage,32 browser,15 website qua; typecheck qua. Actual test-only A0.6.0→B0.6.1 qua standard UI,53 quan sát giữ A khi maintenance đang chạy;8 tình huống âm giữ nguyên executable/version/log/export. Key test ephemeral; prefs riêng và cache bridge test-ID có phê duyệt, đã dọn. [Báo cáo kiểm chứng và gate còn lại](releases/ns14-local-validation.md). PR #34 triển khai source; PR #35 cấu hình khóa công khai và phiên bản0.6.0. Bootstrap0.6.0 đã phát hành với archive/feed được ký; PR #36 đưa feed và đường tải lên website. Người dùng0.5.0 cài tay một lần. Khóa riêng nằm ngoài Git, mọi asset công khai đã tải lại và đối chiếu hash/chữ ký; NS-05 vẫn riêng.

### NS-16 — Nguồn giá và đơn giá tùy chỉnh

- [ ] **Trạng thái:** Đã triển khai và review; chờ chủ dự án merge [PR #41](https://github.com/longlonglong173/no-short/pull/41). CI được theo dõi trong PR.
- **Ưu tiên:** P1
- **Phụ thuộc:** NS-20 cung cấp build ccusage có bản vá nguồn để bổ sung tín hiệu fallback đáng tin cậy; NS-06, NS-09 và NS-10 để đồng bộ giá giữa bảng model, lịch sử và export.
- **Nội dung:** Hiển thị nguồn đơn giá, thời điểm cập nhật và model thiếu giá; cho đặt và khôi phục đơn giá riêng cho model/endpoint tùy chỉnh. Ghi rõ cơ sở giá đang được áp dụng.
- **Tiêu chí nghiệm thu:** Giá 0 do người dùng đặt phải khác giá chưa biết. Lưu cấu hình local; thao tác hủy không thay đổi giá, khôi phục trả về nguồn giá mặc định. Tổng, bảng model, lịch sử và CSV/JSON dùng cùng cơ sở giá và thể hiện được giá tùy chỉnh hoặc thiếu giá. Kiểm tra thay đổi/khôi phục giá, model không có giá, dữ liệu cũ và giá trị nhập không hợp lệ. Không trình bày chi phí API quy đổi thành hóa đơn hoặc quota thuê bao.
- **Bằng chứng:** Giá tùy chỉnh và nguồn giá dùng chung; tín hiệu fallback từ reader thật và giữ phần chi phí đã biết đã qua review lại; raw runtime cũ được báo cần cập nhật. Tip `364795f`; [thiết kế và kiểm chứng NS-16](https://github.com/longlonglong173/no-short/blob/364795f89e6355f24d837d9423dbca8d03d273ff/docs/tasks/NS-16.md). Chỉ là bằng chứng source/local/CI; chưa phát hành hoặc nghiệm thu app cài đặt, host thực tế hay Intel.

### NS-13 — Thống kê theo dự án và nhóm phiên cha–con

- [ ] **Trạng thái:** Đã triển khai và review; chờ chủ dự án merge [PR #45](https://github.com/longlonglong173/no-short/pull/45). CI được theo dõi trong PR.
- **Ưu tiên:** P1 (nâng từ P3 ngày 2026-10-27)
- **Phụ thuộc:** Xác minh metadata thực tế và chốt thiết kế trước khi triển khai; NS-09, NS-10 cho khoảng ngày và export; NS-20 và ledger chính xác của NS-18 trước khi nghiệm thu tổng. Nhóm theo chế độ dự án/công việc, giữ cùng bộ lọc provider/ngày, không bổ sung bộ chọn một dự án riêng.
- **Nội dung:** Thống kê chi phí/token theo dự án và tổng hợp một công việc gồm phiên chính cùng các tác vụ con. Giữ một task hiện có, chia thành hai mốc nghiệm thu riêng.
- **Mốc 1 — Theo dự án:** Nhóm bằng metadata dự án đáng tin cậy; lọc theo khoảng ngày/provider, giữ nhóm chưa xác định. Thiết kế nêu nguồn metadata, mức tin cậy và cách xử lý thiếu dữ liệu; không suy diễn dự án từ nội dung hội thoại.
- **Mốc 2 — Phiên cha–con:** Hiển thị tổng công việc và breakdown từng phiên/agent/model khi xác định được quan hệ. Phiên thiếu quan hệ giữ riêng, không ghép theo suy đoán; không cộng lại usage đã bao gồm trong tổng cha.
- **Tiêu chí nghiệm thu:** Cả hai mốc không cộng trùng; tổng đối chiếu được với dữ liệu nguồn sau NS-20, cùng provider/khoảng ngày/múi giờ. Chi phí trong khoảng không bị thay bằng chi phí toàn phiên; dữ liệu chưa đủ để phân bổ phải được ghi rõ. Kiểm tra thiếu metadata, phiên mồ côi, nhiều cấp tác vụ con, bản sao nhiều nguồn và đổi bộ lọc. Không xuất đường dẫn dự án mặc định; giữ các lựa chọn riêng tư của NS-10.
- **Bằng chứng:** Nhóm dự án và công việc cha–con dựa trên metadata rõ ràng, ledger theo ngày và export bảo vệ định danh; hai lỗi provider CSV/UUID khác hoa-thường đã được review lại; sửa tràn bảng nhóm ở 360px có regression ba ngôn ngữ; view tách cho Swift 6.0 có 12 ảnh trước/sau giống hệt. Tip `3fda047`; [thiết kế và kiểm chứng NS-13](https://github.com/longlonglong173/no-short/blob/3fda047832b8a92e4cc923fa8a0ee6c72e9fa989/docs/tasks/NS-13.md). Chỉ là bằng chứng source/local/CI; chưa phát hành hoặc nghiệm thu app cài đặt, host thực tế hay Intel.

### NS-20 — Độ đúng khi gộp nhiều nguồn log

- [ ] **Trạng thái:** Đã triển khai và review; chờ chủ dự án merge [PR #40](https://github.com/longlonglong173/no-short/pull/40). CI được theo dõi trong PR.
- **Ưu tiên:** P1
- **Phụ thuộc:** Không; tiếp nhận vấn đề còn mở được ghi nhận trong NS-08, không phụ thuộc việc mở lại tối ưu metadata.
- **Nội dung:** Tái hiện và xử lý việc ccusage gộp nhầm sự kiện giữa hai phiên khi timestamp và số token giống nhau, đồng thời giữ loại trùng bản sao cùng sự kiện trên nhiều nguồn. Ghi rõ phương án xử lý, định danh sự kiện sử dụng và giới hạn còn lại.
- **Tiêu chí nghiệm thu:** Hai phiên khác nhau, mỗi phiên 110 token có cùng timestamp/token phải cho tổng 220; bản sao cùng sự kiện trên hai nguồn chỉ được tính một lần. Đối chiếu tổng theo phiên/ngày/provider/model, lịch sử và export trên cùng dữ liệu. Kiểm tra thứ tự nguồn, thêm/bỏ nguồn, ghi thêm log và cache cũ; không dùng timestamp/token đơn thuần làm định danh liên phiên. Có bằng chứng hồi quy trước/sau và phương án xử lý tương thích consumer hiện có; không đánh dấu hoàn thành nếu chỉ ghi nhận hoặc che sai lệch.
- **Bằng chứng:** Sửa khóa định danh và gộp phiên khi bản sao đổi đường dẫn/ghi thêm; real CLI 110→220, build hai kiến trúc và replay/compaction qua; CI và review lại đã qua. Tip `cfe0ba1`; [thiết kế và kiểm chứng NS-20](https://github.com/longlonglong173/no-short/blob/cfe0ba125ecb578eafe9d56541433e329db060f9/docs/tasks/NS-20.md). Chỉ là bằng chứng source/local/CI; chưa phát hành hoặc nghiệm thu app cài đặt, host thực tế hay Intel.

## P2 — Tính nhất quán và khả năng phân tích

### NS-06 — Đồng bộ khả năng giữa panel và app native

- [x] **Trạng thái:** Đã đưa vào bản Experimental 0.5.0; nghiệm thu thiết bị/host còn thiếu được giữ riêng.
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Thêm bộ lọc provider cho panel khi nguồn Claude được cấu hình; thêm bảng chi phí theo model trong app native.
- **Tiêu chí nghiệm thu:** Ghi rõ nguồn và phạm vi tổng; số liệu theo provider/model khớp dữ liệu nguồn, giữ đúng trạng thái giá thiếu hoặc chưa biết. Giữ tương thích snapshot schema v1 và trường hợp chỉ có Codex.
- **Bằng chứng hoàn thành:** 38 test Usage, 23 test Playwright, 114 test Swift và 4 test đóng gói đều đạt; typecheck, validate, build panel, build native arm64/x64 và smoke/provenance/signature đều đạt local. Bộ lọc dùng đúng breakdown provider, giữ ghim/cấu hình host khôi phục muộn, không phát lại tool metadata cũ; bảng model native có cuộn và phân biệt toàn phiên với tổng hôm nay. Đã kiểm tra render giả lập EN/VI/zh, sáng/tối và bảng dài. Schema v1 chỉ Codex và trường hợp thiếu breakdown được kiểm tra riêng. Review không còn P1/P2. Chưa kiểm chứng thao tác trên app cài đặt/host Codex thực tế hoặc Intel runtime; không thay đổi download v0.4.3 và không tự publish. Xem [panel](no-short-usage.md#provider-filters-ns-06-050) và [native](no-short-usage-menubar.md#costs-by-model-ns-06-050).

- **Mốc phát hành:** Đã đưa vào 0.5.0 theo [changelog](../CHANGELOG.md#050--experimental-2026-10-21) và [release 0.5.0](releases/0.5.0.md). Các ghi chú “chưa phát hành” hoặc “không phát hành” trong bằng chứng trên mô tả thời điểm kiểm chứng local trước đó; không thay thế các nghiệm thu thiết bị/host còn thiếu của NS-05.

### NS-07 — Popover thích ứng màn hình

- [x] **Trạng thái:** Đã đưa vào bản Experimental 0.5.0; nghiệm thu thiết bị/host còn thiếu được giữ riêng.
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Giới hạn chiều cao theo vùng hiển thị và cho phép cuộn khi cần.
- **Tiêu chí nghiệm thu:** Kiểm tra màn hình thấp, ba ngôn ngữ và nhiều cảnh báo. Nội dung và mọi nút vẫn truy cập được bằng chuột lẫn bàn phím; bố cục thích ứng khi cảnh báo xuất hiện hoặc biến mất.
- **Bằng chứng hoàn thành:** Viewport giới hạn theo vùng màn hình dưới status item, nội dung cuộn theo chiều cao tự nhiên; resize theo thay đổi cảnh báo/ngôn ngữ và màn hình. Home/End/Page Up/Page Down đi tới toàn nội dung. Test hồi quy đã thất bại vì dashboard không có viewport cuộn trước bản sửa. 120 test Swift, 4 test đóng gói, 38 test Usage và validation qua. Render giả lập các trạng thái hiện có qua; chưa nghiệm thu click/VoiceOver trên app cài đặt hoặc màn hình vật lý phụ. Không phát hành.

- **Mốc phát hành:** Đã đưa vào 0.5.0 theo [changelog](../CHANGELOG.md#050--experimental-2026-10-21) và [release 0.5.0](releases/0.5.0.md). Các ghi chú “chưa phát hành” hoặc “không phát hành” trong bằng chứng trên mô tả thời điểm kiểm chứng local trước đó; không thay thế các nghiệm thu thiết bị/host còn thiếu của NS-05.

### NS-08 — Đo và tối ưu quét metadata

- [x] **Trạng thái:** Đã đưa vào bản Experimental 0.5.0; nghiệm thu thiết bị/host còn thiếu được giữ riêng.
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Đo thời gian quét với lịch sử lớn, bổ sung cache theo file thay đổi.
- **Vấn đề tách riêng:** Theo dõi độ đúng khi gộp nhiều nguồn tại [NS-20](#ns-20--độ-đúng-khi-gộp-nhiều-nguồn-log); không mở lại phần tối ưu metadata đã hoàn thành. Trong fixture nhiều nguồn, ccusage 20.0.34 có thể gộp sự kiện của hai phiên Codex khác nhau nếu timestamp và số token hoàn toàn giống nhau: hai phiên đều có 110 token nhưng tổng ngày chỉ 110. Fixture với thời điểm riêng cho mỗi phiên và bản sao giữ nguyên timestamp trả đúng tổng 220. Đây là giới hạn quan sát được của bộ đọc hiện tại, chưa được sửa trong phần chọn nhiều nguồn; cần giữ thành ca điều tra riêng khi đánh giá độ tin cậy tổng ngày.
- **Tiêu chí nghiệm thu:** Ghi số đo trước/sau trên cùng bộ dữ liệu và môi trường. Kiểm tra đổi tên, ghi thêm, xóa và chuyển nguồn; kết quả metadata sau tối ưu phải giữ nguyên, không trả dữ liệu cũ hoặc lẫn nguồn.
- **Bằng chứng hoàn thành:** Cache metadata riêng mỗi file bằng device/inode/size/mtime/ctime; liệt kê/stat lại, đọc lại title index, bỏ file xóa/đổi nguồn, ghi atomic và giới hạn cache. Test append/rename/delete/nguồn mới/cache hỏng/symlink qua. Benchmark synthetic cùng 240 file × 501 dòng trên macOS arm64: bản trước 103.82 ms; cache lạnh 67.06 ms, cache ấm 7.58 ms, 240 hit/0 đọc nội dung, kết quả không đổi. Đây là số đo metadata, không phải tốc độ toàn bộ ccusage. 43 test Usage và 23 test browser qua, typecheck/validate/diff check qua. Test CLI thật tái hiện va chạm timestamp/token (110 thay vì 220), thay timestamp trả 220; giới hạn upstream vẫn còn, không được ghi là đã sửa. Xem hướng dẫn benchmark trong docs.

- **Mốc phát hành:** Đã đưa vào 0.5.0 theo [changelog](../CHANGELOG.md#050--experimental-2026-10-21) và [release 0.5.0](releases/0.5.0.md). Các ghi chú “chưa phát hành” hoặc “không phát hành” trong bằng chứng trên mô tả thời điểm kiểm chứng local trước đó; không thay thế các nghiệm thu thiết bị/host còn thiếu của NS-05.

### NS-09 — Mở rộng lịch sử

- [x] **Trạng thái:** Đã đưa vào bản Experimental 0.5.0; nghiệm thu thiết bị/host còn thiếu được giữ riêng.
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-06 để thống nhất bộ lọc provider trên hai giao diện.
- **Nội dung:** Hỗ trợ 7 ngày, 30 ngày, tháng này, tháng trước và khoảng ngày tùy chọn trên cả hai giao diện.
- **Tiêu chí nghiệm thu:** Tổng và biểu đồ tuân theo khoảng ngày, provider, múi giờ và trạng thái thiếu giá. Kiểm tra ranh giới ngày/tháng, khoảng không có dữ liệu và khoảng ngày không hợp lệ. Không thay đổi ý nghĩa chi phí toàn phiên hoặc làm hỏng consumer schema v1.
- **Bằng chứng hoàn thành:** Optional daily/provider/model history từ cùng báo cáo ccusage, cache revision, cửa sổ native duy nhất có resize và tab lịch sử panel độc lập pin/follow. Preset 7/30 ngày, tháng này/trước và ngày tùy chọn; tổng khoảng khác toàn phiên, chọn ngày xem model. 96 test Usage, 28 test browser, 137 test Swift và 4 test đóng gói qua; typecheck, UI build, validation/diff check qua. Fixture chung 375 token/$7; CLI 6 năm 4.400 records/1 lần scan. Review P2 đã tái hiện và sửa: giá partial-zero có marker riêng, custom range giữ qua đổi múi giờ; đối chiếu unknown + aggregate rỗng khớp TS/Swift. Review lại không còn P1/P2. Render EN/VI/zh sáng/tối/màn hình thấp bằng fixture đã kiểm tra; chưa nghiệm thu app cài đặt/host thực/VoiceOver/Intel. Chưa phát hành.

- **Mốc phát hành:** Đã đưa vào 0.5.0 theo [changelog](../CHANGELOG.md#050--experimental-2026-10-21) và [release 0.5.0](releases/0.5.0.md). Các ghi chú “chưa phát hành” hoặc “không phát hành” trong bằng chứng trên mô tả thời điểm kiểm chứng local trước đó; không thay thế các nghiệm thu thiết bị/host còn thiếu của NS-05.

### NS-10 — Xuất CSV/JSON

- [x] **Trạng thái:** Đã đưa vào bản Experimental 0.5.0; nghiệm thu thiết bị/host còn thiếu được giữ riêng.
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-09.
- **Nội dung:** Xuất thống kê theo khoảng ngày và provider, kèm múi giờ và trạng thái giá.
- **Tiêu chí nghiệm thu:** Dữ liệu xuất khớp bộ lọc và số liệu hiển thị. Mặc định không xuất tên/ID phiên; người dùng có thể bật rõ ràng. Không xuất nội dung hội thoại. Kiểm tra Unicode, ký tự đặc biệt trong CSV và dữ liệu thiếu giá.
- **Bằng chứng hoàn thành:** CSV/JSON từ cùng projection ngày/provider của NS-09, kèm múi giờ/generatedAt/pricing status và cost basis; unknown amount là null/blank, không phải 0. Mặc định không có tên/ID hoặc cột identifier. Opt-in chỉ thêm tham chiếu lastActivity trong khoảng/provider, ghi rõ không phân bổ chi phí và không đầy đủ phiên đóng góp. CSV chống formula injection kể cả BOM, quote/newline/Unicode. Native đóng băng payload trước Save dialog; panel dùng SDK host downloadFile, chỉ preview mới Blob download; host cũ báo lỗi rõ. 118 test Usage, 32 test browser, 146 test Swift và 4 test đóng gói qua; typecheck/UI build/validate/diff check qua. Đã thử tải file JSON/CSV thật trong Chrome preview và lỗi host legacy; chưa nghiệm thu Save dialog app cài đặt hoặc host Codex chấp thuận tải thực tế. Chưa phát hành.

- **Mốc phát hành:** Đã đưa vào 0.5.0 theo [changelog](../CHANGELOG.md#050--experimental-2026-10-21) và [release 0.5.0](releases/0.5.0.md). Các ghi chú “chưa phát hành” hoặc “không phát hành” trong bằng chứng trên mô tả thời điểm kiểm chứng local trước đó; không thay thế các nghiệm thu thiết bị/host còn thiếu của NS-05.

### NS-11 — Ngân sách chi phí ước tính

- [x] **Trạng thái:** Đã đưa vào bản Experimental 0.5.0; nghiệm thu thiết bị/host còn thiếu được giữ riêng.
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-01, NS-06.
- **Nội dung:** Cho đặt ngưỡng ngày/tháng theo tổng hoặc provider, mặc định tắt.
- **Tiêu chí nghiệm thu:** Cảnh báo khi vượt ngưỡng, tránh gửi lặp và ghi rõ đây là chi phí API quy đổi. Thiếu giá không được hiển thị như ngân sách còn chính xác. Kiểm tra đổi ngày/tháng, đổi ngưỡng, khởi động lại, dữ liệu cũ và quyền thông báo bị từ chối.
- **Bằng chứng hoàn thành:** Native settings với ngưỡng ngày/tháng All/Codex/Claude, mặc định tắt và thông báo budget mặc định tắt. Save kiểm tra số hữu hạn dương, Cancel không ghi; lưu local. Evaluator dùng đúng period/provider, chặn stale/error/sai ngày/thiếu breakdown; partial chỉ cảnh báo khi phần đã biết vượt ngưỡng, không hiển thị số còn lại chính xác. Tracker hash source/timezone/provider/kỳ, lưu qua restart và giới hạn 512 khóa, không báo lặp do sửa ngưỡng/refresh. Budget chỉ xin quyền OS khi Save bật rõ ràng; refresh kiểm tra quyền không prompt. Cảnh báo trong app không phụ thuộc OS và không che lỗi đọc usage. Test hồi quy vòng lặp render/delivery đã thất bại trước sửa callback rồi qua. 118 test Usage, 32 browser, 162 Swift và 4 test đóng gói qua; typecheck/validation/diff check qua. Render ba ngôn ngữ sáng/tối dùng fixture; quyền/banners macOS thực tế chưa nghiệm thu. Không thay workflow context hiện có, chưa phát hành.

- **Mốc phát hành:** Đã đưa vào 0.5.0 theo [changelog](../CHANGELOG.md#050--experimental-2026-10-21) và [release 0.5.0](releases/0.5.0.md). Các ghi chú “chưa phát hành” hoặc “không phát hành” trong bằng chứng trên mô tả thời điểm kiểm chứng local trước đó; không thay thế các nghiệm thu thiết bị/host còn thiếu của NS-05.

### NS-12 — Quản lý dữ liệu và gỡ app

- [x] **Trạng thái:** Đã đưa vào bản Experimental 0.5.0; nghiệm thu thiết bị/host còn thiếu được giữ riêng.
- **Ưu tiên:** P2
- **Phụ thuộc:** Không.
- **Nội dung:** Thêm thao tác xóa cache có xác nhận và hướng dẫn ngắt hooks/context/login.
- **Tiêu chí nghiệm thu:** Phân biệt dữ liệu dùng chung với plugin, bản sao cấu hình và log gốc. Xóa đúng phạm vi đã xác nhận, xử lý việc đọc/ghi đang diễn ra và lỗi quyền truy cập. Không xóa log Codex/Claude hoặc cấu hình bên thứ ba; hướng dẫn rõ dữ liệu nào còn lại sau khi gỡ app.
- **Bằng chứng hoàn thành:** Cửa sổ Data management được giữ một instance, xác nhận mặc định Cancel; chỉ xóa file cache đã biết trong thư mục mặc định, từ chối override/symlink/nguồn được bảo vệ/scan đang chạy. Suspend và chờ reader kết thúc trước khi xóa; shutdown chờ maintenance hoàn tất. Guard chung có owner/nonce và kernel flock ổn định cho native; TS chỉ kiểm tra hoặc bỏ qua guard đã bỏ lại sau xác minh, không xóa guard. Giữ file lạ, log gốc, cấu hình và bản sao; hướng dẫn ngắt hooks/context/login và gỡ app, không tự thay cấu hình. Test hồi quy stale-recovery/shutdown/localization có RED trước sửa; 143 Usage (25 maintenance), 32 browser, 181 Swift và 4 đóng gói qua; typecheck/build UI/validation qua. Safety review không còn P1/P2. Chỉ dùng fixture cô lập, không xóa cache thật của người dùng; UI tương tác app đã cài/VoiceOver chưa nghiệm thu.

- **Mốc phát hành:** Đã đưa vào 0.5.0 theo [changelog](../CHANGELOG.md#050--experimental-2026-10-21) và [release 0.5.0](releases/0.5.0.md). Các ghi chú “chưa phát hành” hoặc “không phát hành” trong bằng chứng trên mô tả thời điểm kiểm chứng local trước đó; không thay thế các nghiệm thu thiết bị/host còn thiếu của NS-05.

### NS-15 — Phiên bản và thông báo cập nhật trong app

- [x] **Trạng thái:** Đã phát hành0.6.1 (2026-10-26); đưa feed/website mới lên qua PR rollout.
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-14 và bootstrap0.6.0; tái sử dụng khóa/kênh đã ký.
- **Nội dung:** Hiện phiên bản đang chạy, trạng thái cập nhật và thời điểm kiểm tra ở bảng chính. Người dùng đã chọn tự kiểm tra mỗi ngày, chỉ thông báo trong app; tải/cài vẫn xác nhận riêng.
- **Tiêu chí nghiệm thu:** Dùng một coordinator cho panel/About/menu; probe tối đa một lần/24h kể cả khởi động lại, có bật/tắt và kiểm tra thủ công. Giữ bản mới đã biết sau khi đóng hộp thoại; lỗi không nhận nhầm là mới nhất. Không tải/cài/mở hộp thoại hoặc thông báo OS từ probe. Giữ chữ ký, ARM, shutdown drain và ba ngôn ngữ.
- **Bằng chứng local:**198Swift+19script tests; bốn phiên native probe thực với signed newer/equal/tampered feed/HTTP503 đều chỉ gửi1request đọc feed,0archive/install, giữ nguyên app/log/export. Render EN/VI/zh sáng/tối và kiểm tra viewport nhỏ. NS-05 vẫn riêng; người dùng test0.6.0→0.6.1 qua About → Check for Updates sau phát hành.

### NS-17 — So sánh hai khoảng thời gian

- [ ] **Trạng thái:** Đã triển khai và review; chờ chủ dự án merge [PR #42](https://github.com/longlonglong173/no-short/pull/42). CI được theo dõi trong PR.
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-09.
- **Nội dung:** So sánh khoảng đã chọn với kỳ trước cùng độ dài; hiển thị chênh lệch token/chi phí theo provider, model và thay đổi tỷ lệ cache.
- **Tiêu chí nghiệm thu:** Hai kỳ dùng cùng bộ lọc, múi giờ và cơ sở giá. Hiển thị rõ ngày bắt đầu/kết thúc, chênh lệch tuyệt đối và phần trăm khi tính được; kỳ gốc bằng 0 không sinh phần trăm vô hạn. Nêu cách tính tỷ lệ cache; không suy ra mức tăng chính xác khi thiếu giá hoặc dữ liệu không đầy đủ. Kiểm tra ranh giới ngày/tháng, năm nhuận, kỳ rỗng, model chỉ xuất hiện ở một kỳ và dữ liệu cũ.
- **Bằng chứng:** So sánh hai kỳ trên native/panel, guard dữ liệu cũ khi trở lại tab và tương thích ghép nhánh đã qua review lại. Tip `6d64666`; [thiết kế và kiểm chứng NS-17](https://github.com/longlonglong173/no-short/blob/6d64666c970a0b721d838cb0041e4f9ff8a3ab02/docs/tasks/NS-17.md). Chỉ là bằng chứng source/local/CI; chưa phát hành hoặc nghiệm thu app cài đặt, host thực tế hay Intel.

### NS-18 — Truy từ ngày tới các phiên đóng góp

- [ ] **Trạng thái:** Đã triển khai và review; chờ chủ dự án merge [PR #43](https://github.com/longlonglong173/no-short/pull/43). CI được theo dõi trong PR.
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-09 cho chọn ngày; NS-20 trước khi nghiệm thu tổng. Phối hợp NS-10 nếu bổ sung export theo phiên/ngày.
- **Nội dung:** Chọn một ngày trên lịch sử để xem các phiên đóng góp usage trong ngày đó và mở chi tiết từng phiên.
- **Tiêu chí nghiệm thu:** Phân bổ theo usage thực tế trong ngày/múi giờ đã chọn, không theo lastActivity và không lấy chi phí toàn phiên thay cho chi phí trong ngày. Tổng danh sách khớp biểu đồ trên cùng bộ lọc hoặc giải thích rõ phần chưa phân bổ được. Kiểm tra phiên kéo dài qua nửa đêm/nhiều ngày, phiên có hoạt động cuối ngoài khoảng, tác vụ con, bản sao nhiều nguồn, giá thiếu và ngày không có dữ liệu. Không tự đổi ghim hoặc chế độ theo dõi khi xem chi tiết.
- **Bằng chứng:** Ledger phiên/ngày từ cùng nguồn chuẩn hóa; phân biệt token/giá không đối chiếu được, không đổi pin/follow; lookup native dùng Set. Đã tách validation cho compiler Swift 6.0; kiểm chứng toolchain đích theo CI của PR. Tip `97a4b43`; [thiết kế và kiểm chứng NS-18](https://github.com/longlonglong173/no-short/blob/97a4b430050de3c00930b9219e5ec574d68fa3ae/docs/tasks/NS-18.md). Chỉ là bằng chứng source/local/CI; chưa phát hành hoặc nghiệm thu app cài đặt, host thực tế hay Intel.

### NS-19 — Bất thường và dự báo ngân sách

- [ ] **Trạng thái:** Đã triển khai và review; chờ chủ dự án merge [PR #44](https://github.com/longlonglong173/no-short/pull/44). CI được theo dõi trong PR.
- **Ưu tiên:** P2
- **Phụ thuộc:** NS-11, NS-16, NS-17 và NS-20.
- **Nội dung:** Cảnh báo mức sử dụng tăng bất thường và dự báo chi phí API quy đổi cuối tháng; giải thích lịch sử, khoảng tính và cơ sở giá được dùng.
- **Tiêu chí nghiệm thu:** Mặc định tắt; thông báo macOS vẫn chỉ bật theo lựa chọn rõ ràng. Nêu quy tắc xác định bất thường, mức lịch sử tối thiểu và công thức dự báo trong thiết kế trước triển khai. Thiếu lịch sử/giá hoặc dữ liệu cũ phải hiện chưa đủ căn cứ, không đưa dự báo chính xác giả. Chống báo lặp qua refresh/khởi động lại và không che lỗi đọc usage. Kiểm tra đầu/cuối tháng, đổi nguồn/múi giờ/provider/giá, lịch sử có ngày trống, mức tăng đột biến và quyền thông báo bị từ chối.
- **Bằng chứng:** Phân tích mặc định tắt, mẫu bảy ngày quan sát có giá đầy đủ, cảnh báo trung vị và kịch bản cuối tháng; chống lặp/permission riêng; tràn số đã được review lại. Tip `d33893e`; [thiết kế và kiểm chứng NS-19](https://github.com/longlonglong173/no-short/blob/d33893e55cd25d4f2b9ff75ca457a2013877e776/docs/tasks/NS-19.md). Chỉ là bằng chứng source/local/CI; chưa phát hành hoặc nghiệm thu app cài đặt, host thực tế hay Intel.

## Bàn giao các PR — chờ chủ dự án merge

- [PR #39 — backlog](https://github.com/longlonglong173/no-short/pull/39).
- Thứ tự ghép đã kiểm chứng: [#40 / NS-20](https://github.com/longlonglong173/no-short/pull/40) → [#41 / NS-16](https://github.com/longlonglong173/no-short/pull/41) → [#42 / NS-17](https://github.com/longlonglong173/no-short/pull/42) → [#43 / NS-18](https://github.com/longlonglong173/no-short/pull/43) → [#45 / NS-13](https://github.com/longlonglong173/no-short/pull/45) → [#44 / NS-19](https://github.com/longlonglong173/no-short/pull/44).
- Các PR có base theo nhánh phụ thuộc; sau khi merge PR cha, kiểm tra base PR tiếp theo về `main` trước khi merge. Mỗi PR giữ phạm vi task riêng. Phụ thuộc quyết định thứ tự thực hiện trước mức ưu tiên.
- Candidate cuối `035405335e4fb7d98afe2db58faed8c81d82f7ec` ghép sạch cả sáu task. Các lượt kiểm chứng rộng đạt 204 Usage không skip; 236 Swift (gồm một probe tổng hợp), 19 script; 43 browser. Phần sửa CSS có bốn kiểm tra browser trên source sửa thực tế. Sau lần tách view SwiftUI cuối, 16 test native của worker và hai probe native độc lập qua; 12 ảnh render trước/sau giống hệt byte/pixel. Không cộng kiểm tra lặp thành test riêng hoặc coi mọi lượt chạy là trên cùng một head. Compiler CI Swift 6.0 và trạng thái từng head được ghi trực tiếp trong PR.
- Bản 0.6.1 đã phát hành vẫn giữ nguyên. Source mới cần build/phát hành runtime mới; không thay app đang cài. Các gate NS-05 vẫn theo dõi riêng, không được đánh dấu đạt từ test source hoặc cross-build.

## Quy tắc chung

- Mỗi task lưu mức ưu tiên, trạng thái, phụ thuộc, tiêu chí nghiệm thu và bằng chứng khi hoàn thành.
- Giữ ba ngôn ngữ, xử lý local và phân biệt giá chưa biết với giá bằng 0.
- Giữ tương thích consumer hiện có; thay đổi schema/ý nghĩa số liệu phải được nêu trong thiết kế và kiểm chứng trước triển khai.
- Chi phí là ước tính API quy đổi, không phải hóa đơn, credit hoặc quota thuê bao.
- Tách kết quả test local khỏi kiểm chứng trên app đang chạy, máy sạch và bản phát hành.
- Các mốc phụ thuộc chỉ mô tả thứ tự công việc, không cho phép tự khởi chạy task.
- Tạo backlog không bao gồm sửa chức năng, commit, push, phát hành hay khởi chạy các task.
