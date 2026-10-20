import AppKit
import SwiftUI
import UsageCore
import UniformTypeIdentifiers

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
        model.onExport = { [weak self] format, includeIdentifiers in
            self?.beginExport(format, includeIdentifiers: includeIdentifiers)
        }
    }
    required init?(coder: NSCoder) { nil }
    func update(snapshot: UsageSnapshot?, source: String, isLoading: Bool, isStale: Bool, notice: String?, language: AppLanguage) {
        model.update(snapshot: snapshot, source: source, isLoading: isLoading, isStale: isStale, notice: notice, language: language)
        updateTitle()
    }
    private func beginExport(_ format: UsageExportFormat, includeIdentifiers: Bool) {
        guard let window, !model.isExporting else { return }
        // Freeze bytes and filename before presenting the asynchronous destination chooser.
        let payload: PreparedUsageExport
        do { payload = try model.prepareExport(format, includeSessionIdentifiers: includeIdentifiers) }
        catch { model.exportFailure = .unavailable; return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [format == .csv ? UTType.commaSeparatedText : UTType.json]
        panel.allowsOtherFileTypes = false
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.nameFieldStringValue = payload.filename
        panel.title = model.l(format == .csv ? "Lưu CSV…" : "Lưu JSON…")
        panel.prompt = model.l("Lưu")
        model.exportFailure = nil; model.isExporting = true
        panel.beginSheetModal(for: window) { [weak self] response in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.model.isExporting = false
                guard response == .OK, let destination = panel.url else { return }
                do { try payload.data.write(to: destination, options: .atomic) }
                catch { self.model.exportFailure = .writeFailed }
            }
        }
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
