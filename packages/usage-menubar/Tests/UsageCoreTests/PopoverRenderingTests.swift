import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class PopoverRenderingTests: XCTestCase {
    func testConnectionSuccessCannotHideReadFailure() throws {
        let model = UsagePanelModel(preferredLanguages: ["vi"])
        model.connectionNotice = "Đã kết nối context Claude Code. Status line sẽ gửi số liệu khi phiên cập nhật."
        model.update(snapshot: try fixture(), source: "a", isLoading: false, isStale: true,
                     notice: "Đọc dữ liệu thất bại", loginState: .notRegistered)
        model.chooseSession("removed")
        XCTAssertEqual(UsagePopoverView(model: model).warning, "Đọc dữ liệu thất bại")
    }

    func testConnectionSuccessCannotHideStaleDataOrMissingSelection() throws {
        let model = UsagePanelModel(preferredLanguages: ["vi"])
        model.connectionNotice = "Đã cấu hình hooks. Codex: mở /hooks để tin cậy. Claude Code: mở lại phiên để nạp hooks."
        model.update(snapshot: try fixture(), source: "a", isLoading: false, isStale: true,
                     notice: nil, loginState: .notRegistered)
        XCTAssertEqual(UsagePopoverView(model: model).warning, "Dữ liệu cũ · đang chờ cập nhật")

        model.update(snapshot: try fixture(), source: "a", isLoading: false, isStale: false,
                     notice: nil, loginState: .notRegistered)
        model.chooseSession("removed")
        XCTAssertEqual(UsagePopoverView(model: model).warning, "Phiên đã chọn không còn dữ liệu. Chọn phiên khác để tiếp tục.")
    }

    func testConnectionNoticeReturnsAfterDataRecoversAndCanBeDismissed() throws {
        let model = UsagePanelModel(preferredLanguages: ["vi"])
        model.connectionNotice = "Đã ngắt bộ thu context Claude Code."
        model.update(snapshot: try fixture(), source: "a", isLoading: false, isStale: true,
                     notice: nil, loginState: .notRegistered)
        XCTAssertEqual(UsagePopoverView(model: model).warning, "Dữ liệu cũ · đang chờ cập nhật")

        model.update(snapshot: try fixture(), source: "a", isLoading: false, isStale: false,
                     notice: nil, loginState: .notRegistered)
        XCTAssertEqual(UsagePopoverView(model: model).warning, "Đã ngắt bộ thu context Claude Code.")
        model.connectionNotice = nil
        XCTAssertNil(UsagePopoverView(model: model).warning)
    }

    func testReferencePanelRendersInLightDarkAndSessionList() throws {
        _ = NSApplication.shared
        let model = UsagePanelModel(preferredLanguages: ["vi"])
        let s = try fixture { object in
            object["chart"] = (12...18).enumerated().map { index, day in
                ["date":"2026-10-\(day)", "cost":["amountUSD":[0.8,1.3,0.6,1.1,2.7,1.2,1.2][index],"knownCostUSD":0,"status":"estimated"]]
            }
            var codex = object["today"] as! [String:Any], claude = codex
            codex["cost"] = ["amountUSD":1.10,"knownCostUSD":1.10,"status":"estimated"]
            claude["cost"] = ["amountUSD":1.25,"knownCostUSD":1.25,"status":"estimated"]
            object["providerBreakdowns"] = [
                ["provider":"codex","today":codex,"month":codex,"chart":object["chart"]!],
                ["provider":"claude","today":claude,"month":claude,"chart":object["chart"]!]
            ]
        }
        model.update(snapshot:s,source:"~/.codex",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        for (name,scheme,showList) in [("light", ColorScheme.light, false), ("dark", .dark, false), ("sessions", .light, true), ("all", .dark, false), ("waiting", .light, false), ("warning", .light, false), ("context-alert-light", .light, false), ("context-alert-dark", .dark, false), ("en-light", .light, false), ("en-dark", .dark, false), ("zh-light", .light, false), ("zh-dark", .dark, false), ("zh-sessions", .light, true)] {
            if name == "all" { model.setProviderFilter("all") }
            if name == "waiting" {
                let event = try XCTUnwrap(SessionActivity.parse(Data(#"{"session_id":"new-claude-session","hook_event_name":"UserPromptSubmit"}"#.utf8),provider:.claude))
                model.applyActivities([event])
            }
            if name == "warning" {
                model.setProviderFilter("codex")
                let partial = try fixture { o in
                    o["chart"] = [
                        ["date":"2026-10-17", "cost":["amountUSD":NSNull(),"knownCostUSD":0,"status":"unknown"]],
                        ["date":"2026-10-18", "cost":["amountUSD":NSNull(),"knownCostUSD":1.2,"status":"partial"]]
                    ]
                }
                model.update(snapshot:partial,source:"~/.codex",isLoading:false,isStale:true,notice:"Không cập nhật được thống kê. Kiểm tra quyền đọc log, kết nối và thử lại.",loginState:.requiresApproval)
            }
            if name.hasPrefix("context-alert") {
                model.setProviderFilter("codex"); model.chooseSession("main")
                model.update(snapshot:s,source:"~/.codex",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
                model.updateContexts([.codex:ContextReading(sessionID:"main",usedTokens:74,limitTokens:100,recordedAt:Date())])
                XCTAssertNotNil(model.contextWarning)
            }
            if name.hasPrefix("en-") { model.setLanguage(.english) }
            if name.hasPrefix("zh-") { model.setLanguage(.simplifiedChinese) }
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
    func testSetupRendersInAllLanguagesAndThemesWithWaitingAndErrorStates() throws {
        _ = NSApplication.shared
        for language in AppLanguage.allCases {
            let model = UsagePanelModel(preferredLanguages: [language.rawValue])
            model.setLanguage(language); model.showsSetup = true
            model.updateDiagnostics([
                ConnectionDiagnostic(id: "logs-codex", title: "Nguồn log Codex", guidance: "Chưa nhận dữ liệu", status: .configuredNoData, lastReceived: nil, paths: ["/tmp/example/sessions"]),
                ConnectionDiagnostic(id: "hooks-codex", title: "Hooks Codex", guidance: "Chưa nhận dữ liệu", status: .error, lastReceived: Date(timeIntervalSince1970: 1_000), paths: ["/tmp/example/hooks.json"])
            ])
            for (name, scheme) in [("light", ColorScheme.light), ("dark", .dark)] {
                let host = NSHostingView(rootView: UsagePopoverView(model: model).environment(\.colorScheme, scheme))
                host.frame = NSRect(x: 0, y: 0, width: 400, height: model.panelHeight)
                host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsHigh, Int(model.panelHeight))
                if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                    try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: directory).appendingPathComponent("setup-\(language.rawValue)-\(name).png"))
                }
            }
        }
    }
    func testTransientPopoverHostsTheActualPanel() {
        let presenter = UsagePopoverController(model:UsagePanelModel(preferredLanguages: ["vi"]))
        XCTAssertEqual(presenter.popover.behavior,.transient)
        XCTAssertNotNil(presenter.popover.contentViewController as? NSHostingController<UsagePopoverView>)
    }
}
