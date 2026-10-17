# No Short Usage Menu Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Tạo ứng dụng menu bar macOS hiển thị Usage từ runtime hiện có, hoạt động khi đóng panel Codex.

**Architecture:** Swift/AppKit status item dùng snapshot JSON v1 từ helper đóng gói trong app. Model, process client và refresh controller tách khỏi AppKit để kiểm thử; app và panel tiếp tục chia sẻ cache/lock hiện tại. Build tạo app ZIP riêng cho từng CPU.

**Tech Stack:** Swift Package Manager, Swift 6 language mode, macOS AppKit/Foundation/ServiceManagement, Bun build scripts, XCTest.

**Spec:** `docs/superpowers/specs/2026-10-18-no-short-usage-menubar-design.md` (người dùng đã duyệt).

## Global Constraints

- Deployment target macOS 14; arm64 và x86_64; người dùng không cần Node/Bun.
- Đọc `UsageSnapshot` schemaVersion 1; ccusage 20.0.34; không sửa MCP tools hoặc cách tính tiền hiện tại.
- Cập nhật mỗi 15 giây, timeout mỗi lần đọc 90 giây, chỉ một lần đọc đang chạy; tôn trọng TTL cache.
- Tiền là USD ước tính tương đương API; giá không xác định không thành 0; giữ dữ liệu cũ khi thất bại.
- App dùng `LSUIElement`, không cài daemon/LaunchAgent, không tự bật login item; không gọi shell để ghép câu lệnh.
- Artifact dưới `.artifacts/usage-menubar/`; không tự cài, publish hoặc thay plugin đang cài.
- Giữ nguyên thay đổi Usage đang có trong working tree; chỉ stage file thuộc tác vụ hoặc hunk mới được kiểm tra. Không dùng `git add .`.

## Review Focus

- Helper spawn tiến trình con giữ pipe: timeout/quit phải dọn cả nhóm tiến trình và hoàn tất tác vụ, không treo chờ EOF (Task 2).
- Đổi nguồn log lúc đang đọc: kết quả của nguồn cũ không được ghi đè nguồn mới (Task 3).
- Qua nửa đêm hoặc sleep lâu: số hôm trước không được hiện như số hôm nay còn mới (Tasks 1, 3).
- Mở từ Finder không có shell environment và đường dẫn có khoảng trắng: app dùng runtime trong bundle, nguồn mặc định hoặc nguồn đã chọn (Tasks 2, 4, 5).
- Login item bị hệ thống từ chối hoặc app chạy từ vị trí tạm: phản ánh trạng thái thật và lỗi, không hiện checkbox bật giả (Task 4).

## File Structure

`packages/usage-menubar/Package.swift` định nghĩa library `UsageCore`, executable `NoShortUsageMenuBar` và test target. Không thêm package Swift bên ngoài.

- `Sources/UsageCore/{Snapshot,Presentation,LogSource,SnapshotClient,RefreshController}.swift`: dữ liệu và logic kiểm thử được.
- `Sources/NoShortUsageMenuBar/{Main,AppDelegate,MenuBuilder,LoginItemManager,SnapshotWorker}.swift`: lifecycle và tích hợp macOS.
- `Tests/UsageCoreTests/{SnapshotTests,SnapshotClientTests,RefreshControllerTests,LogSourceTests}.swift`, `Fixtures/snapshot-v1.json`: kiểm thử logic và process.
- `Resources/Info.plist`, `scripts/{build,package,smoke}.ts`: bundle, build, đóng gói, xác thực artifact.
- `docs/no-short-usage-menubar.md`: cài đặt và bằng chứng kiểm chứng.
- Sửa có giới hạn `package.json`, `.gitignore`, `README.md`, `PRIVACY.md`, `.github/workflows/validate.yml`.

### Task 1: Snapshot model và quy tắc hiển thị

**Interfaces:** Produces `UsageSnapshot.decode(_ data: Data) throws -> UsageSnapshot`, `latestSession: SessionUsage?`, `UsagePresentation.make(snapshot: UsageSnapshot?, stale: Bool, loading: Bool, now: Date) -> UsagePresentation`, properties `statusTitle`, `tooltip`, `todayLines`, `monthLines`, `sessionLines`.

