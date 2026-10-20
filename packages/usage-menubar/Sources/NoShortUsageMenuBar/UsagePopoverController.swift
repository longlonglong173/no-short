import AppKit
import SwiftUI
import Combine
import UsageCore

@MainActor final class UsagePopoverController {
    let popover = NSPopover()
    private let model: UsagePanelModel
    private weak var anchorButton: NSStatusBarButton?
    private var contentHeight: CGFloat?
    private var observations = Set<AnyCancellable>()

    init(model: UsagePanelModel) {
        self.model = model
        popover.behavior = .transient
        let host = PopoverHostingController(rootView: UsagePopoverView(model: model, onContentHeightChange: { [weak self] height in
            guard let self, self.contentHeight != height else { return }
            self.contentHeight = height
            self.updateSize()
        }))
        // The viewport, rather than the document's ideal size, owns the popover size.
        host.sizingOptions = []
        popover.contentViewController = host
        updateSize()
        // objectWillChange fires before assignment; resize after SwiftUI sees the new state.
        model.objectWillChange.receive(on: RunLoop.main).sink { [weak self] _ in
            self?.updateSize()
        }.store(in: &observations)
        NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
            .receive(on: RunLoop.main).sink { [weak self] _ in self?.updateSize() }
            .store(in: &observations)
    }
    func toggle(relativeTo button: NSStatusBarButton) {
        if popover.isShown { close(); return }
        anchorButton = button
        updateSize()
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }
    func updateSize() {
        let height = max(model.panelHeight, contentHeight ?? 0)
        let size: NSSize
        if let screen = anchorButton?.window?.screen ?? NSScreen.main {
            let anchor = anchorButton.flatMap { button in
                button.window?.convertToScreen(button.convert(button.bounds, to: nil))
            } ?? NSRect(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY, width: 1, height: 1)
            size = PopoverLayout.viewport(contentHeight: height, visibleFrame: screen.visibleFrame, anchorFrame: anchor)
        } else {
            size = NSSize(width: 400, height: height)
        }
        if popover.contentSize != size { popover.contentSize = size }
    }
    func close() { popover.performClose(nil) }
}

/// Supplement SwiftUI control focus with keyboard navigation of the full document.
/// Tab/Shift-Tab and control activation continue through SwiftUI's normal responder chain.
private final class PopoverHostingController: NSHostingController<UsagePopoverView> {
    override func keyDown(with event: NSEvent) {
        guard event.modifierFlags.intersection([.command, .control, .option]).isEmpty,
              !(view.window?.firstResponder is NSTextView),
              [115, 119, 116, 121].contains(event.keyCode),
              let scroll = scrollView(in: view), let document = scroll.documentView else {
            super.keyDown(with: event)
            return
        }
        let clip = scroll.contentView
        let minimum = document.bounds.minY
        let maximum = max(minimum, document.bounds.maxY - clip.bounds.height)
        let forward: CGFloat = document.isFlipped ? 1 : -1
        let step = max(1, clip.bounds.height - 24)
        var origin = clip.bounds.origin
        switch event.keyCode {
        case 115: origin.y = document.isFlipped ? minimum : maximum // Home
        case 119: origin.y = document.isFlipped ? maximum : minimum // End
        case 116: origin.y -= step * forward // Page Up
        default: origin.y += step * forward // Page Down
        }
        origin.y = min(maximum, max(minimum, origin.y))
        clip.scroll(to: origin)
        scroll.reflectScrolledClipView(clip)
    }

    private func scrollView(in view: NSView) -> NSScrollView? {
        if let scroll = view as? NSScrollView { return scroll }
        return view.subviews.lazy.compactMap { self.scrollView(in: $0) }.first
    }
}
