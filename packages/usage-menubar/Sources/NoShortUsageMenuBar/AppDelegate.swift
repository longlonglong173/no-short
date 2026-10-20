import AppKit
import SwiftUI
import UsageCore

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private func l(_ key: String, _ arguments: String...) -> String { AppLocalization(language: panelModel.language).text(key, arguments: arguments) }
    private var statusItem: NSStatusItem?
    private let menu = MenuBuilder(), login = LoginItemManager(), sources = LogSourceStore()
    private let panelModel = UsagePanelModel(defaults:.standard)
    private lazy var panel = UsagePopoverController(model: panelModel)
    private lazy var aboutModel = AboutModel(language: panelModel.language)
    private lazy var aboutWindow = AboutWindowController(model: aboutModel)
    private var historyWindow: UsageHistoryWindowController?
    private var controller: RefreshController!
    private var terminating = false
    private var contextSuspended = false
    private let contextReader = ContextReader()
    private lazy var contextNotifications = ContextNotificationService()
    private var diagnosticsTask: Task<Void, Never>?
    private var contextTask:Task<Void,Never>?
    private var contextKey:String?, contextSelection:String?
    private var activityMonitor:ActivityMonitor?
    private let activityStore = ActivityStore()
    func applicationDidFinishLaunching(_ notification: Notification) {
        let bundle = Bundle.main
        let helper = bundle.resourceURL!.appendingPathComponent("runtime/no-short-usage")
        let client = SnapshotClient(workerURL: bundle.executableURL!, helperURL: helper)
        controller = RefreshController(loader: client, source: sources.current)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem?.button?.target = self
        statusItem?.button?.action = #selector(toggleUsagePanel)
        statusItem?.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        statusItem?.button?.setAccessibilityLabel("No Short Usage")
        controller.onChange = { @MainActor @Sendable [weak self] in self?.render() }
        menu.onLanguageChange = { [weak self] in self?.panelModel.setLanguage($0) }
        panelModel.onLanguageChange = { [weak self] in self?.render() }
        menu.onOpen = { [weak self] in self?.render(); self?.controller.refresh() }
        menu.onRefresh = { [weak self] in self?.controller.refresh() }
        menu.onChooseSource = { [weak self] in self?.chooseSource() }
        menu.onResetSource = { [weak self] in guard let self else { return }; self.sources.reset(); self.controller.setSource(self.sources.current); self.startMonitoring() }
        menu.onToggleLogin = { [weak self] in self?.toggleLogin() }
        menu.onOpenSettings = { [weak self] in self?.login.openSettings() }
        menu.onConfigureContextAlerts = { [weak self] in self?.configureContextAlertThreshold() }
        menu.onQuit = { NSApp.terminate(nil) }
        menu.onAbout = { [weak self] in self?.showAbout() }
        menu.onHistory = { [weak self] in self?.showHistory() }
        menu.onCheckUpdates = { [weak self] in self?.showAbout(check: true) }
        menu.onReleaseNotes = { [weak self] in self?.openReleaseNotes() }
        aboutModel.onChange = { [weak self] in
            guard let self else { return }
            menu.updateReleaseState(aboutModel.state, language: panelModel.language)
        }
        panelModel.onSelectionChange = { [weak self] in self?.render() }
        panelModel.onRefresh = { [weak self] in self?.controller.refresh() }
        panelModel.onChooseSource = { [weak self] in self?.chooseSource() }
        panelModel.onResetSource = { [weak self] in
            guard let self else { return }; self.sources.reset(); self.controller.setSource(self.sources.current); self.startMonitoring()
        }
        panelModel.onToggleLogin = { [weak self] in self?.toggleLogin() }
        panelModel.onOpenSettings = { [weak self] in self?.login.openSettings() }
        panelModel.onQuit = { NSApp.terminate(nil) }
        panelModel.onAbout = { [weak self] in self?.showAbout() }
        panelModel.onHistory = { [weak self] in self?.showHistory() }
        panelModel.onCheckUpdates = { [weak self] in self?.showAbout(check: true) }
        panelModel.onReleaseNotes = { [weak self] in self?.openReleaseNotes() }
        panelModel.onChooseClaudeSource = { [weak self] in self?.chooseSource(claude:true) }
        panelModel.onResetClaudeSource = { [weak self] in
            guard let self else { return }; self.sources.resetClaude(); self.controller.setSource(self.sources.current); self.startMonitoring()
        }
        panelModel.onConnectClaudeContext = { [weak self] in self?.configureClaudeContext(remove:false) }
        panelModel.onRemoveClaudeContext = { [weak self] in self?.configureClaudeContext(remove:true) }
        panelModel.onInstallHooks = { [weak self] in self?.configureHooks(remove:false) }
        panelModel.onRemoveHooks = { [weak self] in self?.configureHooks(remove:true) }
        panelModel.onConfigureContextAlerts = { [weak self] in self?.configureContextAlertThreshold() }
        panelModel.onContextAlertSettingsChange = { [weak self] in self?.render() }
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(willSleep), name: NSWorkspace.willSleepNotification, object: nil)
        center.addObserver(self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
        startMonitoring(); render(); controller.resume()
        if CommandLine.arguments.contains("--show-panel") { showPanel() }
    }
    private func render() {
        let presentation = UsagePresentation.make(snapshot: controller.snapshot, stale: controller.isStale, loading: controller.isLoading, now: Date(), language: panelModel.language)
        panelModel.update(snapshot: controller.snapshot, source: controller.source.displayName, isLoading: controller.isLoading, isStale: controller.isStale, notice: controller.notice, loginState: login.state)
        panelModel.applyActivities(activityStore.events())
        historyWindow?.update(snapshot: controller.snapshot, source: controller.source.displayName,
            isLoading: controller.isLoading, isStale: controller.isStale, notice: controller.notice, language: panelModel.language)
        refreshDiagnostics()
        refreshContexts()
        deliverContextAlerts()
        if panel.popover.isShown { panel.updateSize() }
        if let button = statusItem?.button { StatusItemRenderer.apply(to:button,model:panelModel) }
        statusItem?.button?.toolTip = l("%@\n%@\n%@ USD · Ước tính API\n%@\n%@\nHôm nay: %@ · Tháng này: %@", String(panelModel.selectionLabel), String(panelModel.activityLabel), String(panelModel.mainCost), String(panelModel.tokenTooltip), String(panelModel.contextTooltip), String(panelModel.todayCost), String(panelModel.monthCost))
        if aboutModel.language != panelModel.language { aboutModel.language = panelModel.language }
        menu.updateContextAlertThreshold(panelModel.contextAlertThreshold)
        menu.update(presentation: presentation, source: controller.source, isLoading: controller.isLoading, notice: controller.notice, loginState: login.state, snapshot: controller.snapshot, language: panelModel.language)
        menu.updateReleaseState(aboutModel.state, language: panelModel.language)
    }
    private func refreshDiagnostics() {
        diagnosticsTask?.cancel()
        guard let executable = Bundle.main.executableURL else { return }
        let source = controller.source, snapshot = controller.snapshot, stale = controller.isStale, notice = controller.notice
        let custom = Set(UsageProvider.allCases.filter { sources.hasSelection(provider: $0) })
        let activities = activityStore.events(maximumAge: nil), configurations = HookInstaller.configurationFiles()
        let contextDirectory = ClaudeContextStore().directory
        diagnosticsTask = Task { [weak self] in
            let values = await Task.detached(priority: .utility) {
                ConnectionDiagnostics.scan(source: source, customSources: custom, configurations: configurations, executable: executable,
                    snapshot: snapshot, stale: stale, notice: notice, activities: activities, contextDirectory: contextDirectory)
            }.value
            guard let self, !Task.isCancelled, !self.terminating else { return }
            self.panelModel.updateDiagnostics(values)
        }
    }
    private func refreshContexts() {
        guard !contextSuspended, !terminating else { return }
        let sessions=panelModel.contextSessionIDs, source=controller.source
        let selection = source.displayName + sessions.sorted { $0.key.rawValue < $1.key.rawValue }.map { "|\($0.key.rawValue):\($0.value)" }.joined()
        let key = selection + "|" + String(panelModel.snapshot?.generatedAt.timeIntervalSince1970 ?? 0)
        guard contextKey != key else { return }
        contextKey=key; contextTask?.cancel()
        if contextSelection != selection { contextSelection=selection; panelModel.updateContexts([:]) }
        contextTask=Task { [weak self,contextReader] in
            var values:[UsageProvider:ContextReading] = [:]
            for (provider,id) in sessions {
                if Task.isCancelled { return }
                if let reading = await contextReader.read(provider:provider,sessionID:id,source:source) { values[provider]=reading }
            }
            guard let self, !Task.isCancelled, self.contextKey == key, !self.contextSuspended, !self.terminating else { return }
            self.panelModel.updateContexts(values); self.render()
        }
    }
    private func deliverContextAlerts() {
        let alerts = panelModel.consumeContextAlerts(), source = panelModel.source
        guard !alerts.isEmpty else { return }
        Task { [weak self] in
            guard let self else { return }
            do {
                guard try await contextNotifications.authorize() else {
                    panelModel.connectionNotice = ("Thông báo macOS chưa được cho phép. Bật No Short Usage trong Cài đặt hệ thống → Thông báo; cảnh báo trong panel vẫn hoạt động.")
                    if panel.popover.isShown { panel.updateSize() }
                    return
                }
                for alert in alerts {
                    guard !terminating, panelModel.contextNotificationsEnabled, panelModel.source == source,
                          let current = panelModel.activeContextAlerts.first(where:{ $0.provider == alert.provider && $0.reading.sessionID == alert.reading.sessionID }) else { continue }
                    try await contextNotifications.send(current)
                }
            } catch {
                panelModel.connectionNotice = ("Không gửi được thông báo macOS. Cảnh báo trong panel vẫn hoạt động; kiểm tra quyền Thông báo trong Cài đặt hệ thống.")
                if panel.popover.isShown { panel.updateSize() }
            }
        }
    }
    private func showHistory() {
        panel.close()
        DispatchQueue.main.async { [weak self] in
            guard let self, !terminating else { return }
            if historyWindow == nil {
                let model = UsageHistoryModel(provider: panelModel.providerFilter, language: panelModel.language)
                model.onRefresh = { [weak self] in self?.controller.refresh() }
                historyWindow = UsageHistoryWindowController(model: model)
            }
            historyWindow?.update(snapshot: controller.snapshot, source: controller.source.displayName,
                isLoading: controller.isLoading, isStale: controller.isStale, notice: controller.notice, language: panelModel.language)
            historyWindow?.present()
        }
    }
    private func showAbout(check: Bool = false) {
        panel.close()
        // Let the SwiftUI/NSMenu action and transient popover finish dismissing.
        // AppDelegate retains both the window and update state throughout.
        DispatchQueue.main.async { [weak self] in
            guard let self, !terminating else { return }
            aboutModel.language = panelModel.language
            aboutWindow.present()
            if check { Task { await self.aboutModel.check() } }
        }
    }
    private func openReleaseNotes() {
        panel.close()
        DispatchQueue.main.async { [weak self] in
            guard let self, !terminating else { return }
            NSWorkspace.shared.open(aboutModel.releaseNotesURL)
        }
    }
    private func configureContextAlertThreshold() {
        panel.close()
        let alert = NSAlert()
        alert.messageText = l("Ngưỡng cảnh báo context")
        alert.informativeText = l("Nhập phần trăm từ 1 đến 100 (mặc định 70). Icon chuyển đỏ khi context chạm ngưỡng.")
        let input = NSTextField(string:"\(panelModel.contextAlertThreshold)")
        input.frame = NSRect(x:0,y:0,width:240,height:24)
        input.setAccessibilityLabel(l("Ngưỡng context (%)"))
        alert.accessoryView = input
        alert.addButton(withTitle:l("Lưu")); alert.addButton(withTitle:l("Hủy"))
        alert.window.initialFirstResponder = input
        NSApp.activate(ignoringOtherApps:true)
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        guard let value = Int(input.stringValue.trimmingCharacters(in:.whitespacesAndNewlines)), (1...100).contains(value) else {
            showError(l("Ngưỡng context phải là số nguyên từ 1 đến 100.")); return
        }
        panelModel.setContextAlertThreshold(value)
    }
    private func configureClaudeContext(remove:Bool) {
        guard let executable=Bundle.main.executableURL else { return }
        let installer=ClaudeContextInstaller(executable:executable)
        do {
            for (path,provider) in HookInstaller.configurationFiles() where provider == .claude {
                if remove { try installer.remove(at:path) } else { try installer.install(at:path) }
            }
            panelModel.connectionNotice = remove ? ("Đã ngắt bộ thu context Claude Code.") : ("Đã kết nối context Claude Code. Status line sẽ gửi số liệu khi phiên cập nhật.")
        } catch let error as ClaudeContextInstallationError { panelModel.connectionNotice=error.localizedDescription }
        catch { panelModel.connectionNotice=("Không cập nhật được status line Claude Code. Kiểm tra quyền đọc/ghi cấu hình.") }
        contextKey=nil; render()
    }
    @objc private func toggleUsagePanel(_ sender: Any?) {
        guard let button = statusItem?.button else { return }
        if NSApp.currentEvent?.type == .rightMouseUp {
            panel.close()
            render()
            menu.menu.popUp(positioning: nil, at: NSPoint(x: button.bounds.minX, y: button.bounds.minY), in: button)
        } else { showPanel() }
    }
    private func showPanel() {
        guard let button = statusItem?.button else { return }
        render(); controller.refresh(); panel.toggle(relativeTo: button)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !panel.popover.isShown { showPanel() }
        return true
    }
    private func chooseSource(claude:Bool = false) {
        panel.close()
        let provider: UsageProvider = claude ? .claude : .codex
        let model = LogSourcesEditorModel(store: sources, provider: provider, language: panelModel.language)
        let alert = NSAlert()
        alert.messageText = claude ? l("Nguồn log Claude Code") : l("Nguồn log Codex")
        alert.addButton(withTitle: l("Lưu")); alert.addButton(withTitle: l("Hủy"))
        let host = NSHostingView(rootView: LogSourcesEditorView(model: model, onAdd: { [weak self] in
            guard let self else { return }
            let picker = NSOpenPanel(); picker.canChooseDirectories = true; picker.canChooseFiles = false
            picker.allowsMultipleSelection = true; picker.canCreateDirectories = false
            picker.prompt = self.l("Chọn"); picker.showsHiddenFiles = true
            picker.title = claude ? self.l("Chọn thư mục Claude Code chứa projects") : self.l("Chọn thư mục Codex home chứa sessions")
            if picker.runModal() == .OK { model.add(picker.urls) }
        }))
        host.frame = NSRect(x: 0, y: 0, width: 520, height: 340)
        alert.accessoryView = host
        NSApp.activate(ignoringOtherApps: true)
        while alert.runModal() == .alertFirstButtonReturn {
            if model.save() { controller.setSource(sources.current); startMonitoring(); return }
        }
    }
    private func startMonitoring() {
        activityMonitor?.stop()
        let source = sources.current
        let roots = (source.rootsEnvironment + "," + (source.claudeRootsEnvironment ?? "")).split(separator:",").map(String.init)
        activityMonitor = ActivityMonitor(store:activityStore,roots:roots,onActivity:{ [weak self] values in
            guard let self else { return }; self.panelModel.applyActivities(values); self.render()
        },onLogChange:{ [weak self] in self?.controller.refresh() })
        activityMonitor?.start()
    }
    private func configureHooks(remove:Bool) {
        guard let executable = Bundle.main.executableURL else { return }
        let installer = HookInstaller(executable:executable)
        do {
            for (config,provider) in HookInstaller.configurationFiles() {
                if remove { try installer.remove(at:config) } else { try installer.install(at:config,provider:provider) }
            }
            panelModel.connectionNotice = remove ? ("Đã gỡ hooks Usage. Có thể bật lại trong Cài đặt.") : ("Đã cấu hình hooks. Codex: mở /hooks để tin cậy. Claude Code: mở lại phiên để nạp hooks.")
            UserDefaults.standard.set(!remove,forKey:"usageHooksConfigured")
        } catch { panelModel.connectionNotice = ("Không cấu hình được hooks. Kiểm tra tệp cấu hình hiện có; tệp chưa hợp lệ được giữ nguyên.") }
        render()
    }
    private func toggleLogin() {
        do { try login.setEnabled(login.state != .enabled && login.state != .requiresApproval) }
        catch { showError(l("Không thay đổi được Login Items. Hãy đặt ứng dụng trong Applications và kiểm tra cài đặt macOS.")) }
        render()
    }
    private func showError(_ message: String) {
        let alert = NSAlert(); alert.messageText = "No Short Usage"; alert.informativeText = message
        alert.alertStyle = .warning; NSApp.activate(ignoringOtherApps: true); alert.runModal()
    }
    @objc private func willSleep(_ notification: Notification) { contextSuspended=true; contextTask?.cancel(); contextKey=nil; panel.close(); activityMonitor?.stop(); controller.suspend() }
    @objc private func didWake(_ notification: Notification) { contextSuspended=false; startMonitoring(); controller.resume() }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !terminating, let controller else { return terminating ? .terminateLater : .terminateNow }
        terminating = true; diagnosticsTask?.cancel(); contextTask?.cancel(); panel.close(); activityMonitor?.stop()
        Task { await controller.shutdown(); sender.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }
    func applicationWillTerminate(_ notification: Notification) {
        NSWorkspace.shared.notificationCenter.removeObserver(self)
        if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
    }
}
