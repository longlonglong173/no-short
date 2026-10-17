import XCTest
import AppKit
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class MenuBuilderTests: XCTestCase {
    func testMenuActionsAndLoadingAndLoginState() throws {
        _ = NSApplication.shared
        let builder = MenuBuilder()
        var events: [String] = []
        builder.onRefresh = { events.append("refresh") }
        builder.onChooseSource = { events.append("source") }
        builder.onResetSource = { events.append("reset") }
        builder.onToggleLogin = { events.append("login") }
        builder.onQuit = { events.append("quit") }
        let s = try fixture(), p = UsagePresentation.make(snapshot: s, stale: false, loading: false, now: s.generatedAt)
        builder.update(presentation: p, source: LogSource(rootsEnvironment: "/tmp/source"), isLoading: false, notice: nil, loginState: .notRegistered, snapshot: s)
        for title in ["Làm mới", "Chọn thư mục log…", "Dùng nguồn log mặc định", "Mở cùng macOS", "Thoát No Short Usage"] {
            let index = builder.menu.indexOfItem(withTitle: title)
            XCTAssertGreaterThanOrEqual(index, 0)
            builder.menu.performActionForItem(at: index)
        }
        XCTAssertEqual(events, ["refresh", "source", "reset", "login", "quit"])
        builder.update(presentation: p, source: LogSource(rootsEnvironment: "/tmp/source"), isLoading: true, notice: nil, loginState: .requiresApproval, snapshot: s)
        XCTAssertFalse(builder.menu.item(withTitle: "Đang cập nhật…")!.isEnabled)
        XCTAssertEqual(builder.menu.item(withTitle: "Mở cùng macOS · Cần phê duyệt")!.state, .mixed)
        XCTAssertFalse(builder.menu.item(withTitle: "Mở cài đặt Login Items…")!.isHidden)
    }
}
