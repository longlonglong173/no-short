import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class PopoverRenderingTests: XCTestCase {
    func testReferencePanelRendersInLightDarkAndSessionList() throws {
        _ = NSApplication.shared
        let model = UsagePanelModel()
        let s = try fixture { object in
            object["chart"] = (12...18).enumerated().map { index, day in
                ["date":"2026-10-\(day)", "cost":["amountUSD":[0.8,1.3,0.6,1.1,2.7,1.2,1.2][index],"knownCostUSD":0,"status":"estimated"]]
            }
        }
        model.update(snapshot:s,source:"~/.codex",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        for (name,scheme,showList) in [("light", ColorScheme.light, false), ("dark", .dark, false), ("sessions", .light, true), ("warning", .light, false)] {
            if name == "warning" {
                let partial = try fixture { o in
                    o["chart"] = [
                        ["date":"2026-10-17", "cost":["amountUSD":NSNull(),"knownCostUSD":0,"status":"unknown"]],
                        ["date":"2026-10-18", "cost":["amountUSD":NSNull(),"knownCostUSD":1.2,"status":"partial"]]
                    ]
                }
                model.update(snapshot:partial,source:"~/.codex",isLoading:false,isStale:true,notice:"Không cập nhật được thống kê. Kiểm tra quyền đọc log, kết nối và thử lại.",loginState:.requiresApproval)
            }
            model.showsSessions = showList
            let host = NSHostingView(rootView: UsagePopoverView(model:model).environment(\.colorScheme,scheme))
            host.frame = NSRect(x:0,y:0,width:400,height:model.panelHeight)
            host.layoutSubtreeIfNeeded()
            // Capture the native SwiftUI view, using synthetic fixture data only.
            let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in:host.bounds))
            host.cacheDisplay(in:host.bounds,to:bitmap)
            XCTAssertGreaterThanOrEqual(bitmap.pixelsWide,400)
            XCTAssertGreaterThanOrEqual(bitmap.pixelsHigh,Int(model.panelHeight))
            if let dir = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                let url = URL(fileURLWithPath:dir)
                try FileManager.default.createDirectory(at:url,withIntermediateDirectories:true)
                try XCTUnwrap(bitmap.representation(using:.png,properties:[:])).write(to:url.appendingPathComponent("popover-\(name).png"))
            }
        }
    }
    func testTransientPopoverHostsTheActualPanel() {
        let presenter = UsagePopoverController(model:UsagePanelModel())
        XCTAssertEqual(presenter.popover.behavior,.transient)
        XCTAssertNotNil(presenter.popover.contentViewController as? NSHostingController<UsagePopoverView>)
    }
}