- [x] Viết `SnapshotTests` và fixture schema v1 từ adapter hiện tại, dùng dữ liệu tổng hợp, không copy log thật. Assertions: estimated 2.35 → `NS $2.35`; partial known 2.35 → `NS ≥$2.35`; unknown → `NS —`; chưa có snapshot/loading → `NS …`; empty hợp lệ → `NS $0.00`. Chọn main trước unknown, loại subagent, giữ thứ tự snapshot của adapter.
- [x] Chạy `swift test --package-path packages/usage-menubar --filter SnapshotTests`; xác nhận thất bại vì chưa có API.
- [x] Tạo package/model/formatter. Dùng `Double` hữu hạn không âm cho số liệu; kiểm tra schema/source/version và ngày hợp lệ. Decode cho phép field mới không liên quan, từ chối thiếu field bắt buộc, số âm, NaN và giá estimated thiếu amount. Giữ tương thích field tùy chọn của TypeScript.
- [x] Thêm assertions cho ready/empty/stale/error, snapshot hôm trước theo `snapshot.timeZone`, generatedAt quá 45 giây hoặc ở tương lai hơn 60 giây: cảnh báo dữ liệu cũ, không đổi giá unknown thành zero. Test tên Unicode dài và token lớn; nhãn token giữ input/output/cache read/cache write/total, không cộng reasoning lần nữa.
- [x] Chạy lại test; kỳ vọng PASS. Tạo executable entry tối thiểu chỉ để package compile, chưa khởi động status item.
- [x] Commit riêng package/model/tests: `feat: model menu bar usage snapshots`.

### Task 2: Snapshot client có giới hạn và hủy cả nhóm tiến trình

**Interfaces:** Produces protocol `SnapshotLoading: Sendable { func load(source: LogSource) async throws -> UsageSnapshot }`, `SnapshotClient(workerURL: URL, helperURL: URL, timeout: Duration = .seconds(90), maxOutputBytes: Int = 16_777_216)`, `LogSource` (Task 3 hoàn thiện persistence). Errors chuẩn hóa `SnapshotClientError` cho missingRuntime, launchFailed, timeout, outputTooLarge, invalidSnapshot, reportFailed và cancellation.

- [x] Viết process tests bằng executable fixture sinh tạm trong thư mục có khoảng trắng: snapshot hợp lệ, exit 3, JSON sai, stderr flood, stdout >16 MiB, sleep vượt timeout test 200ms, cancellation. Test ghi PID của child, sau timeout cả parent/child đều không tồn tại và load trả về trong 3 giây. Không dựa vào ccusage thật trong unit tests.
- [x] Chạy `swift test --package-path packages/usage-menubar --filter SnapshotClientTests`; xác nhận RED.
- [x] Implement `SnapshotClient` với Foundation `Process`, executable/arguments/env tách biệt, đọc cả pipe bất đồng bộ; stdout giới hạn 16 MiB, stderr giữ tối đa 64 KiB nhưng tiếp tục drain. Output lỗi không được đưa thẳng vào thông báo UI.
- [x] Implement nhánh private executable `--snapshot-worker <absolute-helper-path>` trước khởi động AppKit/single-instance. Worker tạo process group riêng, xuất một dòng handshake cố định `NO_SHORT_WORKER_READY`, rồi `execv` helper với `--snapshot`. Parent chỉ parse JSON sau handshake và chỉ gửi signal âm PID sau khi xác nhận nhóm riêng. Trước handshake, hủy chỉ nhắm worker; worker kiểm tra parent còn tồn tại trước exec. Timeout/hủy: TERM nhóm, đợi tối đa 500ms, KILL nhóm nếu còn; teardown pipe/continuation đúng một lần, kể cả launch failure và cancel đồng thời.
- [x] Thêm test cancel trước handshake và lỗi tạo nhóm: không signal nhóm của app/test runner; cleanup vẫn hoàn tất. Chạy toàn bộ process tests, xác nhận PASS và không còn PID fixture.
- [x] Commit client/worker/tests: `feat: load usage with bounded cancellable processes`.

### Task 3: Refresh controller và lựa chọn nguồn log

**Interfaces:** Consumes `SnapshotLoading`; produces `@MainActor RefreshController` với `refresh()`, `setSource(_:)`, `suspend()`, `resume()`, `stop()`, state `snapshot`, `isLoading`, `notice`, `isStale`, callback `onChange`. `LogSourceStore(defaults: UserDefaults, environment: [String:String], home: URL)` exposes `current`, `choose(_ url: URL)`, `reset()`; `LogSource` exposes `rootsEnvironment: String`, `displayName: String`.

