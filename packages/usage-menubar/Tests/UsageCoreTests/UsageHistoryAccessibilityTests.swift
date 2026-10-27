import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

/// Semantic values consumed by the chart accessibility representation.
/// The runtime AX tree is checked separately; these assertions do not prove VoiceOver audio.
@MainActor final class UsageHistoryAccessibilityTests: XCTestCase {
    func testChartDescriptionsKeepOneUSDValueAndDistinguishUnknownFromPricedZeroInEveryLanguage() throws {
        let snapshot = try chartFixture()
        for (language, partial, unknown, estimated) in [
            (AppLanguage.english, "Partial pricing", "Unknown price", "Estimated"),
            (.vietnamese, "Thiếu một phần giá", "Chưa biết giá", "Ước tính"),
            (.simplifiedChinese, "部分价格缺失", "价格未知", "估算值")
        ] {
            let model = makeModel(snapshot, language: language)
            let descriptions = model.chartPoints.map(\.description)
            XCTAssertEqual(descriptions, [
                "2026-10-14 · ≥$12.34 USD · \(partial)",
                "2026-10-15 · — · \(unknown)",
                "2026-10-16 · $0.00 USD · \(estimated)",
                "2026-10-17 · $5.00 USD · \(estimated)",
                "2026-10-18 · ≥$0.00 USD · \(partial)"
            ])
        }
    }

    func testDaySelectionProviderRangeAndRefreshKeepChartDaysUniqueAndAmountsIntact() throws {
        let snapshot = try chartFixture()
        let model = makeModel(snapshot)
        model.selectDay("2026-10-14")
        XCTAssertEqual(model.selectedDay, "2026-10-14")
        XCTAssertEqual(model.chartPoints.first?.cost.knownCostUSD, 12.34)
        XCTAssertEqual(model.sessionUsage?.sessions.count, 1)
        XCTAssertEqual(model.sessionUsage?.reconciled, true)
        model.selectSession("main")
        XCTAssertEqual(model.selectedSessionUsage?.aggregate.cost.knownCostUSD, 12.34)
        model.selectDay(nil)
        XCTAssertNil(model.selectedDay)
        model.selectDay("2026-10-14")
        model.update(snapshot: snapshot, source: "synthetic", isLoading: false, isStale: false, notice: nil, language: .vietnamese)
        XCTAssertEqual(model.selectedDay, "2026-10-14")
        XCTAssertEqual(model.chartPoints.count, 5)
        XCTAssertEqual(Set(model.chartPoints.map(\.id)).count, 5)
        model.setProvider("claude")
        XCTAssertNil(model.selectedDay)
        XCTAssertEqual(model.chartPoints.map(\.date), ["2026-10-14"])
        XCTAssertEqual(model.chartPoints.first?.amount, 2)
        model.setProvider("all")
        XCTAssertEqual(model.chartPoints.first?.amount, 14.34)
        model.setProvider("codex")
        model.setPreset(.sevenDays)
        XCTAssertEqual(model.chartPoints.count, 5)
        XCTAssertTrue(model.applyCustom(start: "2026-10-15", end: "2026-10-16"))
        XCTAssertEqual(model.chartPoints.map(\.date), ["2026-10-15", "2026-10-16"])
        XCTAssertNil(model.chartPoints[0].amount)
        XCTAssertEqual(model.chartPoints[1].amount, 0)
    }

    private func makeModel(_ snapshot: UsageSnapshot, language: AppLanguage = .english) -> UsageHistoryModel {
        let model = UsageHistoryModel(provider: "codex", language: language, now: { fixtureNow })
        model.update(snapshot: snapshot, source: "synthetic", isLoading: false, isStale: false, notice: nil, language: language)
        return model
    }

    private func chartFixture() throws -> UsageSnapshot {
        try historyFixture { object in
            object["history"] = ["version": 1, "providers": ["codex", "claude"], "days": [
                ["date": "2026-10-14", "provider": "codex", "aggregate": historyAggregate("partial", 12.34)],
                ["date": "2026-10-15", "provider": "codex", "aggregate": historyAggregate("unknown", 0)],
                ["date": "2026-10-16", "provider": "codex", "aggregate": historyAggregate("estimated", 0)],
                ["date": "2026-10-17", "provider": "codex", "aggregate": historyAggregate("estimated", 5)],
                ["date": "2026-10-18", "provider": "codex", "aggregate": historyAggregate("partial", 0)],
                ["date": "2026-10-14", "provider": "claude", "aggregate": historyAggregate("estimated", 2)]
            ]]
            var history = object["history"] as! [String: Any]
            history["sessionDays"] = (history["days"] as! [[String: Any]]).map { day in
                var row = day
                row["sessionId"] = day["provider"] as? String == "claude" ? "ns22-claude" : "main"
                return row
            }
            object["history"] = history
            var sessions = object["sessions"] as! [[String: Any]]
            var claude = sessions.first { $0["id"] as? String == "main" }!
            claude["id"] = "ns22-claude"; claude["provider"] = "claude"; claude["title"] = "NS22 Claude fixture"
            sessions.append(claude); object["sessions"] = sessions
        }
    }
}
