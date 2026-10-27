import Foundation
import XCTest
@testable import UsageCore

final class PricingTests: XCTestCase {
    func testSaveZeroRatesRestoreAndRejectInvalidWithoutChangingFile() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ns16-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = PricingConfigStore(url: root.appendingPathComponent("pricing.json"))
        XCTAssertTrue(try store.load().overrides.isEmpty)
        let rule = PriceOverride(provider: "codex", model: "my-model", input: 0, output: 0, cacheRead: 0, cacheWrite: 0)
        try store.save([rule], now: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(try store.load().overrides, [rule])
        let original = try Data(contentsOf: store.url)
        var bad = rule; bad.input = -.infinity
        XCTAssertThrowsError(try store.save([bad]))
        XCTAssertEqual(try Data(contentsOf: store.url), original)
        XCTAssertThrowsError(try store.save([rule, rule]))
        try store.save([])
        XCTAssertTrue(try store.load().overrides.isEmpty)
        let attrs = try FileManager.default.attributesOfItem(atPath: store.url.path)
        XCTAssertEqual((attrs[.posixPermissions] as? NSNumber)?.intValue, 0o600)
    }
    func testMalformedAndSymlinkConfigFailExplicitly() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ns16-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("pricing.json")
        let store = PricingConfigStore(url: file)
        try Data("{".utf8).write(to: file)
        XCTAssertThrowsError(try store.load())
        try FileManager.default.removeItem(at: file)
        let target = root.appendingPathComponent("outside.json")
        try Data("{}".utf8).write(to: target)
        try FileManager.default.createSymbolicLink(at: file, withDestinationURL: target)
        XCTAssertThrowsError(try store.load())
        XCTAssertThrowsError(try store.save([]))
        XCTAssertEqual(try String(contentsOf: target, encoding: .utf8), "{}")
    }
    func testSnapshotHistoryAndExportPreserveOptionalPricingMetadata() throws {
        let metadata: [String: Any] = ["source": "custom", "provider": "codex", "updatedAt": "2026-10-18T05:00:00Z", "rates": ["input": 1, "output": 2, "cacheRead": 0, "cacheWrite": 0]]
        let s = try fixture { o in
            o["pricing"] = ["basis": "current-custom-rates", "configurationRevision": "test", "updatedAt": "2026-10-18T05:00:00Z"]
            var today = o["today"] as! [String: Any]
            today["models"] = [["name":"my-model", "tokens":today["tokens"]!, "cost":today["cost"]!, "pricing":metadata]]
            o["today"] = today
            o["history"] = ["version":1,"providers":["codex"],"days":[["date":"2026-10-18","provider":"codex","aggregate":today]]]
        }
        XCTAssertEqual(s.today.models[0].pricing?.source, "custom")
        let doc = try XCTUnwrap(UsageExport.create(s, provider: "codex", start: "2026-10-18", end: "2026-10-18"))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(doc.serialize(.json).utf8)) as? [String: Any])
        XCTAssertEqual((json["pricing"] as? [String: Any])?["basis"] as? String, "current-custom-rates")
        let csv = try doc.serialize(.csv)
        XCTAssertTrue(csv.contains("pricingOrigin")); XCTAssertTrue(csv.contains("current-custom-rates"))
        XCTAssertTrue(csv.contains("custom")); XCTAssertTrue(csv.contains("2026-10-18T05:00:00Z"))
        XCTAssertNil(try fixture().pricing)
    }
}
