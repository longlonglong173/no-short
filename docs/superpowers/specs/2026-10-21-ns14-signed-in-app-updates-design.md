# NS-14 — Cập nhật trong app có xác nhận và chữ ký

Ngày: 2026-10-21. **Trạng thái: thiết kế và kế hoạch đã duyệt; source/local E2E đã triển khai trên PR #34. Production key/feed/bootstrap chưa cấu hình/phát hành.**

## 1. Mục tiêu và ranh giới

Người dùng đã đồng ý luồng: **Kiểm tra cập nhật → xem bản mới → Tải và cài đặt → xác minh chữ ký → thoát/thay app → mở lại**. Không cài âm thầm; không bắt người dùng tự kéo/thay app ở các lần cập nhật tiếp theo.

Website tiếp tục cung cấp ZIP cho lần cài đầu. App 0.5.0 không có updater nên cần cài thủ công một bản bootstrap có updater; không thay tài nguyên/tag 0.5.0 để giả lập nâng cấp. Đề xuất bản bootstrap 0.6.0; phát hành/deploy là bước riêng sau PR và kiểm thử, không nằm trong quyền tự phát hành của task source này. Plugin MCP không được updater native thay thế.

Khảo sát từ `main` commit `3969ce40d85d1d12d67e7d8cc0d1038e0ea13993`: `ManualUpdateController` chỉ đọc GitHub latest; About/menu dùng cùng state. Native dùng SwiftPM + build script tự dựng app, chưa nhúng framework. `verifyLayout()` hiện cấm toàn bộ symlink — cần thay policy có giới hạn vì framework macOS có symlink hợp lệ. Không sửa tính toán usage, cache, nguồn log, hooks, context hay budget.

## 2. Phương án

- **Chọn Sparkle 2.10.0**, pin đúng release và lockfile. Dùng standard updater/user driver cho tải, kiểm tra, xác nhận, cài và relaunch; app chỉ bọc policy/state/lifecycle. Đây là release latest đã xác minh từ repo chính thức tại thời điểm thiết kế, không dùng version range tự trôi.
- Không tự viết shell/helper thay file app: phải tự giải quyết chữ ký, quyền ghi, relaunch và rollback, rủi ro cao hơn.
- Giữ tải ZIP thủ công làm đường lui khi updater chưa cấu hình/không thể dùng; không trình bày đường lui đó như đã tự cài thành công.

## 3. Trải nghiệm và điều khiển

- Một coordinator do AppDelegate giữ, dùng chung giữa About, popover và right-click menu; không tạo nhiều updater/session hoặc hai đường GitHub/Sparkle cùng chạy một check.
- Nút hiện có mở kiểm tra do người dùng yêu cầu. Có bản mới thì standard Sparkle UI hiển thị bản, release notes và thao tác cài. Người dùng có thể hủy; cancel/error không làm app đang cài bị thay.
- V1 không chạy kiểm tra định kỳ hay tự tải/cài nền: đặt rõ `SUEnableAutomaticChecks=false`, `SUAutomaticallyUpdate=false`, `SUAllowsAutomaticUpdates=false`, profiling/JavaScript release notes tắt. Không có prompt xin bật auto-check vào lần mở thứ hai.
- About vẫn có version/build và link release notes; thông báo mô tả đúng updater, không còn dòng “không thay thế app” trong bản đã bật khả năng cài.
- Các trạng thái do app quản lý, lỗi cấu hình và hướng dẫn fallback có EN/VI/zh-CN. Standard Sparkle UI dùng localization của framework/macOS; source 2.10.0 đã có `vi.lproj` và `zh_CN.lproj`, nhưng không giả định preference `usageLanguage` tự đổi ngôn ngữ framework. Kiểm thử lựa chọn/fallback khi ngôn ngữ app khác hệ thống.
- Không đánh đồng lỗi cập nhật với `notice`, `isLoading`, snapshot/history/export hay cảnh báo usage. Reader tiếp tục làm việc khi chỉ tải/check. Trước cài, dùng luồng terminate hiện có để drain worker và đợi maintenance; nếu chưa an toàn thì hoãn cài, không bỏ qua shutdown.

## 4. Chuỗi tin cậy và bản phát hành

- `SUFeedURL` đề xuất: `https://no-short.io.vn/updates/experimental-arm64.xml`; một kênh Apple Silicon riêng. Không đưa Intel native app chưa nghiệm thu vào feed.
- Public key Ed25519 32-byte được pin vào bundle; private key chỉ nằm trong Keychain hoặc secret store do chủ dự án quản lý. Không nhúng private key vào Git, website, app, logs hoặc argument command line. Không tạo khóa/ghi GitHub Secrets trong giai đoạn thiết kế.
- Bắt buộc EdDSA cho archive; bật xác minh trước giải nén. Bắt buộc feed/release notes có chữ ký, không cho signed-feed failure tự hết hạn để quay về nguồn chưa tin cậy (`SUSignedFeedFailureExpirationInterval=0`). Chỉ HTTPS; không fallback tải/cài bằng shell khi chữ ký/network/feed lỗi.
- Build để phát hành có updater phải có public key thật và feed đúng kênh. Thiếu cấu hình thì fail release/package gate; dev build chỉ hiển thị khả năng chưa sẵn sàng và đường tải thủ công. Không phát hành bằng key placeholder/test.
- Appcast được tạo từ **ZIP cuối cùng sau ký/đóng gói**, ghi version/build, URL immutable đúng tag, kích thước, chữ ký và yêu cầu macOS 14+. Không dùng URL “latest asset” hoặc chỉnh ZIP sau khi đã ký. Thu thập SHA256/provenance như quy trình release hiện có.
- Upload/kiểm tra asset trước, xuất bản feed đã ký sau. Build tăng đơn điệu; không phát lại archive khác dưới cùng version/tag. Mất key của kênh ad-hoc có thể buộc cài tay bootstrap mới; phải giữ bản sao an toàn do chủ dự án quản lý, không hứa tự phục hồi khóa.
- Chữ ký Sparkle không thay thế Developer ID/notarization. Vẫn Experimental nếu chưa có chuỗi ký Apple; không tắt Gatekeeper hay library validation cho bản Developer ID để né lỗi. Chỉ quảng bá updater thực sự hoạt động sau test cài/relaunch A→B ở môi trường cô lập.

