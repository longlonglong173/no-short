import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

// Deliberately different lifetime, day, month and provider totals: picking the
// wrong aggregate or rebuilding a day from session timestamps must be visible.
func modelCostsSnapshot(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> UsageSnapshot {
    try fixture { object in
        let tokens: [String: Any] = ["input": 100, "output": 20, "cacheRead": 30, "cacheWrite": 10, "total": 160]
        func row(_ name: String, _ status: String = "estimated", _ amount: Double = 0) -> [String: Any] {
            ["name": name, "tokens": tokens, "cost": ["amountUSD": status == "estimated" ? amount as Any : NSNull(), "knownCostUSD": amount, "status": status]]
        }
        func aggregate(_ models: [[String: Any]], _ amount: Double) -> [String: Any] {
            ["tokens": tokens, "cost": ["amountUSD": amount, "knownCostUSD": amount, "status": "estimated"], "models": models]
        }
        var sessions = object["sessions"] as! [[String: Any]]
        sessions[2]["models"] = [row("session-zero"), row("session-unknown", "unknown"), row("session-partial-zero", "partial"), row("session-partial", "partial", 1.25)]
        sessions[2]["tokens"] = ["input": 400, "output": 80, "cacheRead": 120, "cacheWrite": 40, "total": 640]
        sessions[2]["cost"] = ["amountUSD": NSNull(), "knownCostUSD": 1.25, "status": "partial"]
        sessions[2]["lastActivity"] = "1999-01-01T00:00:00Z"
        var claude = sessions[2]
        claude["id"] = "claude:chat"; claude["provider"] = "claude"; claude["sessionKey"] = "chat"
        claude["models"] = [row("claude-lifetime", "estimated", 9)]
        claude["tokens"] = tokens
        claude["cost"] = ["amountUSD": 9, "knownCostUSD": 9, "status": "estimated"]
        sessions.append(claude); object["sessions"] = sessions
        object["today"] = aggregate([row("all-today", "estimated", 7)], 7)
        object["month"] = aggregate([row("all-month", "estimated", 70)], 70)
        object["providerBreakdowns"] = [
            ["provider": "codex", "today": aggregate([row("codex-today", "estimated", 3)], 3), "month": aggregate([], 30), "chart": []],
            ["provider": "claude", "today": aggregate([row("claude-today", "estimated", 4)], 4), "month": aggregate([], 40), "chart": []]
        ]
        edit(&object)
    }
}

@MainActor final class ModelCostsTests: XCTestCase {
    // A v1 Codex-only snapshot must not claim that its total includes Claude.
    func testLegacyAllScopeNamesOnlyCodex() throws {
        let model = UsagePanelModel(preferredLanguages: ["en"])
        model.update(snapshot: try fixture(), source: "logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        model.setProviderFilter("all")
        XCTAssertEqual(model.selectionLabel, "Total today · Codex")
        XCTAssertEqual(model.mainCost, "$2.35")
        XCTAssertEqual(model.providerTodayCost(.codex).map(UsagePresentation.money), "$2.35")
        XCTAssertNil(model.providerTodayCost(.claude))
    }

    // Untranslated scope/status copy would make the details misleading in EN/zh.
    func testModelScopeAndPricingStatesAreLocalized() {
        let cases: [(AppLanguage, String, String, String, String, String)] = [
            (.english, "Costs by model", "Selected session · Lifetime · Codex", "Followed session · Lifetime · Codex", "Partial pricing", "Unknown price"),
            (.vietnamese, "Chi phí theo model", "Phiên đã chọn · Toàn phiên · Codex", "Phiên đang theo dõi · Toàn phiên · Codex", "Thiếu một phần giá", "Chưa biết giá"),
            (.simplifiedChinese, "各模型费用", "所选会话 · 整个会话 · Codex", "跟踪会话 · 整个会话 · Codex", "部分价格缺失", "价格未知")
        ]
        for (language, title, pinned, followed, partial, unknown) in cases {
            let model = UsagePanelModel(preferredLanguages: [language.rawValue])
            XCTAssertEqual(model.l("Chi phí theo model"), title)
            XCTAssertEqual(model.l("Phiên đã chọn · Toàn phiên · %@", "Codex"), pinned)
            XCTAssertEqual(model.l("Phiên đang theo dõi · Toàn phiên · %@", "Codex"), followed)
            XCTAssertEqual(model.l("Thiếu một phần giá"), partial)
            XCTAssertEqual(model.l("Chưa biết giá"), unknown)
        }
    }

    func testFollowedAndPinnedModelCostsUseSessionLifetimeRatherThanTodayOrMonth() throws {
        let model = try loadedModel()
        XCTAssertEqual(model.modelUsages.map(\.name), ["session-zero", "session-unknown", "session-partial-zero", "session-partial"])
        XCTAssertEqual(model.costScopeLabel, "Followed session · Lifetime · Codex")
        let event = try XCTUnwrap(SessionActivity.parse(Data(#"{"session_id":"chat","hook_event_name":"UserPromptSubmit"}"#.utf8), provider: .claude, now: fixtureNow))
        model.applyActivities([event], now: fixtureNow)
        XCTAssertEqual(model.modelUsages.map(\.name), ["claude-lifetime"])
        XCTAssertEqual(model.costScopeLabel, "Followed session · Lifetime · Claude Code")
        XCTAssertEqual(model.todayCost, "$4.00")
        XCTAssertEqual(model.mainCost, "$9.00")
        model.chooseSession("main")
        XCTAssertEqual(model.costScopeLabel, "Selected session · Lifetime · Codex")
        XCTAssertEqual(model.modelUsages.first?.name, "session-zero")
        XCTAssertEqual(model.todayCost, "$3.00")
    }

    func testAllUsesSnapshotTodayModelsWithoutReconstructingDatesFromSessions() throws {
        let model = try loadedModel()
        model.setProviderFilter("all")
        XCTAssertEqual(model.modelUsages.map(\.name), ["all-today"])
        XCTAssertEqual(model.mainCost, "$7.00")
        XCTAssertEqual(model.monthCost, "$70.00")
        XCTAssertEqual(model.costScopeLabel, "Total today · Codex + Claude Code")
        model.setProviderFilter("claude")
        XCTAssertEqual(model.modelUsages.map(\.name), ["claude-lifetime"])
        XCTAssertEqual(model.aggregateProviderLabel, "Claude Code")
    }

    func testUnpricedModelRowsRemainDistinctFromEstimatedZero() throws {
        let model = try loadedModel()
        let rows = model.modelUsages
        XCTAssertEqual(rows.map { UsagePresentation.money($0.cost) }, ["$0.00", "—", "≥$0.00", "≥$1.25"])
        XCTAssertEqual(rows.map { model.pricingLabel($0.cost) }, ["Estimated", "Unknown price", "Partial pricing", "Partial pricing"])
        XCTAssertEqual(rows[0].tokens.total, 160)
        XCTAssertEqual(rows[0].tokens.cacheWrite, 10)
        XCTAssertEqual(model.mainCost, "≥$1.25")
        XCTAssertEqual(model.mainUsageCost.map(model.pricingLabel), "Partial pricing")
    }

    func testMissingPinnedAndWaitingSessionsNeverBorrowAnotherModelsCosts() throws {
        let model = try loadedModel()
        model.chooseSession("removed")
        XCTAssertTrue(model.modelUsages.isEmpty)
        XCTAssertEqual(model.mainCost, "—")
        model.chooseSession(nil)
        let event = try XCTUnwrap(SessionActivity.parse(Data(#"{"session_id":"not-in-snapshot","hook_event_name":"UserPromptSubmit"}"#.utf8), provider: .claude, now: fixtureNow))
        model.applyActivities([event], now: fixtureNow)
        XCTAssertTrue(model.waitingForUsage)
        XCTAssertTrue(model.modelUsages.isEmpty)
        XCTAssertEqual(model.costScopeLabel, "Followed session · Lifetime · Claude Code")
    }

    func testEmptyModelsAndLegacyTodayDoNotFallBackToSessionOrMonthModels() throws {
        let model = try loadedModel()
        let legacy = try fixture { object in
            var today = object["today"] as! [String: Any]
            var sessions = object["sessions"] as! [[String: Any]]
            let tokens = today["tokens"]!
            today["models"] = [["name": "legacy-day", "tokens": tokens, "cost": today["cost"]!]]
            sessions[2]["models"] = [["name": "legacy-session", "tokens": tokens, "cost": today["cost"]!]]
            object["today"] = today; object["sessions"] = sessions
        }
        model.update(snapshot: legacy, source: "logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        XCTAssertEqual(model.modelUsages.map(\.name), ["legacy-session"])
        model.setProviderFilter("all")
        XCTAssertEqual(model.modelUsages.map(\.name), ["legacy-day"])
        XCTAssertEqual(model.totalProviders, [.codex])
        model.setProviderFilter("claude")
        XCTAssertTrue(model.modelUsages.isEmpty)
        XCTAssertEqual(model.todayCost, "—")
        model.update(snapshot: try fixture(), source: "logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        model.setProviderFilter("all")
        XCTAssertTrue(model.modelUsages.isEmpty)
        model.update(snapshot: nil, source: "logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        XCTAssertTrue(model.modelUsages.isEmpty)
        XCTAssertEqual(model.mainCost, "—")
    }

    func testDetailsNavigationKeepsHeightPinAndFollowStateWithoutRefreshing() throws {
        let model = try loadedModel()
        let followed = try XCTUnwrap(SessionActivity.parse(Data(#"{"session_id":"chat","hook_event_name":"UserPromptSubmit"}"#.utf8), provider: .claude, now: fixtureNow))
        model.applyActivities([followed], now: fixtureNow)
        model.chooseSession("main")
        let originalHeight = model.panelHeight
        var selectionChanges = 0
        model.onSelectionChange = { selectionChanges += 1 }
        model.showsSessions = true
        model.showModelCosts()
        XCTAssertTrue(model.showsModels)
        XCTAssertFalse(model.showsSessions)
        XCTAssertEqual(model.panelHeight, originalHeight)
        model.showsModels = false
        XCTAssertEqual(model.selectedSessionID, "main")
        XCTAssertEqual(model.providerFilter, "codex")
        XCTAssertEqual(model.followedActivity?.sessionID, "chat")
        XCTAssertEqual(selectionChanges, 0)
        model.setLanguage(.simplifiedChinese)
        XCTAssertEqual(model.costScopeLabel, "所选会话 · 整个会话 · Codex")
        XCTAssertEqual(model.modelUsages.first?.name, "session-zero")
    }

    // Combined period totals may be shown in All, but must never be relabeled
    // as Codex totals when providerBreakdowns is missing and Claude is present.
    func testMissingProviderBreakdownsWithMixedSessionsHideProviderPeriods() throws {
        let snapshot = try modelCostsSnapshot { object in
            object.removeValue(forKey: "providerBreakdowns")
            object["chart"] = [["date": "2026-10-18", "cost": ["amountUSD": 7, "knownCostUSD": 7, "status": "estimated"]]]
        }
        let model = UsagePanelModel(preferredLanguages: ["en"])
        model.update(snapshot: snapshot, source: "logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        XCTAssertEqual(model.totalProviders, [.codex, .claude])
        XCTAssertEqual(model.todayCost, "—")
        XCTAssertEqual(model.monthCost, "—")
        XCTAssertTrue(model.chartPoints.isEmpty)
        XCTAssertEqual(model.modelUsages.first?.name, "session-zero")
        XCTAssertNil(model.providerTodayCost(.codex))
        XCTAssertNil(model.providerTodayCost(.claude))
        model.setProviderFilter("claude")
        XCTAssertEqual(model.todayCost, "—")
        XCTAssertEqual(model.monthCost, "—")
        XCTAssertTrue(model.chartPoints.isEmpty)
        XCTAssertEqual(model.modelUsages.map(\.name), ["claude-lifetime"])
        model.setProviderFilter("all")
        XCTAssertEqual(model.costScopeLabel, "Total today · Codex + Claude Code")
        XCTAssertEqual(model.todayCost, "$7.00")
        XCTAssertEqual(model.monthCost, "$70.00")
        XCTAssertEqual(model.chartPoints.first?.amount, 7)
        XCTAssertEqual(model.modelUsages.map(\.name), ["all-today"])
    }

    func testMissingProviderBreakdownsWithOnlyClaudeNeverClaimsCodexTotals() throws {
        let snapshot = try modelCostsSnapshot { object in
            object.removeValue(forKey: "providerBreakdowns")
            object["sessions"] = (object["sessions"] as! [[String: Any]]).filter { $0["provider"] as? String == "claude" }
        }
        let model = UsagePanelModel(preferredLanguages: ["en"])
        model.update(snapshot: snapshot, source: "logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        XCTAssertEqual(model.totalProviders, [.claude])
        XCTAssertNil(model.visibleToday)
        XCTAssertNil(model.visibleMonth)
        model.setProviderFilter("all")
        XCTAssertEqual(model.costScopeLabel, "Total today · Claude Code")
        XCTAssertEqual(model.mainCost, "$7.00")
        XCTAssertNil(model.providerTodayCost(.codex))
        XCTAssertNil(model.providerTodayCost(.claude))
    }

    func testEmptyLegacySnapshotKeepsCodexScopeAndZeroTotals() throws {
        let snapshot = try fixture { object in
            object["sessions"] = []; object["status"] = "empty"
            for key in ["today", "month"] {
                object[key] = ["tokens": ["input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0],
                               "cost": ["amountUSD": 0, "knownCostUSD": 0, "status": "estimated"], "models": []]
            }
        }
        let model = UsagePanelModel(preferredLanguages: ["en"])
        model.update(snapshot: snapshot, source: "logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        model.setProviderFilter("all")
        XCTAssertEqual(model.totalProviders, [.codex])
        XCTAssertEqual(model.costScopeLabel, "Total today · Codex")
        XCTAssertEqual(model.mainCost, "$0.00")
        XCTAssertEqual(model.providerTodayCost(.codex).map(UsagePresentation.money), "$0.00")
        XCTAssertNil(model.providerTodayCost(.claude))
        XCTAssertTrue(model.modelUsages.isEmpty)
    }

    private func loadedModel() throws -> UsagePanelModel {
        let model = UsagePanelModel(preferredLanguages: ["en"])
        model.update(snapshot: try modelCostsSnapshot(), source: "logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        return model
    }
}
