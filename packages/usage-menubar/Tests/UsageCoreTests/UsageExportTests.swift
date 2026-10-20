import XCTest
import AppKit
@testable import UsageCore
@testable import NoShortUsageMenuBar

final class UsageExportTests: XCTestCase {
    func testJSONMatchesSharedFixtureScopeAndOmitsIdentifiersByDefault() throws {
        let path = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../usage/tests/fixtures/history-snapshot.json").standardizedFileURL
        let snapshot = try UsageSnapshot.decode(Data(contentsOf: path))
        let document = try XCTUnwrap(UsageExport.create(snapshot, provider: "all", start: "2026-09-30", end: "2026-10-01"))
        let json = try exportJSON(document)
        XCTAssertEqual(Set(json.keys), Set(["formatVersion", "costBasis", "provider", "start", "end", "timeZone", "generatedAt", "status", "aggregate", "days"]))
        XCTAssertEqual(json["formatVersion"] as? Int, 1)
        XCTAssertEqual(json["costBasis"] as? String, "api-equivalent-estimate-not-billing")
        XCTAssertEqual(json["provider"] as? String, "all")
        XCTAssertEqual(json["timeZone"] as? String, "UTC")
        XCTAssertEqual(json["generatedAt"] as? String, "2026-10-01T12:00:00Z")
        XCTAssertEqual(json["status"] as? String, "ready")
        let aggregate = try XCTUnwrap(json["aggregate"] as? [String: Any])
        XCTAssertEqual((aggregate["tokens"] as? [String: Any])?["total"] as? Double, 375)
        XCTAssertEqual((aggregate["cost"] as? [String: Any])?["amountUSD"] as? Double, 7)
        XCTAssertEqual((json["days"] as? [Any])?.count, 2)
        XCTAssertFalse(try document.serialize(.json).contains("codex-fixture"))
        XCTAssertFalse(try document.serialize(.json).contains("lastActivity"))
    }
    func testOptInReferencesUseLocalLastActivityBoundariesAndNeverLifetimeAmounts() throws {
        let snapshot = try historyFixture { object in
            let template = (object["sessions"] as! [[String: Any]])[2]
            object["sessions"] = [
                ("start", "codex", "2026-10-16T17:00:00Z" as Any),
                ("end", "codex", "2026-10-17T16:59:59.999Z" as Any),
                ("before", "codex", "2026-10-16T16:59:59Z" as Any),
                ("after", "codex", "2026-10-17T17:00:00Z" as Any),
                ("other", "claude", "2026-10-17T12:00:00Z" as Any),
                ("invalid", "codex", "2026-02-30T12:00:00Z" as Any),
                ("missing", "codex", NSNull() as Any)
            ].map { id, provider, activity in
                var row = template; row["id"] = id; row["provider"] = provider
                row["title"] = "Private title " + id; row["lastActivity"] = activity
                row["cost"] = ["amountUSD": 999999, "knownCostUSD": 999999, "status": "estimated"]
                return row
            }
        }
        let doc = try XCTUnwrap(UsageExport.create(snapshot, provider: "codex", start: "2026-10-17", end: "2026-10-17", includeSessionIdentifiers: true))
        let json = try exportJSON(doc)
        let refs = try XCTUnwrap(json["sessionReferences"] as? [String: Any])
        XCTAssertEqual(refs["scope"] as? String, "last-activity-in-range-not-cost-attribution")
        let rows = try XCTUnwrap(refs["items"] as? [[String: Any]])
        XCTAssertEqual(rows.map { $0["id"] as? String }, ["start", "end"])
        for row in rows { XCTAssertEqual(Set(row.keys), Set(["id", "title", "provider", "lastActivity"])) }
        XCTAssertFalse(try doc.serialize(.json).contains("999999"))
        XCTAssertEqual(((json["aggregate"] as? [String: Any])?["cost"] as? [String: Any])?["amountUSD"] as? Double, 2)
    }
    func testCSVQuotesUnicodeAndDefusesFormulaPrefixesButKeepsNumbersNumeric() throws {
        let names = ["=SUM(1,2)", " \t+cmd", "\n-2", "\r@evil", "🪷 \"quoted\",\nnext", "123"]
        let snapshot = try historyFixture { object in
            var history = object["history"] as! [String: Any], days = history["days"] as! [[String: Any]]
            var aggregate = historyAggregate()
            aggregate["models"] = names.map { (historyAggregate(name: $0)["models"] as! [[String: Any]])[0] }
            days[0]["aggregate"] = aggregate; history["days"] = days; object["history"] = history
        }
        let doc = try XCTUnwrap(UsageExport.create(snapshot, provider: "codex", start: "2026-10-17", end: "2026-10-17"))
        let csv = try doc.serialize(.csv), rows = parseExportCSV(csv)
        let header = try XCTUnwrap(rows.first), modelIndex = try XCTUnwrap(header.firstIndex(of: "model"))
        XCTAssertEqual(header, ["recordType", "scope", "date", "provider", "model", "input", "output", "cacheRead", "cacheWrite", "total",
            "amountUSD", "knownCostUSD", "pricingStatus", "timezone", "start", "end", "generatedAt", "status", "costBasis"])
        XCTAssertFalse(header.contains("sessionId")); XCTAssertFalse(header.contains("sessionTitle")); XCTAssertFalse(header.contains("lastActivity"))
        let models = Set(rows.dropFirst().compactMap { $0.indices.contains(modelIndex) && !$0[modelIndex].isEmpty ? $0[modelIndex] : nil })
        for name in names.prefix(4) { XCTAssertTrue(models.contains("'" + name)) }
        XCTAssertTrue(models.contains(names[4])); XCTAssertTrue(models.contains("123"))
        XCTAssertTrue(csv.contains("\"🪷 \"\"quoted\"\",\nnext\""))
        XCTAssertTrue(csv.contains(",\"123\","))
        XCTAssertTrue(csv.contains(",10,"), "Token values must remain numeric")
    }
    func testUnknownAndPartialZeroStayDistinctInBothFormats() throws {
        for (provider, status) in [("codex", "partial"), ("claude", "unknown")] {
            let doc = try XCTUnwrap(UsageExport.create(try historyFixture(), provider: provider, start: "2026-10-18", end: "2026-10-18"))
            let json = try exportJSON(doc), aggregate = try XCTUnwrap(json["aggregate"] as? [String: Any])
            let cost = try XCTUnwrap(aggregate["cost"] as? [String: Any])
            XCTAssertTrue(cost["amountUSD"] is NSNull)
            XCTAssertEqual(cost["knownCostUSD"] as? Double, 0); XCTAssertEqual(cost["status"] as? String, status)
            let csv = parseExportCSV(try doc.serialize(.csv)), header = try XCTUnwrap(csv.first)
            let amount = try XCTUnwrap(header.firstIndex(of: "amountUSD")), known = try XCTUnwrap(header.firstIndex(of: "knownCostUSD"))
            let pricing = try XCTUnwrap(header.firstIndex(of: "pricingStatus"))
            XCTAssertEqual(csv[1][amount], ""); XCTAssertEqual(csv[1][known], "0"); XCTAssertEqual(csv[1][pricing], status)
        }
    }
    func testUnavailableHistoryIsNotExportedAsZeroButSuccessfulEmptyRangeIs() throws {
        XCTAssertNil(UsageExport.create(try fixture(), provider: "all", start: "2026-10-17", end: "2026-10-18"))
        XCTAssertNil(UsageExport.create(try historyFixture { $0["status"] = "error" }, provider: "all", start: "2026-10-17", end: "2026-10-18"))
        XCTAssertNil(UsageExport.create(try historyFixture(), provider: "all", start: "2026-02-30", end: "2026-10-18"))
        let doc = try XCTUnwrap(UsageExport.create(try historyFixture { $0["status"] = "stale" }, provider: "all", start: "2026-09-01", end: "2026-09-02"))
        let json = try exportJSON(doc)
        XCTAssertEqual(json["status"] as? String, "stale")
        XCTAssertEqual((json["days"] as? [Any])?.count, 0)
        XCTAssertEqual(((json["aggregate"] as? [String: Any])?["cost"] as? [String: Any])?["amountUSD"] as? Double, 0)
    }
}
private func exportJSON(_ document: UsageExport) throws -> [String: Any] {
    try XCTUnwrap(JSONSerialization.jsonObject(with: Data(document.serialize(.json).utf8)) as? [String: Any])
}

