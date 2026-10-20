import AppKit
import SwiftUI
import UsageCore

@MainActor final class UsageHistoryWindowController: NSWindowController {
    let model: UsageHistoryModel
    init(model: UsageHistoryModel) {
        self.model = model
        let window = HistoryWindow(contentViewController: UsageScrollHostingController(rootView: UsageHistoryView(model: model)))
        window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
        window.isReleasedWhenClosed = false
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1024, height: 768)
        let width = min(960, max(1, visible.width - 24)), height = min(700, max(1, visible.height - 24))
        window.minSize = NSSize(width: min(480, width), height: min(340, height))
        window.setFrame(NSRect(x: visible.midX - width / 2, y: visible.midY - height / 2, width: width, height: height), display: false)
        super.init(window: window)
        updateTitle()
    }
    required init?(coder: NSCoder) { nil }
    func update(snapshot: UsageSnapshot?, source: String, isLoading: Bool, isStale: Bool, notice: String?, language: AppLanguage) {
        model.update(snapshot: snapshot, source: source, isLoading: isLoading, isStale: isStale, notice: notice, language: language)
        updateTitle()
    }
    private func updateTitle() { window?.title = model.l("Chi tiết sử dụng") + " — No Short Usage" }
    func present() {
        updateTitle(); showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}

/// The accessory app has no application menu to supply the usual Close shortcut.
private final class HistoryWindow: NSWindow {
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
           event.charactersIgnoringModifiers == "w" {
            performClose(nil); return true
        }
        return super.performKeyEquivalent(with: event)
    }
}
