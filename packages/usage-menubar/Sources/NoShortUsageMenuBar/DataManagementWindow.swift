import AppKit
import SwiftUI
import UsageCore

@MainActor final class DataManagementModel: ObservableObject {
    @Published var language: AppLanguage
    @Published private(set) var isBusy = false
    @Published private(set) var isConfirming = false
    @Published private(set) var result: CacheClearResult?
    @Published private(set) var errorKey: String?
    var onConfirm: (() -> Void)?
    private let environment: [String: String]
    private let onClear: () async throws -> CacheClearResult
    init(language: AppLanguage, environment: [String: String] = ProcessInfo.processInfo.environment,
         onClear: @escaping () async throws -> CacheClearResult) {
        self.language = language; self.environment = environment; self.onClear = onClear
    }
    func l(_ key: String, _ arguments: String...) -> String {
        AppLocalization(language: language).text(key, arguments: arguments)
    }
    var statusText: String? {
        if let errorKey { return l(errorKey) }
        if let result { return l("Đã xóa %@ tệp tạo tự động; giữ lại %@ mục khác.", String(result.removedFiles), String(result.retainedEntries)) }
        return nil
    }
    func requestClear() {
        guard !isBusy, !isConfirming else { return }
        isConfirming = true; onConfirm?()
    }
    func clear(confirmed: Bool) async {
        guard !isBusy, isConfirming else { return }
        isConfirming = false
        guard confirmed else { return }
        result = nil; errorKey = nil
        guard (environment["NO_SHORT_USAGE_CACHE_DIR"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorKey = "Không hỗ trợ NO_SHORT_USAGE_CACHE_DIR tùy chỉnh ở đây. Mở lại app không có biến này để quản lý cache mặc định."
            return
        }
        isBusy = true; defer { isBusy = false }
        do { result = try await onClear() }
        catch CacheMaintenanceError.busy { errorKey = "Cache đang bận. Đóng plugin Usage cũ, chờ bộ đọc hoàn tất rồi thử lại." }
        catch CacheMaintenanceError.unsafePath { errorKey = "Đường dẫn cache không an toàn hoặc có liên kết tượng trưng. Log nguồn và cài đặt không bị đổi; kiểm tra vị trí cache mặc định." }
        catch CacheMaintenanceError.protectedSource { errorKey = "Cache trùng với nguồn log được bảo vệ. Chọn nguồn log riêng trước khi xóa." }
        catch CacheMaintenanceError.cancelled { errorKey = Self.cancelledKey }
        catch is CancellationError { errorKey = Self.cancelledKey }
        catch { errorKey = "Không xóa được toàn bộ cache tạo tự động. Kiểm tra quyền thư mục rồi thử lại; log nguồn và cài đặt không bị đổi." }
    }
    private static let cancelledKey = "Đã hủy xóa cache. Một số tệp tạo tự động có thể đã bị xóa; log nguồn vẫn được giữ."
    static func protectedRoots(source: LogSource, home: URL = FileManager.default.homeDirectoryForCurrentUser) -> [URL] {
        let configured = (source.rootsEnvironment + "," + (source.claudeRootsEnvironment ?? ""))
            .split(separator: ",").map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
            .map { URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath) }
        return configured + [".codex", ".claude", ".config/claude"].map { home.appendingPathComponent($0) }
    }
}