/// RFC 4180 parser for assertions, including embedded CR/LF and doubled quotes.
private func parseExportCSV(_ text: String) -> [[String]] {
    let chars = Array(text); var rows: [[String]] = [], row: [String] = [], cell = "", quoted = false, i = 0
    while i < chars.count {
        let c = chars[i]
        if c == "\"" {
            if quoted && i + 1 < chars.count && chars[i + 1] == "\"" { cell.append("\""); i += 1 }
            else { quoted.toggle() }
        } else if c == "," && !quoted { row.append(cell); cell = "" }
        else if (c == "\n" || c == "\r" || c == "\r\n") && !quoted {
            row.append(cell); rows.append(row); row = []; cell = ""
            if c == "\r" && i + 1 < chars.count && chars[i + 1] == "\n" { i += 1 }
        } else { cell.append(c) }
        i += 1
    }
    if !row.isEmpty || !cell.isEmpty { row.append(cell); rows.append(row) }
    return rows
}

@MainActor final class UsageExportNativeTests: XCTestCase {
    func testPreparedPayloadFreezesRangeProviderAndStaleStatusInsteadOfSelectedDay() throws {
        let model = UsageHistoryModel(provider: "all", language: .english, now: { fixtureNow })
        model.update(snapshot: try historyFixture(), source: "private-source", isLoading: false, isStale: true, notice: "failed refresh", language: .english)
        XCTAssertFalse(model.includeSessionIdentifiers)
        XCTAssertTrue(model.applyCustom(start: "2026-10-17", end: "2026-10-18"))
        model.selectDay("2026-10-18")
        let payload = try model.prepareExport(.json, includeSessionIdentifiers: false)
        model.setProvider("claude"); model.setPreset(.previousMonth)
        model.update(snapshot: nil, source: "new-source", isLoading: true, isStale: false, notice: nil, language: .simplifiedChinese)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: payload.data) as? [String: Any])
        XCTAssertEqual(json["provider"] as? String, "all"); XCTAssertEqual(json["status"] as? String, "stale")
        XCTAssertEqual(json["start"] as? String, "2026-10-17"); XCTAssertEqual(json["end"] as? String, "2026-10-18")
        XCTAssertNil(json["sessionReferences"])
        XCTAssertEqual(((json["aggregate"] as? [String: Any])?["tokens"] as? [String: Any])?["total"] as? Double, 90)
        XCTAssertEqual(payload.filename, "no-short-usage-all-2026-10-17-2026-10-18.json")
        XCTAssertFalse(String(decoding: payload.data, as: UTF8.self).contains("private-source"))
        XCTAssertThrowsError(try model.prepareExport(.csv, includeSessionIdentifiers: false))
    }
    func testSessionIdentifierOptInResetsWhenSourceChanges() throws {
        let model = UsageHistoryModel(provider: "all", language: .english, now: { fixtureNow })
        let snapshot = try historyFixture()
        model.update(snapshot: snapshot, source: "SourceA", isLoading: false, isStale: false, notice: nil, language: .english)
        model.includeSessionIdentifiers = true
        model.update(snapshot: snapshot, source: "SourceA", isLoading: true, isStale: false, notice: nil, language: .english)
        XCTAssertTrue(model.includeSessionIdentifiers, "A refresh of the same source retains the explicit opt-in")
        model.update(snapshot: nil, source: "SourceB", isLoading: true, isStale: false, notice: nil, language: .english)
        XCTAssertFalse(model.includeSessionIdentifiers, "A different source requires its own explicit opt-in")
    }
    func testNativeExportFailuresFollowCurrentLanguageWithoutOpeningSavePanel() {
        let model = UsageHistoryModel(provider: "all", language: .english)
        model.exportFailure = .writeFailed
        for (language, expected) in [(AppLanguage.english, "Could not save the export. Check write permissions and try again."),
                                    (.vietnamese, "Không thể lưu tệp xuất. Kiểm tra quyền ghi và thử lại."),
                                    (.simplifiedChinese, "无法保存导出文件。请检查写入权限后重试。") ] {
            model.update(snapshot: nil, source: "a", isLoading: false, isStale: false, notice: nil, language: language)
            XCTAssertEqual(model.exportFailureMessage, expected)
        }
    }
}

