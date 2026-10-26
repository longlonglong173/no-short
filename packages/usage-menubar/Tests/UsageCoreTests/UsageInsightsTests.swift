import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

func insightsFixture(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> UsageSnapshot {
    let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../usage/tests/fixtures/insights-snapshot.json").standardizedFileURL
    var object = try JSONSerialization.jsonObject(with: Data(contentsOf: path)) as! [String: Any]
    edit(&object); return try UsageSnapshot.decode(JSONSerialization.data(withJSONObject: object))
}
final class UsageInsightsTests: XCTestCase {
    func testSharedFixtureUsesLastSevenObservedDaysMedianAndScenario() throws {
        let s = try insightsFixture(), v = UsageInsights.evaluate(s, provider: "codex", now: s.generatedAt)
        XCTAssertEqual(v.sampleDates, ["2024-02-20","2024-02-23","2024-02-25","2024-02-27","2024-02-28","2024-02-29","2024-03-01"])
        XCTAssertEqual(v.sampleCount, 7); XCTAssertEqual(v.medianUSD, 4); XCTAssertEqual(v.thresholdUSD, 8)
        XCTAssertEqual(v.anomaly, true); XCTAssertNil(v.anomalyReason)
        XCTAssertEqual(try XCTUnwrap(v.meanUSD), 26 / 7, accuracy: 0.000001)
        XCTAssertEqual(v.recordedMonthUSD, 13); XCTAssertEqual(v.remainingDays, 29)
        XCTAssertEqual(try XCTUnwrap(v.scenarioUSD), 13 + 26 / 7 * 29, accuracy: 0.000001)
    }
    func testSparseAndPartialSamplesNeverImplyCompleteCoverage() throws {
        let sparse = try insightsFixture { o in
            var h = o["history"] as! [String: Any]; h["days"] = Array((h["days"] as! [[String: Any]]).suffix(7)); o["history"] = h
        }
        XCTAssertEqual(UsageInsights.evaluate(sparse, provider: "all", now: sparse.generatedAt).sampleCount, 6)
        XCTAssertEqual(UsageInsights.evaluate(sparse, provider: "all", now: sparse.generatedAt).scenarioReason, .history)
        for status in ["partial", "unknown"] {
            let s = try insightsFixture { o in
                var h = o["history"] as! [String: Any], days = h["days"] as! [[String: Any]]
                days[7]["aggregate"] = historyAggregate(status, 0, tokens: 100, name: "model-a")
                h["days"] = days; o["history"] = h
            }
            let v = UsageInsights.evaluate(s, provider: "all", now: s.generatedAt)
            XCTAssertEqual(v.excludedUnpricedDays, 1); XCTAssertEqual(v.sampleCount, 7)
            XCTAssertEqual(v.scenarioReason, .pricing); XCTAssertNil(v.scenarioUSD)
        }
    }
    func testStaleFutureTimezoneAndCalendarMonthEdges() throws {
        let s = try insightsFixture()
        for delta in [45.001, -60.001, 86400] {
            XCTAssertEqual(UsageInsights.evaluate(s, provider: "all", now: s.generatedAt.addingTimeInterval(delta)).anomalyReason, .stale)
        }
        XCTAssertEqual(UsageInsights.evaluate(s, provider: "all", now: s.generatedAt.addingTimeInterval(45)).anomaly, true)
        for (timestamp, remaining) in [("2024-02-29T12:00:00Z",0),("2024-03-01T12:00:00Z",30),("2024-03-31T12:00:00Z",0)] {
            let changed = try insightsFixture { $0["generatedAt"] = timestamp }
            XCTAssertEqual(UsageInsights.evaluate(changed, provider: "all", now: changed.generatedAt).remainingDays, remaining)
        }
        let crossed = try insightsFixture { $0["generatedAt"] = "2024-03-02T23:59:50Z" }
        XCTAssertEqual(UsageInsights.evaluate(crossed, provider: "all", now: crossed.generatedAt.addingTimeInterval(15)).scenarioReason, .stale)
        let honolulu = try insightsFixture { $0["generatedAt"] = "2024-03-02T23:59:50Z"; $0["timeZone"] = "Pacific/Honolulu" }
        XCTAssertNotNil(UsageInsights.evaluate(honolulu, provider: "all", now: honolulu.generatedAt.addingTimeInterval(15)).scenarioUSD)
    }
    func testAnomalyTrackerPersistsIndependentKeysAcrossRestart() throws {
        var tracker = UsageAnomalyTracker()
        XCTAssertTrue(tracker.consume(source: "source-a", timeZone: "UTC", provider: "all", day: "2024-03-02"))
        tracker = try JSONDecoder().decode(UsageAnomalyTracker.self, from: JSONEncoder().encode(tracker))
        XCTAssertFalse(tracker.consume(source: "source-a", timeZone: "UTC", provider: "all", day: "2024-03-02"))
        for args in [("source-b","UTC","all","2024-03-02"),("source-a","Asia/Ho_Chi_Minh","all","2024-03-02"),("source-a","UTC","codex","2024-03-02"),("source-a","UTC","all","2024-03-03")] {
            XCTAssertTrue(tracker.consume(source: args.0, timeZone: args.1, provider: args.2, day: args.3))
        }
    }
}

extension UsageInsightsTests {
    func testEverySelectedObservationRequiresCompletePriceAndNoBackfill() throws {
        for index in 1...7 {
            let s = try insightsFixture { o in
                var h = o["history"] as! [String: Any], days = h["days"] as! [[String: Any]]
                days[index]["aggregate"] = historyAggregate("unknown", 0, tokens: 100, name: "model-a")
                h["days"] = days; o["history"] = h
            }
            let v = UsageInsights.evaluate(s, provider: "codex", now: s.generatedAt)
            XCTAssertEqual(v.sampleDates.first, "2024-02-20"); XCTAssertEqual(v.anomalyReason, .pricing); XCTAssertNil(v.scenarioUSD)
        }
    }
    func testStrictThresholdZeroMedianMissingTodayAndCustomSnapshotRepricing() throws {
        for (amount, expected) in [(8.0, false), (8.01, true)] {
            let s = try insightsFixture { o in
                var h = o["history"] as! [String: Any], days = h["days"] as! [[String: Any]]
                days[8]["aggregate"] = historyAggregate("estimated", amount, tokens: 100, name: "model-a")
                h["days"] = days; o["history"] = h
            }
            XCTAssertEqual(UsageInsights.evaluate(s, provider: "all", now: s.generatedAt).anomaly, expected)
        }
        for amount in [0.0, 1.0] {
            let s = try insightsFixture { o in
                var h = o["history"] as! [String: Any], days = h["days"] as! [[String: Any]]
                for index in days.indices { days[index]["aggregate"] = historyAggregate("estimated", amount, tokens: 100, name: "model-a") }
                h["days"] = days; o["history"] = h
                o["pricing"] = ["basis": "current-custom-rates", "configurationRevision": "custom-\(amount)"]
            }
            let v = UsageInsights.evaluate(s, provider: "all", now: s.generatedAt)
            XCTAssertEqual(try XCTUnwrap(v.meanUSD), amount, accuracy: 0.000001); XCTAssertEqual(try XCTUnwrap(v.scenarioUSD), 31 * amount, accuracy: 0.000001)
            XCTAssertEqual(v.anomalyReason, amount == 0 ? .baseline : nil)
        }
        let missing = try insightsFixture { o in
            var h = o["history"] as! [String: Any], days = h["days"] as! [[String: Any]]
            days.removeLast(); h["days"] = days; o["history"] = h
        }
        let v = UsageInsights.evaluate(missing, provider: "all", now: missing.generatedAt)
        XCTAssertEqual(v.anomalyReason, .today); XCTAssertEqual(v.scenarioReason, .today); XCTAssertNil(v.scenarioUSD)
    }
    func testFallbackAndUnpricedModelOriginsBlockConclusionsEvenWhenAggregateClaimsEstimated() throws {
        for source in ["fallback", "unpriced", "mixed"] {
            let s = try insightsFixture { o in
                var h = o["history"] as! [String: Any], days = h["days"] as! [[String: Any]], a = days[8]["aggregate"] as! [String: Any]
                var models = a["models"] as! [[String: Any]]; models[0]["pricing"] = ["source": source]; a["models"] = models
                days[8]["aggregate"] = a; h["days"] = days; o["history"] = h
            }
            let v = UsageInsights.evaluate(s, provider: "all", now: s.generatedAt)
            XCTAssertEqual(v.anomalyReason, .pricing); XCTAssertNil(v.scenarioUSD)
        }
    }
    @MainActor func testHistoryOptInsUseCurrentFilterWithoutChangingExportScope() throws {
        let s = try insightsFixture(), model = UsageHistoryModel(provider: "all", language: .english, now: { s.generatedAt })
        model.update(snapshot: s, source: "synthetic", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertNil(model.insights); model.anomalyEnabled = true; model.scenarioEnabled = true
        XCTAssertEqual(model.insights?.anomaly, true)
        XCTAssertTrue(model.applyCustom(start: "2024-03-01", end: "2024-03-02"))
        let object = try JSONSerialization.jsonObject(with: model.prepareExport(.json, includeSessionIdentifiers: false).data) as! [String: Any]
        XCTAssertEqual(object["start"] as? String, "2024-03-01"); XCTAssertEqual((object["days"] as? [[String: Any]])?.count, 2)
        XCTAssertNil(object["scenarioUSD"])
        model.setProvider("claude"); XCTAssertEqual(model.insights?.sampleCount, 0)
        model.update(snapshot: s, source: "other", isLoading: false, isStale: true, notice: "read failure", language: .english)
        XCTAssertEqual(model.insights?.anomalyReason, .stale); XCTAssertEqual(model.notice, "read failure")
    }
}
