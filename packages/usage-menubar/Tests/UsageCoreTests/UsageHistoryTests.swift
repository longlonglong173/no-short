import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class UsageHistoryWindowTests: XCTestCase {
    func testHistoryEntryExistsInEveryLanguage() throws {
        _ = NSApplication.shared
        let menu = MenuBuilder(), snapshot = try fixture()
        for (language, title) in [(AppLanguage.english, "View Details…"), (.vietnamese, "Xem chi tiết…"), (.simplifiedChinese, "查看详情…")] {
            menu.update(presentation: UsagePresentation.make(snapshot: snapshot, stale: false, loading: false, now: snapshot.generatedAt),
                source: LogSource(rootsEnvironment: "/tmp/history"), isLoading: false, notice: nil,
                loginState: .notRegistered, snapshot: snapshot, language: language)
            XCTAssertNotNil(menu.menu.item(withTitle: title)?.action, "History must be reachable from the native menu")
        }
    }
}

func historyAggregate(_ status: String = "estimated", _ known: Double = 1, tokens: Double = 10, name: String = "model-a") -> [String: Any] {
    let t: [String: Any] = ["input": tokens, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": tokens]
    let cost: [String: Any] = ["amountUSD": status == "estimated" ? known as Any : NSNull(), "knownCostUSD": known, "status": status]
    return ["tokens": t, "cost": cost, "models": [["name": name, "tokens": t, "cost": cost]]]
}
func historyFixture(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> UsageSnapshot {
    try fixture { object in
        object["history"] = ["version": 1, "providers": ["codex", "claude"], "days": [
            ["date": "2026-10-17", "provider": "codex", "aggregate": historyAggregate("estimated", 2, tokens: 20)],
            ["date": "2026-10-18", "provider": "codex", "aggregate": historyAggregate("partial", 0, tokens: 30)],
            ["date": "2026-10-18", "provider": "claude", "aggregate": historyAggregate("unknown", 0, tokens: 40, name: "model-b")]
        ]]
        edit(&object)
    }
}

final class UsageHistoryCoreTests: XCTestCase {
    func testOptionalHistoryDecodesAndMalformedHistoryDoesNotBreakLegacySnapshot() throws {
        XCTAssertNil(try fixture().history)
        XCTAssertEqual(try historyFixture().history?.days.count, 3)
        for invalid: Any in [NSNull(), "bad", ["version": 2, "providers": [], "days": []],
            ["version": 1, "providers": ["other"], "days": []]] {
            let snapshot = try fixture { $0["history"] = invalid }
            XCTAssertNil(snapshot.history)
            XCTAssertEqual(snapshot.latestSession?.id, "main")
        }
        for mutation: (inout [String: Any]) -> Void in [
            { $0["date"] = "2026-02-30" }, { $0["date"] = "2026-2-03" },
            { $0["provider"] = "other" }, { $0["aggregate"] = historyAggregate("partial", -1) },
            { $0["aggregate"] = historyAggregate("estimated", 1, tokens: -1) },
            { $0["aggregate"] = historyAggregate("unknown", 1) },
            { $0["aggregate"] = ["tokens": [:], "cost": [:], "models": []] }
        ] {
            let snapshot = try historyFixture { object in
                var history = object["history"] as! [String: Any]
                var rows = history["days"] as! [[String: Any]]
                mutation(&rows[0]); history["days"] = rows; object["history"] = history
            }
            XCTAssertNil(snapshot.history)
            XCTAssertEqual(snapshot.today.cost.amountUSD, 2.35)
        }
        for duplicate in [true, false] {
            let snapshot = try historyFixture { object in
                var h = object["history"] as! [String: Any]
                if duplicate { var days = h["days"] as! [[String: Any]]; days.append(days[0]); h["days"] = days }
                else { h["providers"] = ["codex"] }
                object["history"] = h
            }
            XCTAssertNil(snapshot.history)
        }
    }

    func testCalendarRangesAreInclusiveAcrossLeapDSTYearAndTimezoneBoundaries() throws {
        func instant(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
        for (preset, now, zone, start, end) in [
            (UsageHistoryPreset.sevenDays, "2024-03-11T06:30:00Z", "America/New_York", "2024-03-05", "2024-03-11"),
            (.thirtyDays, "2024-03-01T05:00:00Z", "America/New_York", "2024-02-01", "2024-03-01"),
            (.previousMonth, "2024-03-01T05:00:00Z", "America/New_York", "2024-02-01", "2024-02-29"),
            (.previousMonth, "2026-01-12T12:00:00Z", "UTC", "2025-12-01", "2025-12-31"),
            (.month, "2026-10-01T00:30:00Z", "America/Los_Angeles", "2026-09-01", "2026-09-30"),
            (.month, "2026-10-01T00:30:00Z", "Asia/Ho_Chi_Minh", "2026-10-01", "2026-10-01")
        ] {
            XCTAssertEqual(UsageHistory.range(preset, now: instant(now), timeZone: zone), UsageHistoryRange(start: start, end: end))
        }
        let now = instant("2026-10-18T05:00:00Z")
        for range in [UsageHistoryRange(start: "2026-02-30", end: "2026-10-18"),
                      .init(start: "2026-10-18", end: "2026-10-17"), .init(start: "2026-10-18", end: "2026-10-19")] {
            XCTAssertNil(UsageHistory.range(.custom, now: now, timeZone: "UTC", custom: range))
        }
        XCTAssertEqual(UsageHistory.range(.custom, now: now, timeZone: "UTC", custom: .init(start: "2026-10-18", end: "2026-10-18"))?.start, "2026-10-18")
    }

    func testProjectionUsesDailyRowsNotLifetimeSessionsAndPreservesPartialZero() throws {
        let snapshot = try historyFixture(), range = UsageHistoryRange(start: "2026-10-17", end: "2026-10-18")
        let all = try XCTUnwrap(UsageHistory.project(snapshot, provider: "all", range: range))
        XCTAssertEqual(all.aggregate.tokens.total, 90)
        XCTAssertEqual(all.aggregate.cost.status, "partial")
        XCTAssertEqual(all.aggregate.cost.knownCostUSD, 2)
        XCTAssertEqual(all.aggregate.models.map(\.name), ["model-a", "model-b"])
        XCTAssertEqual(all.aggregate.models[0].tokens.total, 50)
        let day = try XCTUnwrap(UsageHistory.project(snapshot, provider: "codex", range: .init(start: "2026-10-18", end: "2026-10-18")))
        XCTAssertEqual(day.aggregate.cost.status, "partial")
        XCTAssertEqual(UsagePresentation.money(day.aggregate.cost), "≥$0.00")
        let unknown = try XCTUnwrap(UsageHistory.project(snapshot, provider: "claude", range: range))
        XCTAssertEqual(unknown.aggregate.cost.status, "unknown")
        XCTAssertNil(unknown.aggregate.cost.amountUSD)
        let empty = try XCTUnwrap(UsageHistory.project(snapshot, provider: "claude", range: .init(start: "2026-10-01", end: "2026-10-02")))
        XCTAssertEqual(empty.aggregate.tokens.total, 0)
        XCTAssertEqual(empty.aggregate.cost.status, "estimated")
        XCTAssertEqual(empty.aggregate.cost.amountUSD, 0)
        XCTAssertNil(UsageHistory.project(try fixture(), provider: "all", range: range))
        let codexOnly = try historyFixture { o in
            var h = o["history"] as! [String: Any]; h["providers"] = ["codex"]
            h["days"] = (h["days"] as! [[String: Any]]).filter { $0["provider"] as? String == "codex" }; o["history"] = h
        }
        XCTAssertNil(UsageHistory.project(codexOnly, provider: "claude", range: range))
    }

    func testZeroPricedUsageMixedWithUnknownIsPartialNotUnknownOrFree() throws {
        let s = try historyFixture { object in
            object["history"] = ["version": 1, "providers": ["codex"], "days": [
                ["date": "2026-10-18", "provider": "codex", "aggregate": historyAggregate("estimated", 0)],
                ["date": "2026-10-17", "provider": "codex", "aggregate": historyAggregate("unknown", 0)]
            ]]
        }
        let projection = try XCTUnwrap(UsageHistory.project(s, provider: "all", range: .init(start: "2026-10-17", end: "2026-10-18")))
        XCTAssertEqual(projection.aggregate.cost.status, "partial")
        XCTAssertEqual(projection.aggregate.cost.knownCostUSD, 0)
    }
}

@MainActor final class UsageHistoryModelTests: XCTestCase {
    func testIndependentFiltersCustomValidationAndDayBreakdownDoNotChangeSummary() throws {
        let panel = UsagePanelModel(preferredLanguages: ["en"])
        panel.update(snapshot: try historyFixture(), source: "a", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        panel.chooseSession("main")
        let model = UsageHistoryModel(provider: panel.providerFilter, language: .english, now: { fixtureNow })
        model.update(snapshot: try historyFixture(), source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertEqual(model.preset, .thirtyDays)
        XCTAssertEqual(model.range, .init(start: "2026-09-19", end: "2026-10-18"))
        model.setProvider("all")
        model.selectDay("2026-10-18")
        XCTAssertEqual(model.projection?.aggregate.tokens.total, 90)
        XCTAssertEqual(model.modelRows.reduce(0) { $0 + $1.tokens.total }, 70)
        XCTAssertEqual(panel.providerFilter, "codex"); XCTAssertEqual(panel.selectedSessionID, "main")
        XCTAssertFalse(model.applyCustom(start: "2026-10-19", end: "2026-10-19"))
        XCTAssertNotNil(model.validationMessage)
        XCTAssertEqual(model.range?.start, "2026-09-19")
        XCTAssertTrue(model.applyCustom(start: "2026-10-17", end: "2026-10-17"))
        XCTAssertEqual(model.preset, .custom); XCTAssertNil(model.selectedDay)
        XCTAssertEqual(model.projection?.aggregate.tokens.total, 20)
        model.setPreset(.previousMonth)
        XCTAssertEqual(model.projection?.aggregate.cost.amountUSD, 0)
        XCTAssertNil(model.selectedDay)
    }
    func testSourceChangeDropsOldDataAndLanguageLoadingRefreshStayIndependent() throws {
        let model = UsageHistoryModel(provider: "claude", language: .english, now: { fixtureNow })
        var refreshes = 0; model.onRefresh = { refreshes += 1 }
        model.update(snapshot: try historyFixture(), source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        model.selectDay("2026-10-18")
        model.update(snapshot: nil, source: "b", isLoading: true, isStale: false, notice: nil, language: .simplifiedChinese)
        XCTAssertNil(model.activeHistory); XCTAssertNil(model.projection); XCTAssertNil(model.selectedDay)
        XCTAssertEqual(model.provider, "claude"); XCTAssertEqual(model.language, .simplifiedChinese)
        XCTAssertEqual(refreshes, 0)
        model.onRefresh?(); XCTAssertEqual(refreshes, 1)
        model.update(snapshot: try historyFixture(), source: "b", isLoading: false, isStale: true, notice: "Đọc dữ liệu thất bại", language: .vietnamese)
        XCTAssertNotNil(model.projection); XCTAssertTrue(model.isStale); XCTAssertEqual(model.notice, "Đọc dữ liệu thất bại")
        model.update(snapshot: try fixture(), source: "b", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertNil(model.projection)
    }
    func testPresetReevaluatesInNewSnapshotTimezoneAndCustomRemainsIndependent() throws {
        let now = ISO8601DateFormatter().date(from: "2026-10-01T00:30:00Z")!
        let model = UsageHistoryModel(provider: "all", language: .english, now: { now })
        model.setPreset(.month)
        model.update(snapshot: try historyFixture { $0["timeZone"] = "America/Los_Angeles" }, source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertEqual(model.range, .init(start: "2026-09-01", end: "2026-09-30"))
        model.update(snapshot: try historyFixture(), source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertEqual(model.range, .init(start: "2026-10-01", end: "2026-10-01"))
    }
}

extension UsageHistoryWindowTests {
    func testRetainedResizableWindowReopensWithFiltersSizeAndCommandW() throws {
        _ = NSApplication.shared
        let model = UsageHistoryModel(provider: "codex", language: .english, now: { fixtureNow })
        let controller = UsageHistoryWindowController(model: model)
        let window = try XCTUnwrap(controller.window)
        XCTAssertTrue(window.styleMask.contains(.resizable)); XCTAssertFalse(window.isReleasedWhenClosed)
        controller.present()
        defer { controller.close() }
        model.setProvider("claude"); model.setPreset(.sevenDays)
        window.setContentSize(NSSize(width: 620, height: 440))
        let frame = window.frame
        let closeKey = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: .command,
            timestamp: 0, windowNumber: window.windowNumber, context: nil, characters: "w", charactersIgnoringModifiers: "w", isARepeat: false, keyCode: 13))
        XCTAssertTrue(window.performKeyEquivalent(with: closeKey))
        XCTAssertFalse(window.isVisible)
        controller.present()
        XCTAssertTrue(controller.window === window); XCTAssertEqual(window.frame.size, frame.size)
        XCTAssertEqual(model.provider, "claude"); XCTAssertEqual(model.preset, .sevenDays)
    }
    func testHistoryRendersLanguagesThemesSmallViewportAndUnavailableStates() throws {
        _ = NSApplication.shared
        for language in AppLanguage.allCases {
            for (name, scheme) in [("light", ColorScheme.light), ("dark", .dark), ("small-stale", .light), ("legacy", .dark)] {
                let model = UsageHistoryModel(provider: "all", language: language, now: { fixtureNow })
                model.update(snapshot: name == "legacy" ? try fixture() : try historyFixture(), source: "synthetic-local-logs", isLoading: false,
                    isStale: name == "small-stale", notice: name == "small-stale" ? "Đọc dữ liệu thất bại" : nil, language: language)
                let host = NSHostingView(rootView: UsageHistoryView(model: model).environment(\.colorScheme, scheme))
                let width = name == "small-stale" ? 480 : 960, height = name == "small-stale" ? 340 : 700
                host.frame = NSRect(x: 0, y: 0, width: width, height: height); host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsWide, width)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsHigh, height)
                if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                    try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
                    try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: directory).appendingPathComponent("ns09-\(language.rawValue)-\(name).png"))
                }
            }
        }
    }
}

extension UsageHistoryCoreTests {
    func testSharedEngineFixtureMatchesNativeTotalsAndDailyScope() throws {
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../usage/tests/fixtures/history-snapshot.json").standardizedFileURL
        let snapshot = try UsageSnapshot.decode(Data(contentsOf: path))
        let all = try XCTUnwrap(UsageHistory.project(snapshot, provider: "all", range: .init(start: "2026-09-30", end: "2026-10-01")))
        XCTAssertEqual(all.aggregate.tokens.total, 375)
        XCTAssertEqual(all.aggregate.cost.amountUSD, 7)
        XCTAssertEqual(all.aggregate.models.map(\.name), ["claude-fixture", "gpt-fixture"])
        XCTAssertEqual(all.days.map(\.date), ["2026-09-30", "2026-10-01"])
        let day = try XCTUnwrap(UsageHistory.project(snapshot, provider: "codex", range: .init(start: "2026-10-01", end: "2026-10-01")))
        XCTAssertEqual(day.aggregate.tokens.total, 60)
        XCTAssertEqual(day.aggregate.cost.amountUSD, 0.75)
        XCTAssertNotEqual(day.aggregate.tokens.total, snapshot.sessions.first?.tokens.total)
    }
    func testHistoryRejectsEmptyProvidersEmptyModelNamesAndMissingPriceField() throws {
        for edit: (inout [String: Any]) -> Void in [
            { $0["providers"] = [] ; $0["days"] = [] },
            { history in
                var days = history["days"] as! [[String: Any]]
                days[0]["aggregate"] = historyAggregate(name: ""); history["days"] = days
            },
            { history in
                var days = history["days"] as! [[String: Any]]
                var aggregate = historyAggregate("partial", 0)
                aggregate["cost"] = ["knownCostUSD": 0, "status": "partial"]
                days[0]["aggregate"] = aggregate; history["days"] = days
            }
        ] {
            let snapshot = try historyFixture { object in
                var history = object["history"] as! [String: Any]; edit(&history); object["history"] = history
            }
            XCTAssertNil(snapshot.history)
            XCTAssertEqual(snapshot.latestSession?.id, "main")
        }
    }
}
extension UsageHistoryModelTests {
    func testValidationMessageChangesLanguageWithoutReplacingValidProjection() throws {
        let model = UsageHistoryModel(provider: "all", language: .english, now: { fixtureNow })
        let snapshot = try historyFixture()
        model.update(snapshot: snapshot, source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertFalse(model.applyCustom(start: "bad", end: "bad"))
        model.update(snapshot: snapshot, source: "a", isLoading: false, isStale: false, notice: nil, language: .simplifiedChinese)
        XCTAssertEqual(model.validationMessage, "日期无效。请使用 YYYY-MM-DD，开始日期不得晚于结束日期，且不得晚于今天。")
        XCTAssertEqual(model.projection?.aggregate.tokens.total, 90)
    }
}

extension UsageHistoryWindowTests {
    func testHistoryDocumentSupportsKeyboardNavigationToTheModelTable() async throws {
        _ = NSApplication.shared
        let model = UsageHistoryModel(provider: "all", language: .english, now: { fixtureNow })
        model.update(snapshot: try historyFixture(), source: "synthetic", isLoading: false, isStale: false, notice: nil, language: .english)
        let controller = UsageHistoryWindowController(model: model)
        let window = try XCTUnwrap(controller.window)
        let host = try XCTUnwrap(window.contentViewController)
        window.setContentSize(NSSize(width: 480, height: 340))
        host.view.layoutSubtreeIfNeeded()
        try await Task.sleep(for: .milliseconds(100))
        func scrollView(_ view: NSView) -> NSScrollView? {
            (view as? NSScrollView) ?? view.subviews.lazy.compactMap { scrollView($0) }.first
        }
        let scroll = try XCTUnwrap(scrollView(host.view)), document = try XCTUnwrap(scroll.documentView)
        XCTAssertGreaterThan(document.bounds.height, scroll.contentView.bounds.height)
        let event = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
            windowNumber: window.windowNumber, context: nil, characters: "\u{F72B}", charactersIgnoringModifiers: "\u{F72B}", isARepeat: false, keyCode: 119))
        host.keyDown(with: event)
        XCTAssertGreaterThan(scroll.contentView.bounds.minY, 0)
        XCTAssertEqual(scroll.contentView.bounds.maxY, document.bounds.maxY, accuracy: 1)
    }
}

extension UsageHistoryCoreTests {
    func testUnknownPlusEmptyEstimatedAggregateRemainsUnknown() throws {
        let history = try JSONSerialization.jsonObject(with: Data(#"""
        {"version":1,"providers":["codex"],"days":[
          {"date":"2026-09-30","provider":"codex","aggregate":{
            "tokens":{"input":10,"output":0,"cacheRead":0,"cacheWrite":0,"total":10},
            "cost":{"amountUSD":null,"knownCostUSD":0,"status":"unknown"},"models":[]}},
          {"date":"2026-10-01","provider":"codex","aggregate":{
            "tokens":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0},
            "cost":{"amountUSD":0,"knownCostUSD":0,"status":"estimated"},"models":[]}}
        ]}
        """#.utf8))
        let snapshot = try fixture { $0["history"] = history }
        let projection = try XCTUnwrap(UsageHistory.project(snapshot, provider: "all", range: .init(start: "2026-09-30", end: "2026-10-01")))
        XCTAssertEqual(projection.aggregate.tokens.total, 10)
        XCTAssertEqual(projection.aggregate.cost.status, "unknown")
        XCTAssertEqual(projection.days.first?.aggregate.cost.status, "unknown")
        XCTAssertNil(projection.aggregate.cost.amountUSD)
    }
}

extension UsageHistoryModelTests {
    func testCustomRangeRecoversWhenTimezoneReturnsAfterTemporaryFutureDate() throws {
        let now = ISO8601DateFormatter().date(from: "2026-10-01T00:30:00Z")!
        let model = UsageHistoryModel(provider: "all", language: .english, now: { now })
        let utc = try historyFixture { $0["timeZone"] = "UTC" }
        let losAngeles = try historyFixture { $0["timeZone"] = "America/Los_Angeles" }
        model.update(snapshot: utc, source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertTrue(model.applyCustom(start: "2026-10-01", end: "2026-10-01"))
        model.update(snapshot: losAngeles, source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertNil(model.range); XCTAssertNil(model.projection)
        XCTAssertNotNil(model.validationMessage, "Timezone revalidation must explain the unavailable range")
        XCTAssertEqual(model.customStart, "2026-10-01"); XCTAssertEqual(model.customEnd, "2026-10-01")
        model.update(snapshot: utc, source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        XCTAssertEqual(model.range, .init(start: "2026-10-01", end: "2026-10-01"))
        XCTAssertNotNil(model.projection); XCTAssertNil(model.validationMessage)
        XCTAssertEqual(model.preset, .custom)
    }
    func testChartDistinguishesPartialZeroUnknownAndPricedZeroWithoutInventingHeight() throws {
        let model = UsageHistoryModel(provider: "all", language: .english, now: { fixtureNow })
        let snapshot = try historyFixture { object in
            object["history"] = ["version": 1, "providers": ["codex"], "days": [
                ["date": "2026-10-16", "provider": "codex", "aggregate": historyAggregate("estimated", 0)],
                ["date": "2026-10-17", "provider": "codex", "aggregate": historyAggregate("partial", 0)],
                ["date": "2026-10-18", "provider": "codex", "aggregate": historyAggregate("unknown", 0)]
            ]]
        }
        model.update(snapshot: snapshot, source: "a", isLoading: false, isStale: false, notice: nil, language: .english)
        let points = model.chartPoints
        XCTAssertEqual(points.count, 3)
        XCTAssertEqual(points[0].amount, 0); XCTAssertNil(points[0].markerAmount)
        XCTAssertEqual(points[1].amount, 0); XCTAssertEqual(points[1].markerAmount, 0)
        XCTAssertNil(points[2].amount); XCTAssertEqual(points[2].markerAmount, 0)
        XCTAssertEqual(points[1].pricingLabel, "Partial pricing")
        XCTAssertEqual(points[2].pricingLabel, "Unknown price")
    }
}