- [x] Viết `RefreshControllerTests` với loader giả điều khiển continuation: hai refresh đồng thời chỉ load một lần; lỗi giữ snapshot cũ; error snapshot không thay last-good; suspend/stop cancel task; resume refresh ngay; kết quả generation cũ sau setSource không cập nhật UI. Inject `now` và refresh interval để kiểm tra 15 giây không sleep thật 15 giây.
- [x] Viết `LogSourceTests`: saved folder ưu tiên environment; nếu chưa lưu dùng CODEX_HOME không rỗng, nếu không dùng `~/.codex`; reset trở lại lựa chọn environment/default; thư mục Unicode/khoảng trắng được giữ nguyên; không ghi đè environment process cha. Dùng UserDefaults suite riêng và dọn sau test.
- [x] Chạy hai test filter, xác nhận RED, rồi implement controller và source store. Đổi nguồn xóa hiển thị nguồn cũ ngay và cancel lần đọc cũ; generation token chặn mọi callback muộn. Không lưu snapshot vào UserDefaults. Timer phải tiếp tục khi menu mở (common run-loop modes hoặc async clock).
- [x] Thêm test fake clock qua nửa đêm và wake sau 1 giờ: số cũ có cảnh báo cho đến khi nhận snapshot mới; sau stop không còn callback hoặc load. Chạy toàn bộ `swift test --package-path packages/usage-menubar`; kỳ vọng PASS.
- [x] Commit controller/source/tests: `feat: refresh menu bar usage independently of Codex`.

### Task 4: Menu native, lifecycle và login item

**Interfaces:** Consumes Tasks 1–3. `MenuBuilder.update(presentation: UsagePresentation, source: LogSource, isLoading: Bool, notice: String?, loginState: LoginItemState)` cập nhật menu giữ nguyên đối tượng khi đang mở; `LoginItemManaging` exposes `state`, `setEnabled(_ enabled: Bool) throws`, `openSettings()`; `LoginItemManager` dùng `SMAppService.mainApp`.

- [x] Viết test login-state mapping bằng service giả: enabled, notRegistered, requiresApproval, notFound, register/unregister failure. Assert checkbox dùng trạng thái hệ thống, lỗi không biến thành enabled; refresh state khi menu mở. Test callback menu source/reset/refresh/quit gọi đúng controller. Logic test nằm trong UsageCore nếu cần, adapter AppKit giữ mỏng.
- [x] Chạy test mới để xác nhận RED; implement Main/AppDelegate/MenuBuilder/LoginItemManager. Dùng NSStatusBar.system và NSMenu; LSUIElement; single instance kiểm tra bundle identifier qua NSRunningApplication. Duplicate chỉ activate instance cũ rồi exit, không cài runtime hay mở login item.
- [x] Hiển thị các dòng theo spec; dùng menu item disabled cho số liệu và tooltip đầy đủ; tên phiên rút gọn tối đa 60 Character, không cắt byte Unicode. Actions: làm mới, NSOpenPanel chọn đúng một thư mục, dùng nguồn mặc định, mở cùng macOS, mở cài đặt khi cần duyệt, thoát. Không có đường dẫn deep link giả vào panel Codex.
- [x] Kết nối workspace willSleep/didWake, terminate cleanup và thông báo lỗi đã chuẩn hóa. UI chỉ cập nhật main thread, không chạy process đồng bộ trong menu delegate. Nút refresh chống gọi chồng nhưng không chặn xem số liệu cũ.
- [x] Chạy Swift tests và debug build. Xác minh labels/accessibility, keyboard, light/dark trong lần chạy app thật ở Task 6.
- [x] Commit app/lifecycle/tests: `feat: add native usage menu and login item controls`.

### Task 5: App bundle và artifact cho hai kiến trúc

**Interfaces:** New root scripts `test:usage-menubar`, `build:usage-menubar`, `package:usage-menubar`, `smoke:usage-menubar`; build output `.artifacts/usage-menubar/{darwin-arm64,darwin-x64}/No Short Usage.app`; ZIP `.artifacts/usage-menubar/releases/no-short-usage-menubar-<version>-<platform>.zip`. Version lấy từ root package.json, không hardcode bản mới.

- [x] Viết artifact verification trong `scripts/smoke.ts`: Info.plist có CFBundleIdentifier `dev.noshort.usage.menubar`, CFBundleExecutable `NoShortUsageMenuBar`, LSUIElement=true, LSMinimumSystemVersion=14.0; executable và runtime tồn tại; `lipo -archs` đúng CPU; không symlink ra ngoài bundle; checksum runtime khớp manifest. Test với bundle fixture thiếu helper/sai checksum để xác nhận verifier fail.
- [x] Implement build.ts: kiểm tra runtime-manifest.version khớp package version; compile Swift target `arm64-apple-macosx14.0` và `x86_64-apple-macosx14.0`, dùng `xcrun --sdk macosx --show-sdk-path` và SDK flags khi cross-compile; copy executable/helper/ccusage/notices, sinh plist và icon từ asset thương hiệu hiện có nếu tương thích. Không đổi runtime manifest của Usage khi chỉ build Swift.
- [x] Ký từ trong ra ngoài. Nếu NO_SHORT_SIGN_IDENTITY tồn tại, ký runtime theo entitlements Usage hiện có rồi ký app hardened runtime; nếu không, ad-hoc. Verify `codesign --verify --deep --strict` và từng nested binary; ghi rõ signing mode, không tự gọi notarization.
- [x] Implement package.ts: chỉ ZIP các app đã qua smoke, dùng ditto giữ metadata; thêm hướng dẫn cài vào Applications. Bổ sung root scripts và ignore `packages/usage-menubar/.build/`, `.swiftpm/`.
- [x] Chạy `npm run build:usage-menubar`, `npm run smoke:usage-menubar`, `npm run package:usage-menubar`; kỳ vọng cả hai bundle pass static checks, helper --version/--snapshot chạy trên CPU hiện tại với PATH chỉ `/usr/bin:/bin:/usr/sbin:/sbin`. Test đường dẫn bundle có khoảng trắng, GUI launch không kế thừa CODEX_HOME và nguồn đã chọn vẫn dùng được.
- [x] Commit scripts/plist/root hunks liên quan: `build: package usage menu bar apps for macOS`.

