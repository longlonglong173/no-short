import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

final class SessionDaysTests: XCTestCase {
    func shared(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> UsageSnapshot {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../usage/tests/fixtures/session-days-snapshot.json").standardized
        var object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
        edit(&object)
        return try UsageSnapshot.decode(JSONSerialization.data(withJSONObject: object))
    }
    func testSharedExactRangeAndIndependentLastActivity() throws {
        let snapshot = try shared(), range = UsageHistoryRange(start: "2026-09-30", end: "2026-10-01")
        let result = try XCTUnwrap(UsageHistory.sessionUsageForRange(snapshot, provider: "all", range: range))
        XCTAssertTrue(result.reconciled)
        XCTAssertEqual(result.aggregate.tokens.total, UsageHistory.project(snapshot, provider: "all", range: range)?.aggregate.tokens.total)
        XCTAssertEqual(result.sessions.count, 2)
        XCTAssertEqual(UsageHistory.sessionUsageForRange(snapshot, provider: "all", range: .init(start: "2000-01-01", end: "2000-01-01"))?.sessions.count, 0)
    }
    func testMalformedOptionalLedgerPreservesHistoryAndMismatchIsExplicit() throws {
        let old = try shared { var h = $0["history"] as! [String: Any]; h.removeValue(forKey: "sessionDays"); $0["history"] = h }
        XCTAssertNotNil(old.history); XCTAssertNil(old.history?.sessionDays)
        for ledger: Any in ["bad", [["date":"bad"]], NSNull()] {
            let s = try shared { var h = $0["history"] as! [String: Any]; h["sessionDays"] = ledger; $0["history"] = h }
            XCTAssertNotNil(s.history); XCTAssertNil(s.history?.sessionDays)
        }
        let mismatch = try shared { var h = $0["history"] as! [String: Any]; h["sessionDays"] = []; $0["history"] = h }
        XCTAssertFalse(UsageHistory.sessionUsageForRange(mismatch, provider: "all", range: .init(start: "2026-09-30", end: "2026-10-01"))!.reconciled)
    }
    @MainActor func testDetailsAreWindowLocalAndRangeScoped() throws {
        let snapshot = try shared()
        let model = UsageHistoryModel(provider: "all", language: .english, now: { snapshot.generatedAt })
        model.update(snapshot: snapshot, source: "synthetic", isLoading: false, isStale: false, notice: nil, language: .english)
        model.selectDay("2026-10-01")
        let row = try XCTUnwrap(model.sessionUsage?.sessions.first)
        model.selectSession(row.sessionId)
        XCTAssertEqual(model.selectedSessionUsage?.aggregate.tokens.total, row.aggregate.tokens.total)
        model.selectDay("2026-09-30")
        XCTAssertNil(model.selectedSessionUsage)
    }
}

import AppKit
import SwiftUI
extension SessionDaysTests {
    @MainActor func testSessionDetailsRenderAllLanguagesCompactAndRegular() throws {
        _ = NSApplication.shared
        for language in AppLanguage.allCases {
            for width in [440, 960] {
                let snapshot = try shared(), model = UsageHistoryModel(provider: "all", language: language, now: { snapshot.generatedAt })
                model.update(snapshot: snapshot, source: "synthetic", isLoading: false, isStale: false, notice: nil, language: language)
                model.selectDay("2026-10-01"); model.selectSession(model.sessionUsage!.sessions[0].sessionId)
                let host = NSHostingView(rootView: UsageHistoryView(model: model).environment(\.colorScheme, width == 440 ? .dark : .light))
                host.frame = NSRect(x: 0, y: 0, width: width, height: 1300); host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds)); host.cacheDisplay(in: host.bounds, to: bitmap)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsWide, width)
                if let dir = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
                    try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: dir).appendingPathComponent("ns18-\(language.rawValue)-\(width).png"))
                }
            }
        }
    }
}

extension SessionDaysTests {
    func testPriceOnlyMismatchKeepsRowsAndUnknownCostIsNotZero() throws {
        let s = try shared { object in
            var h = object["history"] as! [String: Any]
            var rows = h["sessionDays"] as! [[String: Any]]
            var aggregate = rows[0]["aggregate"] as! [String: Any]
            aggregate["cost"] = ["amountUSD": NSNull(), "knownCostUSD": 0, "status": "unknown"]
            var models = aggregate["models"] as! [[String: Any]]; models[0]["cost"] = aggregate["cost"]; aggregate["models"] = models
            rows[0]["aggregate"] = aggregate; h["sessionDays"] = rows; object["history"] = h
        }
        let result = try XCTUnwrap(UsageHistory.sessionUsageForRange(s, provider: "all", range: .init(start: "2026-09-30", end: "2026-10-01")))
        XCTAssertFalse(result.reconciled); XCTAssertEqual(result.reconciliationIssue, "pricing")
        XCTAssertEqual(result.sessions.count, 2); XCTAssertNil(result.aggregate.cost.amountUSD)
        XCTAssertEqual(result.aggregate.cost.status, "partial")
    }
}

extension SessionDaysTests {
    func testReferenceIndexRequiresExactProviderAndSessionIdentity() throws {
        let range = UsageHistoryRange(start: "2026-09-30", end: "2026-10-01")
        for wrongReference in ["missing-session", "claude-fixture"] {
            let snapshot = try shared { object in
                var history = object["history"] as! [String: Any]
                var ledger = history["sessionDays"] as! [[String: Any]]
                let index = ledger.firstIndex { $0["provider"] as? String == "codex" }!
                ledger[index]["sessionId"] = wrongReference
                history["sessionDays"] = ledger; object["history"] = history
            }
            XCTAssertNotNil(snapshot.history?.sessionDays)
            XCTAssertNil(UsageHistory.sessionUsageForRange(snapshot, provider: "all", range: range))
        }
        // Equal IDs on different providers remain valid distinct identities.
        let snapshot = try shared { object in
            var sessions = object["sessions"] as! [[String: Any]]
            let claude = sessions.firstIndex { $0["provider"] as? String == "claude" }!
            sessions[claude]["id"] = "codex-fixture"; object["sessions"] = sessions
            var history = object["history"] as! [String: Any]
            var ledger = history["sessionDays"] as! [[String: Any]]
            for i in ledger.indices where ledger[i]["provider"] as? String == "claude" { ledger[i]["sessionId"] = "codex-fixture" }
            history["sessionDays"] = ledger; object["history"] = history
        }
        XCTAssertTrue(try XCTUnwrap(UsageHistory.sessionUsageForRange(snapshot, provider: "all", range: range)).reconciled)
    }
}
