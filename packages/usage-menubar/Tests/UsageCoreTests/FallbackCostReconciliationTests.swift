import XCTest
@testable import UsageCore

/// Identical synthetic real-reader snapshot is projected by TypeScript and native.
final class FallbackCostReconciliationTests: XCTestCase {
    func snapshot() throws -> UsageSnapshot {
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../usage/tests/fixtures/ns21-mixed-snapshot.json").standardizedFileURL
        return try UsageSnapshot.decode(Data(contentsOf: path))
    }
    func assertPartial(_ cost: UsageCost, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertNil(cost.amountUSD, file: file, line: line)
        XCTAssertEqual(cost.knownCostUSD, 1.6875, accuracy: 1e-8, file: file, line: line)
        XCTAssertEqual(cost.status, "partial", file: file, line: line)
    }
    func testReaderSnapshotPreservesKnownCostAcrossNativeProjections() throws {
        let s = try snapshot(), range = UsageHistoryRange(start: "2026-10-17", end: "2026-10-17")
        assertPartial(s.today.cost); assertPartial(s.month.cost)
        XCTAssertEqual(s.today.tokens.total, 2200000)
        XCTAssertEqual(s.today.models.count, 1); assertPartial(s.today.models[0].cost)
        for provider in ["all", "codex"] {
            let history = try XCTUnwrap(UsageHistory.project(s, provider: provider, range: range))
            assertPartial(history.aggregate.cost)
            let detail = try XCTUnwrap(UsageHistory.sessionUsageForRange(s, provider: provider, range: range))
            XCTAssertTrue(detail.reconciled); assertPartial(detail.aggregate.cost)
            let groups = try XCTUnwrap(UsageGrouping.project(s, provider: provider, range: range))
            XCTAssertTrue(groups.reconciled); assertPartial(groups.aggregate.cost)
            let comparison = try XCTUnwrap(UsageComparison.compare(s, provider: provider, range: range))
            assertPartial(comparison.summary.current.cost)
            XCTAssertNil(comparison.summary.cost)
            XCTAssertTrue(comparison.models.allSatisfy { $0.cost == nil })
            let insights = UsageInsights.evaluate(s, provider: provider, now: s.generatedAt)
            XCTAssertNil(insights.todayUSD); XCTAssertNil(insights.recordedMonthUSD); XCTAssertNil(insights.scenarioUSD)
        }
    }
    func testKnownLowerBoundExceedsOneDollarBudgetWithoutPreciseRemainingOrStaleAlert() throws {
        let s = try snapshot()
        let rules = try ["all", "codex"].flatMap { provider in
            try [UsageBudgetRule(provider: provider, period: .day, limitUSD: 1),
                 UsageBudgetRule(provider: provider, period: .month, limitUSD: 1)]
        }
        let values = UsageBudgets.evaluate(snapshot: s, rules: rules, now: s.generatedAt)
        XCTAssertEqual(values.count, 4)
        for value in values {
            XCTAssertTrue(value.exceeded); XCTAssertTrue(value.uncertain)
            assertPartial(try XCTUnwrap(value.cost))
        }
        XCTAssertTrue(UsageBudgets.evaluate(snapshot: s, rules: rules, now: s.generatedAt, isStale: true).allSatisfy { !$0.available && !$0.exceeded })
        XCTAssertTrue(UsageBudgets.evaluate(snapshot: s, rules: rules, now: s.generatedAt.addingTimeInterval(90)).allSatisfy { !$0.available && !$0.exceeded })
        // Pure tracker only: no OS notification delivery or permission request.
        var tracker = UsageBudgetTracker()
        XCTAssertEqual(tracker.consume(values, source: "ns21-synthetic", timeZone: "UTC").count, 4)
        XCTAssertTrue(tracker.consume(values, source: "ns21-synthetic", timeZone: "UTC").isEmpty)
    }
}