extension UsageExportTests {
    func testCSVDefusesBOMBeforeFormulaInModelAndOptInSessionTitle() throws {
        let formulaText = "\u{feff}=1+2"
        let snapshot = try historyFixture { object in
            var history = object["history"] as! [String: Any], days = history["days"] as! [[String: Any]]
            days[0]["aggregate"] = historyAggregate(name: formulaText); history["days"] = days; object["history"] = history
            var sessions = object["sessions"] as! [[String: Any]]
            sessions[2]["title"] = formulaText; sessions[2]["lastActivity"] = "2026-10-17T05:00:00Z"; object["sessions"] = sessions
        }
        let document = try XCTUnwrap(UsageExport.create(snapshot, provider: "codex", start: "2026-10-17", end: "2026-10-17", includeSessionIdentifiers: true))
        let rows = parseExportCSV(try document.serialize(.csv)), header = try XCTUnwrap(rows.first)
        let model = try XCTUnwrap(header.firstIndex(of: "model")), title = try XCTUnwrap(header.firstIndex(of: "sessionTitle"))
        let type = try XCTUnwrap(header.firstIndex(of: "recordType")), input = try XCTUnwrap(header.firstIndex(of: "input"))
        XCTAssertTrue(rows.dropFirst().contains { $0[model] == "'" + formulaText })
        let session = try XCTUnwrap(rows.dropFirst().first { $0[type] == "session-reference" })
        XCTAssertEqual(session[title], "'" + formulaText)
        XCTAssertEqual(session[input], "", "References cannot contain lifetime usage")
        // JSONSerialization drops a leading BOM inside string values on this SDK; JSONDecoder preserves it.
        struct Titles: Decodable {
            struct References: Decodable { let items: [Item] }
            struct Item: Decodable { let title: String }
            let sessionReferences: References
        }
        let json = try JSONDecoder().decode(Titles.self, from: Data(document.serialize(.json).utf8))
        XCTAssertEqual(json.sessionReferences.items.first?.title, formulaText)
    }
}