### Task 6: Regression, chạy app thật và tài liệu

**Files:** Modify `.github/workflows/validate.yml`, `README.md`, `PRIVACY.md`; create `docs/no-short-usage-menubar.md`; update checklist này với bằng chứng ngắn.

- [x] Chạy `npm run validate`, `npm test`, `npm run typecheck:usage`, `npm run test:usage:browser` và Swift tests. Nếu fixture native Usage chưa có, build Usage đúng quy trình hiện tại trước; không bỏ qua lỗi chỉ vì working tree vốn có thay đổi.
- [x] Thêm các bước Swift test/build/smoke/package vào job macOS sau build runtime; upload ZIP app cùng artifact riêng. Không thêm Swift/AppKit vào job Linux. Chỉ ghi nhận CI thực chạy khi có kết quả remote; local checks không thay thế CI.
- [ ] Mở app arm64 thật từ artifact; quan sát status item/menu bằng UI tool nếu có. Đối chiếu today/month với helper --snapshot cùng source và TTL; refresh, đóng panel Codex và chờ cập nhật; mở app lần hai không tạo biểu tượng thứ hai; quit và relaunch. Không ghi số tiền riêng tư/tên phiên vào screenshot chia sẻ.
- [ ] Kiểm tra lỗi bằng bundle test copy thiếu helper và nguồn rỗng; app chính vẫn hoạt động. Kiểm tra menu light/dark/keyboard, đổi nguồn khi refresh. Test timeout process đã có ở Task 2, không cần làm hỏng log thật.
- [ ] Kiểm tra login toggle từ bản đặt ổn định nếu có thể: lưu trạng thái ban đầu, thử bật/tắt, quan sát System Settings, trả về trạng thái ban đầu. Không tự đăng xuất hoặc suspend máy đang dùng; nếu chưa thử đăng nhập lại/sleep thật, ghi rõ cần xác nhận. Không tuyên bố Gatekeeper, Intel vật lý hoặc máy sạch đã pass từ cross-build.
- [x] Viết docs EN theo tài liệu repo hiện tại: cài app tùy chọn và mở bằng Finder, source selection, dữ liệu ước tính, giới hạn khi Codex không ghi log, refresh/cancel/login, gỡ app/login item, signing và bảng local verified/unverified. Update README/PRIVACY về background scans chỉ khi app đang chạy, public pricing fetch và không telemetry.
- [x] Chạy `git diff --check`, các checks bị ảnh hưởng sau thay đổi cuối; ghi đường dẫn ZIP, số test và bằng chứng runtime thật. Commit hunks của tác vụ: `docs: verify and document usage menu bar app`. Không push hoặc tạo release.

## Self-review

- Mỗi phần của spec có task: snapshot/UI (1,4), child process/cancellation (2), schedule/source/cache (3), login/privacy (4,6), packaging/signing (5), regression/live proof (6).
- Các tên `UsageSnapshot`, `UsagePresentation`, `SnapshotLoading`, `LogSource`, `RefreshController`, `LoginItemState` được giữ xuyên các task; Swift types độc lập với TypeScript, cùng JSON contract.
- Review Focus được gắn test cụ thể ở Tasks 1–5. Không yêu cầu test mô phỏng từng dòng giao diện; native UI cần quan sát thật.
- Implemented Tasks 1–6 inline. Native UI attachment timed out, so visible menu, login registration and physical sleep/wake remain manual acceptance items; see verification table in docs/no-short-usage-menubar.md. Background live cache refresh and duplicate process prevention were verified.

## Final review and fix

Independent reviewer found one Important issue: successful reads could leave descendants after both pipes closed. Two process regressions failed before the fix and passed after all completion paths received bounded process-group cleanup. Final Swift suite: 24 tests; layout suite: 2 tests. No critical or minor findings. Native visual/login/sleep and physical-device acceptance items remain unverified as recorded in the companion documentation.