struct DataManagementView: View {
    @ObservedObject var model: DataManagementModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(model.l("Quản lý dữ liệu")).font(.title2.bold())
                GroupBox(model.l("Cache dùng chung")) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(model.l("Cache chứa snapshot, metadata và tệp marker tạm, dùng chung với plugin MCP No Short Usage."))
                        Text("~/Library/Caches/no-short/usage").font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        Text(model.l("Xóa cache không đặt lại usage hay hóa đơn. Lần làm mới tiếp theo sẽ dựng lại ước tính từ log gốc được giữ lại."))
                        Text(model.l("Chỉ xóa tệp cache tạo tự động đã nhận diện; dữ liệu lạ được giữ lại. Không xóa log Codex/Claude, bản sao lưu, tùy chọn, hooks, context hay Login Items."))
                        Text(model.l("Đóng các plugin Usage phiên bản cũ trước khi xóa; chỉ runtime mới tuân theo khóa bảo trì dùng chung."))
                            .foregroundStyle(.secondary)
                        HStack {
                            Button(model.l("Xóa cache tạo tự động…")) { model.requestClear() }
                                .disabled(model.isBusy || model.isConfirming)
                            if model.isBusy { ProgressView().controlSize(.small); Text(model.l("Đang xóa cache…")) }
                        }
                        if let status = model.statusText {
                            Text(status).foregroundStyle(model.errorKey == nil ? Color.secondary : Color.orange)
                                .accessibilityIdentifier("cache-maintenance-status")
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(8)
                }
                GroupBox(model.l("Ngắt kết nối và gỡ ứng dụng")) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(model.l("1. Trong menu Cài đặt của panel, dùng Gỡ hooks theo dõi chat và Ngắt context Claude Code nếu đã kết nối."))
                        Text(model.l("2. Tắt Mở cùng macOS trong menu hiện có; nếu cần, kiểm tra Login Items trong Cài đặt hệ thống."))
                        Text(model.l("3. Thoát No Short Usage rồi chuyển ứng dụng khỏi Applications vào Thùng rác. Plugin MCP được quản lý riêng; xóa app không gỡ plugin."))
                        Text(model.l("Giữ nguyên log Codex/Claude, bản sao lưu và cấu hình bên thứ ba. Tùy chọn app được giữ lại; hướng dẫn này không tự thay đổi hoặc xóa tệp nào."))
                        Text("~/Library/Preferences/dev.noshort.usage.menubar.plist")
                            .font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(8)
                }
            }.font(.system(size: 12)).fixedSize(horizontal: false, vertical: true).padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
        }.background(Color(nsColor: .windowBackgroundColor)).environment(\.locale, model.language.locale)
    }
}

@MainActor final class DataManagementWindowController: NSWindowController {
    let model: DataManagementModel
    init(model: DataManagementModel) {
        self.model = model
        let window = NSWindow(contentViewController: UsageScrollHostingController(rootView: DataManagementView(model: model)))
        window.styleMask = [.titled, .closable, .resizable]; window.isReleasedWhenClosed = false
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 700, height: 760)
        let width = min(620, visible.width), height = min(720, visible.height)
        window.setFrame(NSRect(x: visible.midX - width / 2, y: visible.midY - height / 2, width: width, height: height), display: false)
        window.minSize = NSSize(width: min(400, width), height: min(340, height))
        super.init(window: window)
        model.onConfirm = { [weak self] in self?.confirmClear() }
    }
    required init?(coder: NSCoder) { nil }
    func present() {
        window?.title = model.l("Quản lý dữ liệu…")
        showWindow(nil); NSApp.activate(ignoringOtherApps: true); window?.makeKeyAndOrderFront(nil)
    }
    private func confirmClear() {
        guard let window else { Task { await model.clear(confirmed: false) }; return }
        let alert = NSAlert()
        alert.messageText = model.l("Xóa cache tạo tự động?")
        alert.informativeText = model.l("Đóng plugin Usage cũ trước khi tiếp tục. Cache dùng chung sẽ được dựng lại từ log gốc; usage và hóa đơn không bị đặt lại. Log, tùy chọn, cấu hình và bản sao lưu được giữ nguyên.")
        alert.alertStyle = .warning
        // Safe default and Escape both cancel; clearing requires choosing the second button.
        alert.addButton(withTitle: model.l("Hủy"))
        alert.addButton(withTitle: model.l("Xóa cache"))
        alert.beginSheetModal(for: window) { [weak self] response in
            Task { @MainActor [weak self] in await self?.model.clear(confirmed: response == .alertSecondButtonReturn) }
        }
    }
}
