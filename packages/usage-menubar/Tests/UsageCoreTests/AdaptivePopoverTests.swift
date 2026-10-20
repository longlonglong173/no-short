import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class AdaptivePopoverTests: XCTestCase {
    func testSmallDashboardScrollsToFooterWithoutCompressingContent() async throws {
        _ = NSApplication.shared
        let model = UsagePanelModel(preferredLanguages: ["en"])
        model.update(snapshot: try fixture(), source: "synthetic", isLoading: false,
                     isStale: false, notice: nil, loginState: .notRegistered)
        let presenter = UsagePopoverController(model: model)
        let controller = try XCTUnwrap(presenter.popover.contentViewController as? NSHostingController<UsagePopoverView>)
        // Keep the synthetic viewport independent of the test machine's screen size.
        controller.rootView = UsagePopoverView(model: model)
        let host = controller.view
        host.frame = NSRect(x: 0, y: 0, width: 400, height: 360)
        let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        host.layoutSubtreeIfNeeded()
        await settle()
        host.layoutSubtreeIfNeeded()
        let scroll = try XCTUnwrap(descendants(host).compactMap { $0 as? NSScrollView }.first,
                                   "The entire dashboard needs a vertical scroll viewport on small screens")
        let document = try XCTUnwrap(scroll.documentView)
        XCTAssertLessThanOrEqual(scroll.frame.height, 360)
        XCTAssertGreaterThanOrEqual(document.frame.height, model.panelHeight)
        XCTAssertTrue(window.makeFirstResponder(scroll))
        let endKey = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero,
            modifierFlags: [], timestamp: 0, windowNumber: window.windowNumber, context: nil,
            characters: "\u{F72B}", charactersIgnoringModifiers: "\u{F72B}", isARepeat: false, keyCode: 119))
        controller.keyDown(with: endKey)
        await settle()
        XCTAssertEqual(scroll.contentView.bounds.maxY, document.bounds.maxY, accuracy: 1,
                       "End must reach the footer by keyboard")
        for (key, characters, atTop) in [(UInt16(115), "\u{F729}", true),
                                          (121, "\u{F72D}", false), (116, "\u{F72C}", true)] {
            let event = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero,
                modifierFlags: [], timestamp: 0, windowNumber: window.windowNumber, context: nil,
                characters: characters, charactersIgnoringModifiers: characters, isARepeat: false, keyCode: key))
            controller.keyDown(with: event)
            if atTop { XCTAssertEqual(scroll.contentView.bounds.minY, 0, accuracy: 1) }
            else { XCTAssertGreaterThan(scroll.contentView.bounds.minY, 0) }
        }
    }

    func testChangingFromDashboardToSessionsResetsScrollToTop() async throws {
        _ = NSApplication.shared
        let model = UsagePanelModel(preferredLanguages: ["en"])
        model.update(snapshot: try fixture(), source: "synthetic", isLoading: false,
                     isStale: false, notice: nil, loginState: .notRegistered)
        let host = NSHostingView(rootView: UsagePopoverView(model: model))
        host.frame = NSRect(x: 0, y: 0, width: 400, height: 250)
        let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host; host.layoutSubtreeIfNeeded(); await settle()
        let scroll = try XCTUnwrap(descendants(host).compactMap { $0 as? NSScrollView }.first)
        let document = try XCTUnwrap(scroll.documentView)
        scroll.contentView.scroll(to: NSPoint(x: 0, y: document.bounds.maxY - scroll.contentView.bounds.height))
        scroll.reflectScrolledClipView(scroll.contentView)
        XCTAssertGreaterThan(scroll.contentView.bounds.minY, 0)
        model.showsSessions = true
        await settle(); host.layoutSubtreeIfNeeded(); await settle()
        let changed = try XCTUnwrap(descendants(host).compactMap { $0 as? NSScrollView }.first)
        XCTAssertEqual(changed.contentView.bounds.minY, 0, accuracy: 1)
    }

    func testViewportClampsBelowAnchorAndKeepsUsualWidth() {
        XCTAssertEqual(PopoverLayout.viewport(contentHeight: 812,
            visibleFrame: NSRect(x: 0, y: 0, width: 1440, height: 878),
            anchorFrame: NSRect(x: 1200, y: 878, width: 80, height: 22)),
            NSSize(width: 400, height: 812))
        XCTAssertEqual(PopoverLayout.viewport(contentHeight: 812,
            visibleFrame: NSRect(x: 0, y: 40, width: 1024, height: 700),
            anchorFrame: NSRect(x: 900, y: 730, width: 80, height: 22)),
            NSSize(width: 400, height: 674))
    }

    func testViewportHandlesNarrowAndOffsetSecondaryScreens() {
        XCTAssertEqual(PopoverLayout.viewport(contentHeight: 900,
            visibleFrame: NSRect(x: -320, y: -600, width: 320, height: 570),
            anchorFrame: NSRect(x: -100, y: -22, width: 80, height: 22)),
            NSSize(width: 304, height: 554))
        XCTAssertEqual(PopoverLayout.viewport(contentHeight: 200,
            visibleFrame: NSRect(x: 1920, y: 500, width: 800, height: 600),
            anchorFrame: NSRect(x: 2600, y: 1000, width: 80, height: 22)),
            NSSize(width: 400, height: 200))
    }

    func testViewportNeverReturnsNegativeOrNonfiniteDimensions() {
        let size = PopoverLayout.viewport(contentHeight: .infinity,
            visibleFrame: .zero, anchorFrame: .zero)
        XCTAssertEqual(size, NSSize(width: 1, height: 1))
    }

    func testControllerResizesAfterWarningsAppearAndDisappearWithoutRenderCallback() async throws {
        _ = NSApplication.shared
        let model = UsagePanelModel(preferredLanguages: ["en"])
        let presenter = UsagePopoverController(model: model)
        presenter.updateSize()
        let original = presenter.popover.contentSize
        model.connectionNotice = "Đã ngắt bộ thu context Claude Code."
        // Published changes arrive before assignment; allow the next main-queue turn.
        await settle()
        let screen = try XCTUnwrap(NSScreen.main)
        let expected = PopoverLayout.viewport(contentHeight: model.panelHeight,
            visibleFrame: screen.visibleFrame,
            anchorFrame: NSRect(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY, width: 1, height: 1))
        XCTAssertEqual(presenter.popover.contentSize, expected)
        model.connectionNotice = nil
        model.setLanguage(.simplifiedChinese)
        await settle()
        XCTAssertEqual(presenter.popover.contentSize, original)
    }

    private func settle() async {
        try? await Task.sleep(for: .milliseconds(100))
    }

    private func descendants(_ view: NSView) -> [NSView] {
        view.subviews.flatMap { [$0] + descendants($0) }
    }
}
