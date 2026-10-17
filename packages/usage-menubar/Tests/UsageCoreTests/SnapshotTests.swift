import Foundation
import XCTest
@testable import UsageCore

func fixtureData() throws -> Data {
    try Data(contentsOf: Bundle.module.url(forResource: "snapshot-v1", withExtension: "json", subdirectory: "Fixtures")!)
}
func fixture(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> UsageSnapshot {
    var object = try JSONSerialization.jsonObject(with: fixtureData()) as! [String: Any]
    edit(&object)
    return try UsageSnapshot.decode(JSONSerialization.data(withJSONObject: object))
}
let fixtureNow = Date(timeIntervalSince1970: 1_792_299_600) // 2026-10-18T05:00Z

final class SnapshotTests: XCTestCase {
    func testCostsPreserveEstimatedPartialAndUnknown() throws {
        let full = try fixture()
        XCTAssertEqual(UsagePresentation.make(snapshot: full, stale: false, loading: false, now: full.generatedAt).statusTitle, "NS $2.35")
        let partial = try fixture { o in
            var today = o["today"] as! [String: Any]
            today["cost"] = ["amountUSD": NSNull(), "knownCostUSD": 2.35, "status": "partial"]
            o["today"] = today
        }
        XCTAssertEqual(UsagePresentation.make(snapshot: partial, stale: false, loading: false, now: partial.generatedAt).statusTitle, "NS ≥$2.35")
        let unknown = try fixture { o in
            var today = o["today"] as! [String: Any]
            today["cost"] = ["amountUSD": NSNull(), "knownCostUSD": 0, "status": "unknown"]
            o["today"] = today
        }
        XCTAssertEqual(UsagePresentation.make(snapshot: unknown, stale: false, loading: false, now: unknown.generatedAt).statusTitle, "NS —")
        XCTAssertEqual(UsagePresentation.make(snapshot: nil, stale: false, loading: true, now: Date()).statusTitle, "NS …")
        XCTAssertEqual(UsagePresentation.make(snapshot: nil, stale: false, loading: false, now: Date()).statusTitle, "NS —")
    }
    func testSelectsMainThenUnknownAndNeverSubagents() throws {
        XCTAssertEqual(try fixture().latestSession?.id, "main")
        XCTAssertEqual(try fixture { o in o["sessions"] = (o["sessions"] as! [[String:Any]]).filter { $0["kind"] as? String != "main" } }.latestSession?.id, "unknown")
        XCTAssertNil(try fixture { o in o["sessions"] = (o["sessions"] as! [[String:Any]]).filter { $0["kind"] as? String == "subagent" } }.latestSession)
    }
    func testRejectsUnsupportedAndMalformedSnapshots() throws {
        for edit: (inout [String:Any]) -> Void in [
            { $0["schemaVersion"] = 2 }, { $0["source"] = "other" }, { $0["ccusageVersion"] = "0" },
            { $0["generatedAt"] = "invalid" }, { $0["timeZone"] = "invalid" }, { $0.removeValue(forKey: "month") },
            { o in var today = o["today"] as! [String:Any]; today["cost"] = ["amountUSD": -1, "knownCostUSD": -1, "status": "estimated"]; o["today"] = today },
            { o in var today = o["today"] as! [String:Any]; today["cost"] = ["amountUSD": NSNull(), "knownCostUSD": 0, "status": "estimated"]; o["today"] = today }
        ] { XCTAssertThrowsError(try fixture(edit)) }
    }
    func testStalenessAndMidnightAreVisible() throws {
        let s = try fixture()
        for now in [s.generatedAt.addingTimeInterval(46), s.generatedAt.addingTimeInterval(-61), s.generatedAt.addingTimeInterval(86_400)] {
            XCTAssertTrue(UsagePresentation.make(snapshot: s, stale: false, loading: false, now: now).statusTitle.contains("⚠"))
        }
        for status in ["stale", "error"] {
            let s = try fixture { $0["status"] = status }
            XCTAssertTrue(UsagePresentation.make(snapshot: s, stale: false, loading: false, now: s.generatedAt).statusTitle.contains("⚠"))
        }
    }
    func testEmptyAndUnicodeAndExactTokenBreakdown() throws {
        let empty = try fixture { o in
            o["sessions"] = []; o["status"] = "empty"
            for key in ["today", "month"] { o[key] = ["tokens": ["input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0], "cost":["amountUSD":0,"knownCostUSD":0,"status":"estimated"],"models":[]] }
        }
        XCTAssertEqual(UsagePresentation.make(snapshot: empty, stale: false, loading: false, now: empty.generatedAt).statusTitle, "NS $0.00")
        let s = try fixture()
        let p = UsagePresentation.make(snapshot: s, stale: false, loading: false, now: s.generatedAt)
        XCTAssertTrue(p.sessionLines.joined().contains("Phiên chính 🪷"))
        XCTAssertTrue(p.todayLines.joined().contains("1,200"))
        XCTAssertTrue(p.todayLines.joined().contains("800"))
        XCTAssertTrue(p.todayLines.joined().contains("2,080"))
    }
}
