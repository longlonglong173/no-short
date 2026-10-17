import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class UsagePanelModelTests: XCTestCase {
    func testDefaultSelectionAndExplicitSessionDriveCostAndTokens() throws {
        let model = UsagePanelModel(), s = try fixture()
        model.update(snapshot: s, source: "a", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        XCTAssertEqual(model.selectedSession?.id, "main")
        XCTAssertEqual(model.mainCost, "$2.35")
        XCTAssertEqual(model.inputText, "1.2K")
        XCTAssertEqual(model.cacheText, "800")
        model.chooseSession("unknown")
        XCTAssertEqual(model.mainCost, "$0.10")
        XCTAssertEqual(model.statusTitle, "NS $0.10")
        model.chooseSession(nil)
        XCTAssertEqual(model.selectedSession?.id, "main")
    }
    func testMissingSelectionAndSourceChangeDoNotShowAnotherSessionAsSelected() throws {
        let model = UsagePanelModel(), s = try fixture()
        model.update(snapshot: s, source: "a", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        model.chooseSession("removed")
        XCTAssertNil(model.selectedSession); XCTAssertEqual(model.mainCost, "—")
        XCTAssertTrue(model.selectionMissing)
        model.update(snapshot: s, source: "b", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        XCTAssertEqual(model.selectedSession?.id, "main")
    }
    func testUnknownAndPartialPricesAndSearchAndStaleRemainHonest() throws {
        let model = UsagePanelModel()
        let s = try fixture { o in
            var sessions = o["sessions"] as! [[String:Any]]
            sessions[2]["cost"] = ["amountUSD":NSNull(), "knownCostUSD":2.35, "status":"partial"]
            o["sessions"] = sessions
        }
        model.update(snapshot: s, source: "a", isLoading: false, isStale: true, notice: "Đọc dữ liệu thất bại", loginState: .requiresApproval)
        XCTAssertEqual(model.mainCost, "≥$2.35")
        XCTAssertTrue(model.statusTitle.contains("⚠"))
        model.search = "PHIEN CHINH" // Vietnamese search is accent/case insensitive.
        XCTAssertEqual(model.filteredSessions.map(\.id), ["main"])
        model.update(snapshot: nil, source: "a", isLoading: true, isStale: false, notice: nil, loginState: .notRegistered)
        XCTAssertEqual(model.mainCost, "—"); XCTAssertEqual(model.statusTitle, "NS …")
    }
    func testChartKeepsUnknownAsGapAndCompactsTokensWithoutLosingTooltipPrecision() throws {
        let model = UsagePanelModel()
        let s = try fixture { o in o["chart"] = [
            ["date":"2026-10-17", "cost":["amountUSD":NSNull(), "knownCostUSD":0,"status":"unknown"]],
            ["date":"2026-10-18", "cost":["amountUSD":1.5,"knownCostUSD":1.5,"status":"estimated"]]
        ] }
        model.update(snapshot:s, source:"a", isLoading:false, isStale:false, notice:nil, loginState:.notRegistered)
        XCTAssertNil(model.chartPoints[0].amount)
        XCTAssertEqual(model.chartPoints[1].amount, 1.5)
        XCTAssertEqual(model.chartPoints[1].label, "18/10")
        XCTAssertTrue(model.hasUnpricedDays)
        XCTAssertTrue(model.tokenTooltip.contains("1,200"))
        XCTAssertEqual(UsagePanelModel.compact(1_250_000), "1.3M")
    }
}
