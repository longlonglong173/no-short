import XCTest
@testable import UsageCore

final class ContextReaderTests: XCTestCase {
    func testClaudeContextRetentionKeeps512RecentSessionsWithoutDeletingUnrelatedFiles() throws {
        let fm = FileManager.default
        let directory = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? fm.removeItem(at:directory) }
        try fm.createDirectory(at:directory,withIntermediateDirectories:true)
        let now = Date(), base = now.addingTimeInterval(-1000)
        for index in 0..<512 {
            let value = ContextReading(sessionID:"old-\(index)",usedTokens:10,limitTokens:100,recordedAt:base.addingTimeInterval(Double(index)))
            let file = directory.appendingPathComponent(value.sessionID + ".json")
            try JSONEncoder().encode(value).write(to:file)
            try fm.setAttributes([.modificationDate:value.recordedAt],ofItemAtPath:file.path)
        }
        let note = directory.appendingPathComponent("notes.txt")
        try Data("keep".utf8).write(to:note)
        let otherJSON = directory.appendingPathComponent("notes.json")
        try Data("{\"note\":\"keep\"}".utf8).write(to:otherJSON)
        let store = ClaudeContextStore(directory:directory)
        try store.write(ContextReading(sessionID:"newest",usedTokens:20,limitTokens:100,recordedAt:now))
        XCTAssertEqual(try fm.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil).filter { $0.lastPathComponent.hasPrefix("old-") || $0.lastPathComponent == "newest.json" }.count,512)
        XCTAssertNil(store.read(sessionID:"old-0",now:now))
        XCTAssertEqual(store.read(sessionID:"old-511",now:now)?.percent,10)
        XCTAssertEqual(store.read(sessionID:"newest",now:now)?.percent,20)
        XCTAssertEqual(try String(contentsOf:note,encoding:.utf8),"keep")
        XCTAssertEqual(try String(contentsOf:otherJSON,encoding:.utf8),"{\"note\":\"keep\"}")
    }
    func testReaderFindsTheRequestedCodexSessionAndNeverUsesAnotherSessionsContext() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        let logs = root.appendingPathComponent("sessions/2026/10/18")
        try FileManager.default.createDirectory(at:logs,withIntermediateDirectories:true)
        let event = #"{"type":"event_msg","timestamp":"2026-10-18T08:00:00Z","payload":{"type":"token_count","info":{"model_context_window":1000,"last_token_usage":{"total_tokens":250}}}}"# + "\n"
        try Data((("{\"type\":\"response_item\",\"payload\":{\"content\":\"" + String(repeating:"PRIVATE",count:100000) + "\"}}\n")+event).utf8).write(to:logs.appendingPathComponent("rollout-main.jsonl"))
        let source = LogSource(rootsEnvironment:root.path)
        let reader = ContextReader()
        let selected = await reader.read(provider:.codex,sessionID:"main",source:source)
        XCTAssertEqual(selected?.percent,25)
        let missing = await reader.read(provider:.codex,sessionID:"other",source:source)
        XCTAssertNil(missing)
        let traversal = await reader.read(provider:.codex,sessionID:"../../main",source:source)
        XCTAssertNil(traversal)
    }
    func testClaudeTelemetryIsPrivateScopedToSessionAndRejectsFutureAndMalformedValues() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:directory) }
        let now = Date()
        let value = try XCTUnwrap(ContextReading.claudeStatusLine(Data(#"{"session_id":"one","context_window":{"context_window_size":200000,"used_percentage":50}}"#.utf8),now:now))
        let store = ClaudeContextStore(directory:directory)
        try store.write(value)
        XCTAssertEqual(store.read(sessionID:"one",now:now)?.percent,50)
        XCTAssertNil(store.read(sessionID:"two",now:now))
        XCTAssertNil(store.read(sessionID:"one",now:now.addingTimeInterval(-60)))
        XCTAssertEqual(try FileManager.default.attributesOfItem(atPath:directory.path)[.posixPermissions] as? Int,0o700)
        XCTAssertEqual(try FileManager.default.attributesOfItem(atPath:directory.appendingPathComponent("one.json").path)[.posixPermissions] as? Int,0o600)
    }
}
