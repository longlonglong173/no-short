import AppKit
import SwiftUI

@MainActor final class UsagePopoverController {
    let popover = NSPopover()
    private let model: UsagePanelModel
    init(model: UsagePanelModel) {
        self.model = model
        popover.behavior = .transient
        popover.contentSize = NSSize(width: 400, height: 632)
        popover.contentViewController = NSHostingController(rootView: UsagePopoverView(model: model))
    }
    func toggle(relativeTo button: NSStatusBarButton) {
        if popover.isShown { close(); return }
        updateSize()
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }
    func updateSize() { popover.contentSize = NSSize(width: 400, height: model.panelHeight) }
    func close() { popover.performClose(nil) }
}
