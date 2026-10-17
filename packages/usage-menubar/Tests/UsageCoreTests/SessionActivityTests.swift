import XCTest
@testable import UsageCore

final class SessionActivityTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_792_299_600)
    func input(_ event: String = "UserPromptSubmit", id: String = "session-a", extras: [String: Any] = [:]) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["hook_event_name":event,"session_id":id,"prompt":"PRIVATE_PROMPT","cwd":"/PRIVATE_PATH","turn_id":"turn-1"].merging(extras) { _, b in b })
    }
    func testOnlyActivityMetadataCrossesTheHookBoundary() throws {
        let value = try XCTUnwrap(SessionActivity.parse(input(), provider: .claude, now: now))
        XCTAssertEqual(value.sessionID,"session-a"); XCTAssertEqual(value.event,.submitted)
        let output = String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
        XCTAssertFalse(output.contains("PRIVATE")); XCTAssertFalse(output.contains("prompt"))
    }
    func testSubagentsAndUnknownOrMalformedEventsAreIgnored() throws {
        for data in [try input(extras:["agent_id":"child"]), try input(extras:["transcript_path":"/projects/p/s/subagents/agent-a.jsonl"]), try input("SubagentStop"), try input(id:"../escape"), Data("garbage".utf8)] {
            XCTAssertNil(SessionActivity.parse(data,provider:.codex,now:now))
        }
    }
    func testStorePreservesConcurrentSessionsAndRejectsStaleFutureOrCorruptEvents() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:dir) }
        let store = ActivityStore(directory:dir)
        for (id, offset) in [("a",0.0),("b",1.0),("stale",-90_000.0),("future",90_000.0)] {
            try store.append(XCTUnwrap(SessionActivity.parse(input(id:id),provider:.claude,now:now.addingTimeInterval(offset))))
        }
        try Data("broken".utf8).write(to:dir.appendingPathComponent("corrupt.json"))
        XCTAssertEqual(store.events(now:now.addingTimeInterval(2)).map(\.sessionID),["a","b"])
        let attrs = try FileManager.default.attributesOfItem(atPath:dir.path)
        XCTAssertEqual((attrs[.posixPermissions] as? NSNumber)?.intValue,0o700)
    }
}
