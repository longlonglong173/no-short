import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class ActivityMonitorTests:XCTestCase {
    func testNewHookFilesReachThePanelAndNestedLogWritesRequestRefresh() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        let activity = ActivityStore(directory:root.appendingPathComponent("activity"))
        let logs = root.appendingPathComponent("codex/sessions/nested")
        try FileManager.default.createDirectory(at:logs,withIntermediateDirectories:true)
        let received = expectation(description:"activity delivered"), refreshed = expectation(description:"log refresh")
        received.assertForOverFulfill = false; refreshed.assertForOverFulfill = false
        let monitor = ActivityMonitor(store:activity,roots:[root.appendingPathComponent("codex").path],onActivity:{ events in
            if events.contains(where: { $0.sessionID == "watched" }) { received.fulfill() }
        },onLogChange:{ refreshed.fulfill() })
        monitor.start(); defer { monitor.stop() }
        try await Task.sleep(for:.milliseconds(150))
        let event = try XCTUnwrap(SessionActivity.parse(Data(#"{"hook_event_name":"UserPromptSubmit","session_id":"watched"}"#.utf8),provider:.codex))
        try activity.append(event)
        try Data("{}\n".utf8).write(to:logs.appendingPathComponent("session.jsonl"))
        await fulfillment(of:[received,refreshed],timeout:7)
    }
}
