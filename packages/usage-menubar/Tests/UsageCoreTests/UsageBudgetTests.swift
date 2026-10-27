import XCTest
@testable import UsageCore

final class UsageBudgetTests: XCTestCase {
    func snapshot(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> UsageSnapshot {
        try fixture { object in
            object["today"] = Self.aggregate(8); object["month"] = Self.aggregate(80)
            object["providerBreakdowns"] = [
                ["provider": "codex", "today": Self.aggregate(3), "month": Self.aggregate(30), "chart": []],
                ["provider": "claude", "today": Self.aggregate(5), "month": Self.aggregate(50), "chart": []]
            ]
            edit(&object)
        }
    }
    static func aggregate(_ known: Double, status: String = "estimated") -> [String: Any] {
        ["tokens": ["input": 10, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 10],
         "cost": ["amountUSD": status == "estimated" ? known as Any : NSNull(), "knownCostUSD": known, "status": status], "models": []]
    }
    func testDisabledRulesAndInvalidConfigurationNeverActivate() throws {
        XCTAssertTrue(UsageBudgets.evaluate(snapshot: try snapshot(), rules: [], now: fixtureNow).isEmpty)
        for amount in [0, -1, Double.infinity, Double.nan] {
            XCTAssertThrowsError(try UsageBudgetRule(provider: "all", period: .day, limitUSD: amount))
        }
        XCTAssertThrowsError(try UsageBudgetRule(provider: "other", period: .day, limitUSD: 1))
        let invalid = Data(#"{"provider":"all","period":"day","limitUSD":-1}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(UsageBudgetRule.self, from: invalid))
    }
    func testProviderBudgetsUsePeriodBreakdownsNotLifetimeSessionOrCurrentFilter() throws {
        let rules = try [UsageBudgetRule(provider: "all", period: .day, limitUSD: 7),
                         UsageBudgetRule(provider: "codex", period: .day, limitUSD: 4),
                         UsageBudgetRule(provider: "claude", period: .month, limitUSD: 40)]
        let values = UsageBudgets.evaluate(snapshot: try snapshot(), rules: rules, now: fixtureNow)
        XCTAssertEqual(values.map(\.exceeded), [true, false, true])
        XCTAssertEqual(values.map { $0.cost?.amountUSD }, [8, 3, 50])
        XCTAssertEqual(values.map(\.periodKey), ["2026-10-18", "2026-10-18", "2026-10"])
    }
    func testPartialLowerBoundsUnknownAndKnownZeroAreNeverPreciseRemainingBudget() throws {
        let rule = try UsageBudgetRule(provider: "all", period: .day, limitUSD: 5)
        for (status, amount, exceeded, uncertain) in [("partial", 0.0, false, true), ("partial", 8.0, true, true), ("unknown", 0.0, false, true), ("estimated", 0.0, false, false)] {
            let value = try XCTUnwrap(UsageBudgets.evaluate(snapshot: snapshot { $0["today"] = Self.aggregate(amount, status: status) }, rules: [rule], now: fixtureNow).first)
            XCTAssertEqual(value.exceeded, exceeded); XCTAssertEqual(value.uncertain, uncertain)
            XCTAssertTrue(value.available)
        }
    }
    func testStaleErrorsClockAndMissingProvidersAreUnavailable() throws {
        let rule = try UsageBudgetRule(provider: "codex", period: .day, limitUSD: 1)
        XCTAssertFalse(UsageBudgets.evaluate(snapshot: nil, rules: [rule], now: fixtureNow)[0].available)
        let s = try snapshot()
        XCTAssertFalse(UsageBudgets.evaluate(snapshot: s, rules: [rule], now: fixtureNow, isStale: true)[0].available)
        XCTAssertFalse(UsageBudgets.evaluate(snapshot: s, rules: [rule], now: fixtureNow.addingTimeInterval(90))[0].available)
        XCTAssertFalse(UsageBudgets.evaluate(snapshot: try snapshot { $0["status"] = "error" }, rules: [rule], now: fixtureNow)[0].available)
        let mixed = try snapshot { object in
            object.removeValue(forKey: "providerBreakdowns")
            var sessions = object["sessions"] as! [[String: Any]]; sessions[0]["provider"] = "claude"; object["sessions"] = sessions
        }
        XCTAssertFalse(UsageBudgets.evaluate(snapshot: mixed, rules: [rule], now: fixtureNow)[0].available)
        let legacy = try snapshot { $0.removeValue(forKey: "providerBreakdowns") }
        XCTAssertEqual(UsageBudgets.evaluate(snapshot: legacy, rules: [rule], now: fixtureNow)[0].cost?.amountUSD, 8)
    }
    func testTrackerSurvivesRestartThresholdTogglesAndMissingDataWithoutRepeating() throws {
        let rule = try UsageBudgetRule(provider: "all", period: .day, limitUSD: 5), s = try snapshot()
        let rows = UsageBudgets.evaluate(snapshot: s, rules: [rule], now: fixtureNow)
        var tracker = UsageBudgetTracker()
        XCTAssertEqual(tracker.consume(rows, source: "PRIVATE_SOURCE", timeZone: s.timeZone).count, 1)
        XCTAssertTrue(tracker.consume(rows, source: "PRIVATE_SOURCE", timeZone: s.timeZone).isEmpty)
        let encoded = try JSONEncoder().encode(tracker)
        XCTAssertFalse(String(decoding: encoded, as: UTF8.self).contains("PRIVATE_SOURCE"))
        tracker = try JSONDecoder().decode(UsageBudgetTracker.self, from: encoded)
        let changed = try UsageBudgetRule(provider: "all", period: .day, limitUSD: 1)
        XCTAssertTrue(tracker.consume(UsageBudgets.evaluate(snapshot: s, rules: [changed], now: fixtureNow), source: "PRIVATE_SOURCE", timeZone: s.timeZone).isEmpty)
        _ = tracker.consume(UsageBudgets.evaluate(snapshot: nil, rules: [rule], now: fixtureNow), source: "PRIVATE_SOURCE", timeZone: s.timeZone)
        XCTAssertTrue(tracker.consume(rows, source: "PRIVATE_SOURCE", timeZone: s.timeZone).isEmpty)
        XCTAssertEqual(tracker.consume(rows, source: "OTHER_SOURCE", timeZone: s.timeZone).count, 1)
    }
    func testCalendarRolloverRearmsDayAndMonthSeparately() throws {
        let rules = try [UsageBudgetRule(provider: "all", period: .day, limitUSD: 1), UsageBudgetRule(provider: "all", period: .month, limitUSD: 1)]
        var tracker = UsageBudgetTracker()
        let s = try snapshot()
        XCTAssertEqual(tracker.consume(UsageBudgets.evaluate(snapshot: s, rules: rules, now: fixtureNow), source: "a", timeZone: s.timeZone).count, 2)
        for (date, expected) in [("2026-10-19T05:00:00Z", 1), ("2026-11-01T05:00:00Z", 2)] {
            let next = try snapshot { $0["generatedAt"] = date }, now = ISO8601DateFormatter().date(from: date)!
            XCTAssertEqual(tracker.consume(UsageBudgets.evaluate(snapshot: next, rules: rules, now: now), source: "a", timeZone: next.timeZone).count, expected)
        }
    }
    func testTrackerSeparatesTimeZonesAndBoundsOldRecords() throws {
        let rule = try UsageBudgetRule(provider: "all", period: .day, limitUSD: 1), s = try snapshot()
        let rows = UsageBudgets.evaluate(snapshot: s, rules: [rule], now: fixtureNow)
        var tracker = UsageBudgetTracker()
        XCTAssertEqual(tracker.consume(rows, source: "same", timeZone: "UTC").count, 1)
        XCTAssertEqual(tracker.consume(rows, source: "same", timeZone: "Asia/Ho_Chi_Minh").count, 1)
        XCTAssertTrue(tracker.consume(rows, source: "same", timeZone: "UTC").isEmpty)
        for index in 0..<520 { _ = tracker.consume(rows, source: "source-\(index)", timeZone: "UTC") }
        let encoded = try JSONEncoder().encode(tracker)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual((object["records"] as? [String])?.count, 512)
        XCTAssertTrue(tracker.consume(rows, source: "source-519", timeZone: "UTC").isEmpty)
        XCTAssertEqual(tracker.consume(rows, source: "source-0", timeZone: "UTC").count, 1)
    }

}
