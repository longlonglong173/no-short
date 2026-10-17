import AppKit
import UsageCore

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private let menu = MenuBuilder(), login = LoginItemManager(), sources = LogSourceStore()
    private let panelModel = UsagePanelModel()
    private lazy var panel = UsagePopoverController(model: panelModel)
    private var controller: RefreshController!
    private var terminating = false
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
        controller.onChange = { [weak self] in self?.render() }
        menu.onOpen = { [weak self] in self?.render(); self?.controller.refresh() }
        menu.onRefresh = { [weak self] in self?.controller.refresh() }
        menu.onChooseSource = { [weak self] in self?.chooseSource() }
        menu.onResetSource = { [weak self] in guard let self else { return }; self.sources.reset(); self.controller.setSource(self.sources.current) }
        menu.onToggleLogin = { [weak self] in self?.toggleLogin() }
        menu.onOpenSettings = { [weak self] in self?.login.openSettings() }
        menu.onQuit = { NSApp.terminate(nil) }
        panelModel.onSelectionChange = { [weak self] in self?.render() }
        panelModel.onRefresh = { [weak self] in self?.controller.refresh() }
        panelModel.onChooseSource = { [weak self] in self?.chooseSource() }
        panelModel.onResetSource = { [weak self] in
            guard let self else { return }; self.sources.reset(); self.controller.setSource(self.sources.current)
        }
        panelModel.onToggleLogin = { [weak self] in self?.toggleLogin() }
        panelModel.onOpenSettings = { [weak self] in self?.login.openSettings() }
        panelModel.onQuit = { NSApp.terminate(nil) }
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(willSleep), name: NSWorkspace.willSleepNotification, object: nil)
        center.addObserver(self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
        render(); controller.resume()
        if CommandLine.arguments.contains("--show-panel") { showPanel() }
    }
    private func render() {
        let presentation = UsagePresentation.make(snapshot: controller.snapshot, stale: controller.isStale, loading: controller.isLoading, now: Date())
        panelModel.update(snapshot: controller.snapshot, source: controller.source.displayName, isLoading: controller.isLoading, isStale: controller.isStale, notice: controller.notice, loginState: login.state)
        statusItem?.button?.title = panelModel.statusTitle
        statusItem?.button?.toolTip = "\(panelModel.selectionLabel)\nChi phí phiên: \(panelModel.mainCost) USD · Ước tính API\n\(panelModel.tokenTooltip)\nHôm nay: \(panelModel.todayCost) · Tháng này: \(panelModel.monthCost)"
        statusItem?.button?.setAccessibilityValue(panelModel.statusTitle)
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
    private func chooseSource() {
        panel.close()
        let picker = NSOpenPanel(); picker.canChooseDirectories = true; picker.canChooseFiles = false
        picker.allowsMultipleSelection = false; picker.canCreateDirectories = false
        picker.showsHiddenFiles = true; picker.title = "Chọn thư mục Codex home chứa sessions"
        NSApp.activate(ignoringOtherApps: true)
        guard picker.runModal() == .OK, let url = picker.url else { return }
        guard sources.canChoose(url) else { showError("Tên thư mục không được chứa dấu phẩy vì bộ đọc dùng dấu phẩy để tách nguồn log."); return }
        sources.choose(url); controller.setSource(sources.current)
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
    @objc private func willSleep(_ notification: Notification) { panel.close(); controller.suspend() }
    @objc private func didWake(_ notification: Notification) { controller.resume() }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !terminating, let controller else { return terminating ? .terminateLater : .terminateNow }
        terminating = true; panel.close()
        Task { await controller.shutdown(); sender.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }
    func applicationWillTerminate(_ notification: Notification) {
        NSWorkspace.shared.notificationCenter.removeObserver(self)
        if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
    }
}
