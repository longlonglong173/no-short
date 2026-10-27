import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

func comparisonFixture(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> UsageSnapshot {
    let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .appendingPathComponent("../../../usage/tests/fixtures/comparison-snapshot.json").standardizedFileURL
    var object = try JSONSerialization.jsonObject(with: Data(contentsOf: path)) as! [String: Any]
    edit(&object)
    return try UsageSnapshot.decode(JSONSerialization.data(withJSONObject: object))
}
final class UsageComparisonTests: XCTestCase {
    let range = UsageHistoryRange(start: "2024-03-01", end: "2024-03-02")
    func testSameFixtureMatchesTypeScriptAcrossLeapDay() throws {
        let value = try XCTUnwrap(UsageComparison.compare(try comparisonFixture(), provider: "all", range: range))
        XCTAssertEqual(value.previousRange.start, "2024-02-28")
        XCTAssertEqual(value.previousRange.end, "2024-02-29")
        XCTAssertEqual(value.summary.tokens.absolute, 160)
        XCTAssertEqual(try XCTUnwrap(value.summary.tokens.percent), 133.333333, accuracy: 0.00001)
        XCTAssertEqual(value.summary.cost?.absolute, 2)
        XCTAssertEqual(value.summary.cost?.percent, 100)
        XCTAssertEqual(try XCTUnwrap(value.summary.cache.percentagePoints), -18.333333, accuracy: 0.00001)
        XCTAssertEqual(value.providers.map(\.name), ["codex", "claude"])
        XCTAssertEqual(value.models.map(\.name), ["codex / model-a", "claude / model-b"])
        XCTAssertNil(value.models[1].cost?.percent)
    }
    func testUnknownAndStaleCostsAreNotComparedAsExact() throws {
        let stale = try comparisonFixture { $0["status"] = "stale" }
        XCTAssertNil(UsageComparison.compare(stale, provider: "all", range: range)?.summary.cost)
        XCTAssertNil(UsageComparison.compare(try comparisonFixture(), provider: "all", range: range, isStale: true)?.summary.cost)
        let unknown = try comparisonFixture { object in
            var history = object["history"] as! [String: Any]
            var days = history["days"] as! [[String: Any]]
            days[0]["aggregate"] = historyAggregate("unknown", 0, tokens: 120, name: "model-a")
            history["days"] = days; object["history"] = history
        }
        let value = try XCTUnwrap(UsageComparison.compare(unknown, provider: "all", range: range))
        XCTAssertNil(value.summary.cost)
        XCTAssertNil(value.models.first { $0.name == "codex / model-a" }?.cost)
    }
    func testEmptyBaselineAndMinimumDateDoNotInventPercentages() throws {
        let value = try XCTUnwrap(UsageComparison.compare(try comparisonFixture(), provider: "claude", range: range))
        XCTAssertEqual(value.summary.tokens.absolute, 50)
        XCTAssertNil(value.summary.tokens.percent)
        XCTAssertEqual(value.summary.cost?.absolute, 1)
        XCTAssertNil(value.summary.cost?.percent)
        XCTAssertNil(value.summary.cache.previous)
        XCTAssertNil(value.summary.cache.percentagePoints)
        XCTAssertNil(UsageComparison.compare(try comparisonFixture(), provider: "all", range: .init(start: "0001-01-01", end: "0001-01-01")))
    }
    @MainActor func testWindowComparisonIsOptInAndNeverChangesRangeOrExportScope() throws {
        let s = try comparisonFixture(), model = UsageHistoryModel(provider: "all", language: .english, now: { s.generatedAt })
        model.update(snapshot: s, source: "synthetic", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertFalse(model.comparisonEnabled)
        XCTAssertNil(model.comparison)
        XCTAssertTrue(model.applyCustom(start: range.start, end: range.end))
        model.comparisonEnabled = true
        XCTAssertEqual(model.comparison?.summary.cost?.absolute, 2)
        XCTAssertEqual(model.range?.start, range.start)
        let data = try model.prepareExport(.json, includeSessionIdentifiers: false).data
        let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(object["start"] as? String, range.start)
        XCTAssertEqual(object["end"] as? String, range.end)
        XCTAssertEqual((object["days"] as? [[String: Any]])?.count, 2)
        model.setProvider("claude")
        XCTAssertEqual(model.comparison?.summary.tokens.absolute, 50)
    }
}
