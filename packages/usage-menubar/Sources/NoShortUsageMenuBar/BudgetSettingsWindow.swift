import AppKit
import SwiftUI
import UsageCore

enum BudgetSettingsError: Error { case invalid }
struct BudgetDraftRow: Identifiable {
    let provider: String
    var day = "", month = ""
    var id: String { provider }
}
@MainActor final class BudgetSettingsModel: ObservableObject {
    @Published var rows: [BudgetDraftRow] = []
    @Published var notificationsEnabled = false
    @Published var anomalyEnabled = false
    @Published var scenarioEnabled = false
    @Published var insightNotificationsEnabled = false
    @Published var insightProvider = "all"
    let insights: InsightsController?
    @Published var language: AppLanguage
    @Published private(set) var isSaving = false
    @Published private(set) var errorKey: String?
    var onClose: (() -> Void)?
    private let controller: BudgetController
    init(controller: BudgetController, language: AppLanguage, insights: InsightsController? = nil) { self.controller = controller; self.language = language; self.insights = insights }
    func l(_ key: String) -> String { AppLocalization(language: language).text(key) }
    func beginEditing() {
        rows = ["all", "codex", "claude"].map { provider in
            BudgetDraftRow(provider: provider,
                day: controller.rules.first { $0.provider == provider && $0.period == .day }.map { String($0.limitUSD) } ?? "",
                month: controller.rules.first { $0.provider == provider && $0.period == .month }.map { String($0.limitUSD) } ?? "")
        }
        notificationsEnabled = controller.notificationsEnabled; errorKey = nil
        anomalyEnabled = insights?.anomalyEnabled ?? false; scenarioEnabled = insights?.scenarioEnabled ?? false
        insightNotificationsEnabled = insights?.notificationsEnabled ?? false; insightProvider = insights?.provider ?? "all"
    }
    func cancel() { guard !isSaving else { return }; beginEditing(); onClose?() }
    @discardableResult func save() async -> Bool {
        guard !isSaving else { return false }
        var rules: [UsageBudgetRule] = []
        do {
            for row in rows {
                for (period, input) in [(UsageBudgetPeriod.day, row.day), (.month, row.month)] {
                    let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
                    if text.isEmpty { continue }
                    guard let amount = Double(text) else { throw BudgetSettingsError.invalid }
                    rules.append(try UsageBudgetRule(provider: row.provider, period: period, limitUSD: amount))
                }
            }
            let insightEnabling = insightNotificationsEnabled && insights?.notificationsEnabled == false
            let enabling = notificationsEnabled && !controller.notificationsEnabled
            try controller.apply(rules: rules, notificationsEnabled: notificationsEnabled)
            insights?.apply(anomalyEnabled: anomalyEnabled, scenarioEnabled: scenarioEnabled, notificationsEnabled: insightNotificationsEnabled, provider: insightProvider)
            isSaving = true; defer { isSaving = false }
            if enabling { await controller.authorizeFromExplicitEnable() }
            if insightEnabling { await insights?.authorizeFromExplicitEnable() }
            errorKey = nil; onClose?(); return true
        } catch {
            errorKey = "Nhập ngân sách USD hữu hạn lớn hơn 0, hoặc để trống để tắt."
            return false
        }
    }
}
struct BudgetSettingsView: View {
    @ObservedObject var model: BudgetSettingsModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(model.l("Ngân sách API ước tính")).font(.title2.bold())
                Text(model.l("Ngân sách theo log trên máy, không phải hóa đơn hoặc hạn mức tài khoản. USD dùng dấu chấm, ví dụ 10.50; để trống để tắt."))
                    .font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                ForEach($model.rows) { $row in
                    GroupBox(row.provider == "all" ? model.l("Tất cả") : row.provider == "codex" ? "Codex" : "Claude Code") {
                        HStack(spacing: 16) {
                            VStack(alignment: .leading) {
                                Text(model.l("Ngân sách ngày (USD)"))
                                TextField("10.50", text: $row.day).accessibilityLabel(model.l("Ngân sách ngày (USD)"))
                            }
                            VStack(alignment: .leading) {
                                Text(model.l("Ngân sách tháng (USD)"))
                                TextField("100.50", text: $row.month).accessibilityLabel(model.l("Ngân sách tháng (USD)"))
                            }
                        }.font(.system(size: 12)).textFieldStyle(.roundedBorder).padding(8)
                    }
                }
                Toggle(model.l("Bật thông báo ngân sách macOS (tùy chọn)"), isOn: $model.notificationsEnabled)
                Text(model.l("Chỉ yêu cầu quyền khi Lưu để bật thông báo. Cảnh báo trong app vẫn hoạt động khi không có quyền."))
                    .font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                if model.insights != nil {
                    Divider()
                    Text(model.l("Bất thường và kịch bản tháng")).font(.headline)
                    Toggle(model.l("Bật cảnh báo mức dùng bất thường"), isOn: $model.anomalyEnabled)
                    Toggle(model.l("Bật kịch bản chi phí cuối tháng"), isOn: $model.scenarioEnabled)
                    Picker(model.l("Công cụ cho cảnh báo bất thường"), selection: $model.insightProvider) {
                        Text(model.l("Tất cả")).tag("all"); Text("Codex").tag("codex"); Text("Claude Code").tag("claude")
                    }
                    Toggle(model.l("Bật thông báo bất thường macOS (tùy chọn)"), isOn: $model.insightNotificationsEnabled)
                    Text(model.l("Cần 7 ngày có quan sát trong 30 ngày trước hôm nay.")).font(.system(size: 11))
                    Text(model.l("Dùng 7 ngày quan sát gần nhất; nếu một ngày thiếu giá thì chưa đủ căn cứ. Không chèn ngày trống thành $0.")).font(.system(size: 11)).fixedSize(horizontal: false, vertical: true)
                    Text(model.l("Giả định usage mỗi ngày tới giống 7 ngày quan sát. Đây là kịch bản, không phải dự đoán hóa đơn.")).font(.system(size: 11)).fixedSize(horizontal: false, vertical: true)
                }
                if let key = model.errorKey { Text(model.l(key)).font(.system(size: 12)).foregroundStyle(.red) }
                HStack {
                    Spacer()
                    Button(model.l("Hủy")) { model.cancel() }.keyboardShortcut(.cancelAction)
                    Button(model.l("Lưu")) { Task { @MainActor in await model.save() } }.keyboardShortcut(.defaultAction)
                }
            }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
        }.disabled(model.isSaving)
            .background(Color(nsColor: .windowBackgroundColor))
            .environment(\.locale, model.language.locale)
    }
}
@MainActor final class BudgetSettingsWindowController: NSWindowController {
    let model: BudgetSettingsModel
    init(model: BudgetSettingsModel) {
        self.model = model
        let window = NSWindow(contentViewController: UsageScrollHostingController(rootView: BudgetSettingsView(model: model)))
        window.styleMask = [.titled, .closable, .resizable]
        window.isReleasedWhenClosed = false
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 640, height: 700)
        let width = min(560, visible.width), height = min(600, visible.height)
        window.setFrame(NSRect(x: visible.midX - width / 2, y: visible.midY - height / 2, width: width, height: height), display: false)
        window.minSize = NSSize(width: min(400, width), height: min(340, height))
        super.init(window: window)
        model.onClose = { [weak self] in self?.close() }
    }
    required init?(coder: NSCoder) { nil }
    func present() {
        model.beginEditing(); window?.title = model.l("Ngân sách…")
        showWindow(nil); NSApp.activate(ignoringOtherApps: true); window?.makeKeyAndOrderFront(nil)
    }
}
