import AppKit
import SwiftUI
import UsageCore

struct PricingDraftRow: Identifiable {
    let id = UUID()
    var provider = "codex", model = "", input = "0", output = "0", cacheRead = "0", cacheWrite = "0"
    init(_ rule: PriceOverride? = nil) {
        if let rule {
            provider = rule.provider; model = rule.model
            input = String(rule.input); output = String(rule.output); cacheRead = String(rule.cacheRead); cacheWrite = String(rule.cacheWrite)
        }
    }
}
@MainActor final class PricingSettingsModel: ObservableObject {
    @Published var rows: [PricingDraftRow] = []
    @Published var language: AppLanguage
    @Published private(set) var errorKey: String?
    @Published private(set) var updatedAt: String?
    var onClose: (() -> Void)?
    var onSave: (() -> Void)?
    private var loadFailed = false
    private let store: PricingConfigStore
    init(store: PricingConfigStore = .init(), language: AppLanguage) { self.store = store; self.language = language }
    func l(_ key: String) -> String { AppLocalization(language: language).text(key) }
    func beginEditing() {
        do {
            let config = try store.load(); rows = config.overrides.map(PricingDraftRow.init)
            updatedAt = config.updatedAt; loadFailed = false; errorKey = nil
        } catch {
            rows = []; updatedAt = nil; loadFailed = true
            errorKey = "Không đọc được cấu hình đơn giá. Chọn Khôi phục mặc định rồi Lưu để thay cấu hình lỗi."
        }
    }
    func addRow() { guard rows.count < 512 else { return }; rows.append(.init()) }
    func resetAll() { rows = []; loadFailed = false; errorKey = nil }
    func cancel() { beginEditing(); onClose?() }
    @discardableResult func save() -> Bool {
        guard !loadFailed else { return false }
        do {
            let rules = try rows.map { row -> PriceOverride in
                guard let input = Double(row.input), let output = Double(row.output),
                      let read = Double(row.cacheRead), let write = Double(row.cacheWrite) else { throw PricingConfigError.invalid }
                return .init(provider: row.provider, model: row.model, input: input, output: output, cacheRead: read, cacheWrite: write)
            }
            try store.save(rules); errorKey = nil; onSave?(); onClose?(); return true
        } catch {
            errorKey = "Không lưu được đơn giá. Kiểm tra quyền ghi, model không trùng và bốn mức USD hữu hạn ≥ 0."
            return false
        }
    }
}
struct PricingSettingsView: View {
    @ObservedObject var model: PricingSettingsModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(model.l("Đơn giá tùy chỉnh")).font(.title2.bold())
                Text(model.l("USD trên 1 triệu token. Nhập đúng tên model và công cụ; 0 là giá miễn phí do bạn đặt, không phải giá chưa biết."))
                    .font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                Text(model.l("Có giá tùy chỉnh: lịch sử được tính lại theo cấu hình hiện tại, không phải giá tại thời điểm sử dụng."))
                    .font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if let updatedAt = model.updatedAt { Text(model.l("Cấu hình cập nhật") + ": " + updatedAt).font(.system(size: 11)).foregroundStyle(.secondary) }
                ForEach($model.rows) { $row in
                    GroupBox {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Picker(model.l("Công cụ"), selection: $row.provider) { Text("Codex").tag("codex"); Text("Claude Code").tag("claude") }.frame(width: 170)
                                TextField(model.l("Tên model chính xác"), text: $row.model)
                                    .accessibilityLabel(model.l("Tên model chính xác"))
                            }
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 125))], alignment: .leading, spacing: 12) {
                                rate("Input", text: $row.input); rate("Output", text: $row.output)
                                rate("Cache read", text: $row.cacheRead); rate("Cache write", text: $row.cacheWrite)
                            }
                            Button(model.l("Dùng giá mặc định cho model này")) { model.rows.removeAll { $0.id == row.id } }
                                .font(.system(size: 11))
                        }.textFieldStyle(.roundedBorder).padding(8)
                    }
                }
                if model.rows.isEmpty { Text(model.l("Không có giá tùy chỉnh; dùng giá theo báo cáo ccusage.")).foregroundStyle(.secondary) }
                HStack {
                    Button(model.l("Thêm model")) { model.addRow() }.disabled(model.rows.count >= 512)
                    Button(model.l("Khôi phục mặc định")) { model.resetAll() }
                }
                Text(model.l("Các thay đổi chỉ có hiệu lực khi Lưu. Khôi phục hoặc Hủy không xóa log gốc."))
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                if let key = model.errorKey { Text(model.l(key)).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true) }
                HStack { Spacer(); Button(model.l("Hủy")) { model.cancel() }.keyboardShortcut(.cancelAction)
                    Button(model.l("Lưu")) { model.save() }.keyboardShortcut(.defaultAction) }
            }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
        }.background(Color(nsColor: .windowBackgroundColor)).environment(\.locale, model.language.locale)
    }
    private func rate(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.l(title)).font(.system(size: 11))
            TextField("0.00", text: text).accessibilityLabel(model.l(title) + " USD/1M")
        }
    }
}
@MainActor final class PricingSettingsWindowController: NSWindowController {
    let model: PricingSettingsModel
    init(model: PricingSettingsModel) {
        self.model = model
        let window = NSWindow(contentViewController: UsageScrollHostingController(rootView: PricingSettingsView(model: model)))
        window.styleMask = [.titled, .closable, .resizable]; window.isReleasedWhenClosed = false
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 640, height: 700)
        let width = min(660, visible.width), height = min(650, visible.height)
        window.setFrame(NSRect(x: visible.midX - width / 2, y: visible.midY - height / 2, width: width, height: height), display: false)
        window.minSize = NSSize(width: min(420, width), height: min(340, height))
        super.init(window: window); model.onClose = { [weak self] in self?.close() }
    }
    required init?(coder: NSCoder) { nil }
    func present() {
        model.beginEditing(); window?.title = model.l("Đơn giá…")
        showWindow(nil); NSApp.activate(ignoringOtherApps: true); window?.makeKeyAndOrderFront(nil)
    }
}
