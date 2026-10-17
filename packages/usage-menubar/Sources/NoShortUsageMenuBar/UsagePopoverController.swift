import AppKit
import SwiftUI

@MainActor final class UsagePopoverController {
    let popover = NSPopover()
    init(model: UsagePanelModel) {
        popover.behavior = .transient
        popover.contentSize = NSSize(width: 400, height: 640)
        popover.contentViewController = NSHostingController(rootView: UsagePopoverView(model: model))
    }
    func toggle(relativeTo button: NSStatusBarButton) {
        if popover.isShown { close(); return }
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
    }
    func close() { popover.performClose(nil) }
}
