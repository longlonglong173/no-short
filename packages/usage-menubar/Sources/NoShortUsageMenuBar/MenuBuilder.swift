import AppKit
import UsageCore

@MainActor final class MenuBuilder: NSObject, NSMenuDelegate {
    private var threshold = 70
    private var language: AppLanguage = .vietnamese
    private var localizedItems: [(NSMenuItem, String)] = []
    private var languageItems: [NSMenuItem] = []
    var onLanguageChange: ((AppLanguage) -> Void)?
    private func l(_ key: String, _ arguments: String...) -> String { AppLocalization(language: language).text(key, arguments: arguments) }
    let menu = NSMenu()
    var onOpen: (() -> Void)?
    var onRefresh: (() -> Void)?
    var onChooseSource: (() -> Void)?
    var onResetSource: (() -> Void)?
    var onToggleLogin: (() -> Void)?
    var onOpenSettings: (() -> Void)?
    var onQuit: (() -> Void)?
    var onAbout: (() -> Void)?
    var onHistory: (() -> Void)?
    var onPricing: (() -> Void)?
    var onBudgets: (() -> Void)?
    var onDataManagement: (() -> Void)?
    var onCheckUpdates: (() -> Void)?
    var onReleaseNotes: (() -> Void)?
    var onConfigureContextAlerts: (() -> Void)?
    private var today: [NSMenuItem] = []
    private var month: [NSMenuItem] = []
    private var session: [NSMenuItem] = []
    private var updated = NSMenuItem(), sourceItem = NSMenuItem(), noticeItem = NSMenuItem()
    private var checkUpdatesItem = NSMenuItem(), updateStatusItem = NSMenuItem()
    private var contextAlertItem = NSMenuItem()
    private var refreshItem = NSMenuItem(), loginItem = NSMenuItem(), settingsItem = NSMenuItem()
    override init() {
        super.init(); menu.autoenablesItems = false; menu.delegate = self
        _ = line("No Short Usage")
        _ = line(l("Ước tính tương đương API · USD"))
        _ = line(l("Không phải hóa đơn hoặc hạn mức ChatGPT"))
        menu.addItem(.separator())
        today = (0..<4).map { _ in line(l("Đang đọc dữ liệu…")) }
        menu.addItem(.separator()); month = [line(l("Tháng này: —"))]
        menu.addItem(.separator()); session = [line(l("Phiên: —")), line("—")]
        menu.addItem(.separator())
        updated = line(l("Chưa cập nhật")); sourceItem = line(l("Nguồn: —")); noticeItem = line("")
        menu.addItem(.separator())
        _ = action(l("Xem chi tiết…"), #selector(history))
        _ = action(l("Đơn giá…"), #selector(pricing))
        _ = action(l("Ngân sách…"), #selector(budgets))
        _ = action(l("Quản lý dữ liệu…"), #selector(dataManagement))
        refreshItem = action(l("Làm mới"), #selector(refresh), key: "r")
        _ = action(l("Chọn thư mục log…"), #selector(chooseSource))
        _ = action(l("Dùng nguồn log mặc định"), #selector(resetSource))
        contextAlertItem = action(l("Ngưỡng cảnh báo context…"), #selector(configureContextAlerts))
        loginItem = action(l("Mở cùng macOS"), #selector(toggleLogin))
        settingsItem = action(l("Mở cài đặt Login Items…"), #selector(openSettings))
        menu.addItem(.separator())
        _ = action(l("Giới thiệu No Short Usage…"), #selector(about))
        checkUpdatesItem = action(l("Kiểm tra bản cập nhật…"), #selector(checkUpdates))
        _ = action(l("Ghi chú phát hành…"), #selector(releaseNotes))
        updateStatusItem = line(l("Chưa kiểm tra bản cập nhật."))
        menu.addItem(.separator()); _ = action(l("Thoát No Short Usage"), #selector(quit), key: "q")
        localizedItems = menu.items.compactMap { AppLocalization.catalog[$0.title] == nil ? nil : ($0, $0.title) }
        let languages = NSMenuItem(title: "Ngôn ngữ", action: nil, keyEquivalent: "")
        let submenu = NSMenu(); languages.submenu = submenu
        for value in AppLanguage.allCases {
            let item = NSMenuItem(title: value.title, action: #selector(changeLanguage(_:)), keyEquivalent: "")
            item.target = self; item.representedObject = value.rawValue; submenu.addItem(item); languageItems.append(item)
        }
        menu.insertItem(languages, at: menu.items.count - 2); localizedItems.append((languages, "Ngôn ngữ"))
    }
    @objc private func changeLanguage(_ sender: NSMenuItem) {
        guard let code = sender.representedObject as? String, let value = AppLanguage(rawValue: code) else { return }
        onLanguageChange?(value)
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
    func update(presentation: UsagePresentation, source: LogSource, isLoading: Bool, notice: String?, loginState: LoginItemState, snapshot: UsageSnapshot?, language: AppLanguage = .vietnamese) {
        self.language = language
        for (item, key) in localizedItems { item.title = l(key) }
        for item in languageItems { item.state = (item.representedObject as? String) == language.rawValue ? .on : .off }
        for (i, item) in today.enumerated() { put(presentation.todayLines.indices.contains(i) ? presentation.todayLines[i] : (i == 0 ? l("Hôm nay: —") : ""), in: item); item.isHidden = i > 0 && presentation.todayLines.isEmpty }
        put(presentation.monthLines.first ?? l("Tháng này: —"), in: month[0])
        for (i, item) in session.enumerated() { put(presentation.sessionLines.indices.contains(i) ? presentation.sessionLines[i] : (i == 0 ? l("Chưa có phiên chính") : ""), in: item, limit: i == 0 ? 60 : 80); item.isHidden = i > 0 && presentation.sessionLines.count < 2 }
        if let snapshot {
            let formatter = DateFormatter(); formatter.locale = language.locale
            formatter.timeZone = TimeZone(identifier: snapshot.timeZone); formatter.setLocalizedDateFormatFromTemplate("HHmmssyyyyMMdd")
            put(l("Cập nhật: %@", String(formatter.string(from: snapshot.generatedAt))), in: updated)
        } else { put(l("Chưa cập nhật"), in: updated) }
        put(l("Nguồn: %@", String(source.displayName)), in: sourceItem)
        let warning = notice.map { l($0) } ?? (presentation.statusTitle.contains("⚠") ? l("⚠ Dữ liệu cũ · đang chờ cập nhật") : "")
        put(warning, in: noticeItem); noticeItem.isHidden = warning.isEmpty
        refreshItem.title = isLoading ? l("Đang cập nhật…") : l("Làm mới"); refreshItem.isEnabled = !isLoading
        switch loginState {
        case .enabled: loginItem.state = .on; loginItem.title = l("Mở cùng macOS")
        case .requiresApproval: loginItem.state = .mixed; loginItem.title = l("Mở cùng macOS · Cần phê duyệt")
        case .notRegistered: loginItem.state = .off; loginItem.title = l("Mở cùng macOS")
        case .notFound: loginItem.state = .off; loginItem.title = l("Mở cùng macOS · Chưa khả dụng")
        }
        updateContextAlertThreshold(threshold)
        settingsItem.isHidden = loginState != .requiresApproval && loginState != .notFound
    }
    func updateContextAlertThreshold(_ value: Int) {
        threshold = value
        contextAlertItem.title = l("Ngưỡng cảnh báo context: %@%…", String(value))
    }
    func updateAppReleaseStatus(_ presentation: AppUpdatePresentation, language: AppLanguage) {
        checkUpdatesItem.title=presentation.actionTitle(language:language)
        checkUpdatesItem.isEnabled=presentation.canCheck
        put(presentation.statusText(language:language),in:updateStatusItem)
    }
    func updateReleaseState(_ state: ManualUpdateState, language: AppLanguage) {
        // This path never touches usage loading or its warning row.
        let localization = AppLocalization(language: language)
        checkUpdatesItem.title = localization.text(state.isChecking ? "Đang kiểm tra bản cập nhật…" : "Kiểm tra bản cập nhật…")
        checkUpdatesItem.isEnabled = !state.isChecking
        put(state.localizedDescription(language: language), in: updateStatusItem)
    }
    @objc private func dataManagement() { onDataManagement?() }
    @objc private func pricing() { onPricing?() }
    @objc private func budgets() { onBudgets?() }
    @objc private func history() { onHistory?() }
    @objc private func about() { onAbout?() }
    @objc private func checkUpdates() { onCheckUpdates?() }
    @objc private func releaseNotes() { onReleaseNotes?() }
    @objc private func configureContextAlerts() { onConfigureContextAlerts?() }
    func menuWillOpen(_ menu: NSMenu) { onOpen?() }
    @objc private func refresh() { onRefresh?() }
    @objc private func chooseSource() { onChooseSource?() }
    @objc private func resetSource() { onResetSource?() }
    @objc private func toggleLogin() { onToggleLogin?() }
    @objc private func openSettings() { onOpenSettings?() }
    @objc private func quit() { onQuit?() }
}