## 5. Đóng gói và dữ liệu

- Nhúng nguyên `Sparkle.framework` cùng resource/helper cần thiết vào `Contents/Frameworks`, cấu hình rpath và ký nested code từ trong ra ngoài trước ký app. Không dùng ký `--deep` để che lỗi cấu trúc; verification vẫn kiểm tra deep/strict.
- Chỉ cho phép symlink tương đối, không dangling/cycle/escape, canonical target phải nằm trong framework Sparkle đã xác minh. Vẫn cấm symlink ở runtime helpers/resources/những chỗ khác. Giữ policy kiểm tra architecture/checksum/provenance helper hiện có.
- Cả arm64/x64 phải build và kiểm tra layout/signature, nhưng public update feed chỉ arm64. Quy trình Developer ID phải xác minh team/hardened runtime và notarize/staple toàn bộ bundle sau thay đổi framework.
- Giữ bundle ID `dev.noshort.usage.menubar`, tên app và đường dẫn cài. Không xóa UserDefaults, log, nguồn, cache, bản sao hay exports. Không hứa quyền macOS/login/hook luôn giữ nguyên qua thay chữ ký; cần nghiệm thu thực tế.
- Privacy cập nhật: feed/asset HTTPS được tải khi người dùng yêu cầu, endpoint thấy IP và metadata request/framework (kiểm kê headers/User-Agent thực tế khi kiểm thử, không hứa “không gửi metadata”); không gửi session/log/usage trong URL, headers, feed parameters hay profiling.

## 6. Phạm vi file dự kiến

- `Package.swift`/`Package.resolved`, `Resources/Info.plist`: pin dependency và cấu hình updater.
- Coordinator native mới, `AboutWindow.swift`, `AppDelegate.swift`, model/menu/localization: adapter, trạng thái và lifetime.
- Policy/test thuần trong UsageCore, không kéo framework vào business usage logic.
- `scripts/build.ts`, `bundle.ts`, `package.ts`, `release.ts` và test layout/distribution: framework, symlink policy, ký và xác minh exact ZIP.
- Công cụ tạo/validate signed appcast và fixture; CI kiểm thử không cần private key production, không được publish từ pull request.
- Release guide, PRIVACY, backlog và tài liệu bootstrap; không sửa website download hiện tại hoặc public feed trong PR source chưa được duyệt phát hành.

## 7. Tiêu chí nghiệm thu

1. Tests có RED→GREEN cho state/check trùng, hủy/lỗi, thiếu key/feed, đối chiếu version và source độc lập usage refresh.
2. Startup/mở About không gọi mạng cập nhật; user click mới check. Không có auto-install dù có preference cũ; không thay preference usage.
3. Feed/archive bị sửa, sai chữ ký, thiếu chữ ký, sai kênh/kiến trúc/version và HTTP lỗi đều không thể cài. Chữ ký phải được kiểm tra bằng crypto/tool thật, không chỉ test chuỗi metadata.
4. Test framework symlink hợp lệ; từ chối symlink absolute/escape/dangling/cycle và symlink ngoài framework. Kiểm tra exact ZIP đã giải nén, nested signatures và framework resources.
5. Test coordinator cho phép shutdown drain/cancel worker và đợi cache maintenance. Không ghi đè app khi thao tác chưa an toàn.
6. Build/smoke hai kiến trúc, kiểm thử native/Usage/browser/packaging và ba ngôn ngữ; app layer khác preference hệ thống vẫn có fallback rõ ràng.
7. E2E A→B dùng app copies, prefs/home/log roots và feed/key **test riêng**, tuyệt đối không thay app đang dùng, không ghi vào Keychain production hay phát hành version test. Xác nhận version mới/relaunch, dữ liệu cũ giữ nguyên; test hủy và archive hỏng giữ nguyên bản cũ. Không tự hứa rollback nếu version mới launch lỗi sau khi đã thay.
8. PR source chưa merge/publish, chưa thay 0.5.0; khi chưa qua E2E không báo updater đã nghiệm thu. NS-05 Apple signing/clean-machine/Intel/OS/VoiceOver giữ trạng thái riêng.

## 8. Handoff

Sau khi chủ dự án duyệt spec này: viết kế hoạch implementation để duyệt và chọn cách thực thi; sau đó mới thêm dependency/code và chạy TDD. Khóa ký production và quyền phát hành/feed là các gate riêng; không thực hiện ngầm vì đã đồng ý ý tưởng cập nhật trong app.

## Nguồn chính thức đã đối chiếu

- [Sparkle 2.10.0](https://github.com/sparkle-project/Sparkle/releases/tag/2.10.0) và [localizations của release](https://github.com/sparkle-project/Sparkle/tree/2.10.0/Sparkle).
- [Setup và signing](https://sparkle-project.org/documentation/).
- [Tạo controller bằng code](https://sparkle-project.org/documentation/programmatic-setup/).
- [Các cờ consent, profiling và signed-feed](https://sparkle-project.org/documentation/customization/).
- [Đóng gói, ký archive/feed và appcast](https://sparkle-project.org/documentation/publishing/).
