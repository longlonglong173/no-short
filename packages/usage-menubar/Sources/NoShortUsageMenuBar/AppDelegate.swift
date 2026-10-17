import AppKit
import UsageCore

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private let menu = MenuBuilder(), login = LoginItemManager(), sources = LogSourceStore()
    private let panelModel = UsagePanelModel(defaults:.standard)
    private lazy var panel = UsagePopoverController(model: panelModel)
    private var controller: RefreshController!
    private var terminating = false
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
        menu.onOpen = { [weak self] in self?.render(); self?.controller.refresh() }
        menu.onRefresh = { [weak self] in self?.controller.refresh() }
        menu.onChooseSource = { [weak self] in self?.chooseSource() }
        menu.onResetSource = { [weak self] in guard let self else { return }; self.sources.reset(); self.controller.setSource(self.sources.current); self.startMonitoring() }
        menu.onToggleLogin = { [weak self] in self?.toggleLogin() }
        menu.onOpenSettings = { [weak self] in self?.login.openSettings() }
        menu.onQuit = { NSApp.terminate(nil) }
        panelModel.onSelectionChange = { [weak self] in self?.render() }
        panelModel.onRefresh = { [weak self] in self?.controller.refresh() }
        panelModel.onChooseSource = { [weak self] in self?.chooseSource() }
        panelModel.onResetSource = { [weak self] in
            guard let self else { return }; self.sources.reset(); self.controller.setSource(self.sources.current); self.startMonitoring()
        }
        panelModel.onToggleLogin = { [weak self] in self?.toggleLogin() }
        panelModel.onOpenSettings = { [weak self] in self?.login.openSettings() }
        panelModel.onQuit = { NSApp.terminate(nil) }
        panelModel.onChooseClaudeSource = { [weak self] in self?.chooseSource(claude:true) }
        panelModel.onResetClaudeSource = { [weak self] in
            guard let self else { return }; self.sources.resetClaude(); self.controller.setSource(self.sources.current); self.startMonitoring()
        }
        panelModel.onInstallHooks = { [weak self] in self?.configureHooks(remove:false) }
        panelModel.onRemoveHooks = { [weak self] in self?.configureHooks(remove:true) }
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(willSleep), name: NSWorkspace.willSleepNotification, object: nil)
        center.addObserver(self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
        startMonitoring(); render(); controller.resume()
        if CommandLine.arguments.contains("--show-panel") { showPanel() }
    }
    private func render() {
        let presentation = UsagePresentation.make(snapshot: controller.snapshot, stale: controller.isStale, loading: controller.isLoading, now: Date())
        panelModel.update(snapshot: controller.snapshot, source: controller.source.displayName, isLoading: controller.isLoading, isStale: controller.isStale, notice: controller.notice, loginState: login.state)
        panelModel.applyActivities(activityStore.events())
        if panel.popover.isShown { panel.updateSize() }
        if let button = statusItem?.button { StatusItemRenderer.apply(to:button,model:panelModel) }
        statusItem?.button?.toolTip = "\(panelModel.selectionLabel)\n\(panelModel.activityLabel)\n\(panelModel.mainCost) USD · Ước tính API\n\(panelModel.tokenTooltip)\nHôm nay: \(panelModel.todayCost) · Tháng này: \(panelModel.monthCost)"
        menu.update(presentation: presentation, source: controller.source, isLoading: controller.isLoading, notice: controller.notice, loginState: login.state, snapshot: controller.snapshot)
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
        let picker = NSOpenPanel(); picker.canChooseDirectories = true; picker.canChooseFiles = false
        picker.allowsMultipleSelection = false; picker.canCreateDirectories = false
        picker.showsHiddenFiles = true; picker.title = claude ? "Chọn thư mục Claude Code chứa projects" : "Chọn thư mục Codex home chứa sessions"
        NSApp.activate(ignoringOtherApps: true)
        guard picker.runModal() == .OK, let url = picker.url else { return }
        guard sources.canChoose(url) else { showError("Tên thư mục không được chứa dấu phẩy vì bộ đọc dùng dấu phẩy để tách nguồn log."); return }
        if claude { sources.chooseClaude(url) } else { sources.choose(url) }
        controller.setSource(sources.current); startMonitoring()
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
            panelModel.connectionNotice = remove ? "Đã gỡ hooks Usage. Có thể bật lại trong Cài đặt." : "Đã cấu hình hooks. Codex: mở /hooks để tin cậy. Claude Code: mở lại phiên để nạp hooks."
            UserDefaults.standard.set(!remove,forKey:"usageHooksConfigured")
        } catch { panelModel.connectionNotice = "Không cấu hình được hooks. Kiểm tra tệp cấu hình hiện có; tệp chưa hợp lệ được giữ nguyên." }
        render()
    }
    private func toggleLogin() {
        do { try login.setEnabled(login.state != .enabled && login.state != .requiresApproval) }
        catch { showError("Không thay đổi được Login Items. Hãy đặt ứng dụng trong Applications và kiểm tra cài đặt macOS.") }
        render()
    }
    private func showError(_ message: String) {
        let alert = NSAlert(); alert.messageText = "No Short Usage"; alert.informativeText = message
        alert.alertStyle = .warning; NSApp.activate(ignoringOtherApps: true); alert.runModal()
    }
    @objc private func willSleep(_ notification: Notification) { panel.close(); activityMonitor?.stop(); controller.suspend() }
    @objc private func didWake(_ notification: Notification) { startMonitoring(); controller.resume() }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !terminating, let controller else { return terminating ? .terminateLater : .terminateNow }
        terminating = true; panel.close(); activityMonitor?.stop()
        Task { await controller.shutdown(); sender.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }
    func applicationWillTerminate(_ notification: Notification) {
        NSWorkspace.shared.notificationCenter.removeObserver(self)
        if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
    }
}
