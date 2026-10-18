import AppKit
import UsageCore

@MainActor final class MenuBuilder: NSObject, NSMenuDelegate {
    let menu = NSMenu()
    var onOpen: (() -> Void)?
    var onRefresh: (() -> Void)?
    var onChooseSource: (() -> Void)?
    var onResetSource: (() -> Void)?
    var onToggleLogin: (() -> Void)?
    var onOpenSettings: (() -> Void)?
    var onQuit: (() -> Void)?
    var onConfigureContextAlerts: (() -> Void)?
    private var today: [NSMenuItem] = []
    private var month: [NSMenuItem] = []
    private var session: [NSMenuItem] = []
    private var updated = NSMenuItem(), sourceItem = NSMenuItem(), noticeItem = NSMenuItem()
    private var contextAlertItem = NSMenuItem()
    private var refreshItem = NSMenuItem(), loginItem = NSMenuItem(), settingsItem = NSMenuItem()
    override init() {
        super.init(); menu.autoenablesItems = false; menu.delegate = self
        _ = line("No Short Usage")
        _ = line("Ước tính tương đương API · USD")
        _ = line("Không phải hóa đơn hoặc hạn mức ChatGPT")
        menu.addItem(.separator())
        today = (0..<4).map { _ in line("Đang đọc dữ liệu…") }
        menu.addItem(.separator()); month = [line("Tháng này: —")]
        menu.addItem(.separator()); session = [line("Phiên: —"), line("—")]
        menu.addItem(.separator())
        updated = line("Chưa cập nhật"); sourceItem = line("Nguồn: —"); noticeItem = line("")
        menu.addItem(.separator())
        refreshItem = action("Làm mới", #selector(refresh), key: "r")
        _ = action("Chọn thư mục log…", #selector(chooseSource))
        _ = action("Dùng nguồn log mặc định", #selector(resetSource))
        contextAlertItem = action("Ngưỡng cảnh báo context…", #selector(configureContextAlerts))
        loginItem = action("Mở cùng macOS", #selector(toggleLogin))
        settingsItem = action("Mở cài đặt Login Items…", #selector(openSettings))
        menu.addItem(.separator()); _ = action("Thoát No Short Usage", #selector(quit), key: "q")
    }
    private func line(_ text: String) -> NSMenuItem {
        let item = NSMenuItem(title: text, action: nil, keyEquivalent: "")
        item.isEnabled = false; menu.addItem(item); return item
    }
    private func action(_ text: String, _ selector: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: text, action: selector, keyEquivalent: key)
        item.target = self; item.isEnabled = true; menu.addItem(item); return item
    }
    private func put(_ text: String, in item: NSMenuItem, limit: Int = 80) {
        let clean = UsagePresentation.cleanTitle(text)
        item.title = clean.count > limit ? String(clean.prefix(limit)) + "…" : clean
        item.toolTip = clean
    }
    func update(presentation: UsagePresentation, source: LogSource, isLoading: Bool, notice: String?, loginState: LoginItemState, snapshot: UsageSnapshot?) {
        for (i, item) in today.enumerated() { put(presentation.todayLines.indices.contains(i) ? presentation.todayLines[i] : (i == 0 ? "Hôm nay: —" : ""), in: item); item.isHidden = i > 0 && presentation.todayLines.isEmpty }
        put(presentation.monthLines.first ?? "Tháng này: —", in: month[0])
        for (i, item) in session.enumerated() { put(presentation.sessionLines.indices.contains(i) ? presentation.sessionLines[i] : (i == 0 ? "Chưa có phiên chính" : ""), in: item, limit: i == 0 ? 60 : 80); item.isHidden = i > 0 && presentation.sessionLines.count < 2 }
        if let snapshot {
            let formatter = DateFormatter(); formatter.locale = Locale(identifier: "vi_VN")
            formatter.timeZone = TimeZone(identifier: snapshot.timeZone); formatter.dateFormat = "HH:mm:ss dd/MM/yyyy"
            put("Cập nhật: \(formatter.string(from: snapshot.generatedAt))", in: updated)
        } else { put("Chưa cập nhật", in: updated) }
        put("Nguồn: \(source.displayName)", in: sourceItem)
        let warning = notice ?? (presentation.statusTitle.contains("⚠") ? "⚠ Dữ liệu cũ · đang chờ cập nhật" : "")
        put(warning, in: noticeItem); noticeItem.isHidden = warning.isEmpty
        refreshItem.title = isLoading ? "Đang cập nhật…" : "Làm mới"; refreshItem.isEnabled = !isLoading
        switch loginState {
        case .enabled: loginItem.state = .on; loginItem.title = "Mở cùng macOS"
        case .requiresApproval: loginItem.state = .mixed; loginItem.title = "Mở cùng macOS · Cần phê duyệt"
        case .notRegistered: loginItem.state = .off; loginItem.title = "Mở cùng macOS"
        case .notFound: loginItem.state = .off; loginItem.title = "Mở cùng macOS · Chưa khả dụng"
        }
        settingsItem.isHidden = loginState != .requiresApproval && loginState != .notFound
    }
    func updateContextAlertThreshold(_ value: Int) {
        contextAlertItem.title = "Ngưỡng cảnh báo context: \(value)%…"
    }
    @objc private func configureContextAlerts() { onConfigureContextAlerts?() }
    func menuWillOpen(_ menu: NSMenu) { onOpen?() }
    @objc private func refresh() { onRefresh?() }
    @objc private func chooseSource() { onChooseSource?() }
    @objc private func resetSource() { onResetSource?() }
    @objc private func toggleLogin() { onToggleLogin?() }
    @objc private func openSettings() { onOpenSettings?() }
    @objc private func quit() { onQuit?() }
}
