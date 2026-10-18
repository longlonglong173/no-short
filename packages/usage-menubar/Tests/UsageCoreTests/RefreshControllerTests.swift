import Foundation
import XCTest
@testable import UsageCore

actor ControlledLoader: SnapshotLoading {
    var calls: [String] = []
    var pending: [CheckedContinuation<UsageSnapshot, any Error>] = []
    func load(source: LogSource) async throws -> UsageSnapshot {
        calls.append(source.rootsEnvironment)
        return try await withCheckedThrowingContinuation { pending.append($0) }
    }
    func resolve(_ result: Result<UsageSnapshot, any Error>) { pending.removeFirst().resume(with: result) }
}
@MainActor
final class RefreshControllerTests: XCTestCase {
    func waitFor(_ predicate: @escaping @MainActor () async -> Bool) async throws {
        for _ in 0..<100 { if await predicate() { return }; try await Task.sleep(for: .milliseconds(10)) }
        XCTFail("Condition timed out")
    }
    func testDeduplicatesAndRetainsLastGoodOnFailure() async throws {
        let loader = ControlledLoader(), s = try fixture()
        let c = RefreshController(loader: loader, source: LogSource(rootsEnvironment: "a"), now: { s.generatedAt })
        c.refresh(); c.refresh()
        try await waitFor { await loader.calls.count == 1 }
        await loader.resolve(.success(s))
        try await waitFor { !c.isLoading }
        XCTAssertEqual(c.snapshot?.today.cost.amountUSD, 2.35)
        c.refresh(); try await waitFor { await loader.calls.count == 2 }
        await loader.resolve(.failure(SnapshotClientError.reportFailed))
        try await waitFor { !c.isLoading }
        XCTAssertEqual(c.snapshot?.today.cost.amountUSD, 2.35); XCTAssertTrue(c.isStale); XCTAssertNotNil(c.notice)
        c.stop()
    }
    func testChangingSourceRejectsLateOldResult() async throws {
        let loader = ControlledLoader(), s = try fixture()
        let c = RefreshController(loader: loader, source: LogSource(rootsEnvironment: "old"))
        c.refresh(); try await waitFor { await loader.calls.count == 1 }
        c.setSource(LogSource(rootsEnvironment: "new"))
        try await Task.sleep(for: .milliseconds(30))
        let callsDuringCleanup = await loader.calls.count
        XCTAssertEqual(callsDuringCleanup, 1, "New source must wait for old process cleanup")
        await loader.resolve(.success(s)) // cancellation-ignoring old loader
        try await waitFor { await loader.calls.count == 2 }
        XCTAssertNil(c.snapshot); XCTAssertTrue(c.isLoading)
        await loader.resolve(.success(s)); try await waitFor { !c.isLoading }
        XCTAssertNotNil(c.snapshot); XCTAssertEqual(c.source.rootsEnvironment, "new")
        c.stop()
    }
    func testSuspendResumeAndStopDoNotPublishCancelledResults() async throws {
        let loader = ControlledLoader(), s = try fixture()
        let c = RefreshController(loader: loader, source: LogSource(rootsEnvironment: "a"), interval: .milliseconds(40))
        c.resume(); try await waitFor { await loader.calls.count == 1 }
        c.suspend(); await loader.resolve(.success(s))
        try await Task.sleep(for: .milliseconds(70)); XCTAssertNil(c.snapshot)
        let count = await loader.calls.count; XCTAssertEqual(count, 1)
        c.resume(); try await waitFor { await loader.calls.count == 2 }
        c.stop(); await loader.resolve(.success(s))
        try await Task.sleep(for: .milliseconds(70)); XCTAssertNil(c.snapshot)
        c.resume(); c.refresh()
        let stoppedCount = await loader.calls.count; XCTAssertEqual(stoppedCount, 2)
    }
    func testTimerAndWakeMarkOldSnapshotStale() async throws {
        let loader = ControlledLoader(), s = try fixture()
        var now = s.generatedAt
        let c = RefreshController(loader: loader, source: LogSource(rootsEnvironment: "a"), interval: .milliseconds(40), now: { now })
        c.resume(); try await waitFor { await loader.calls.count == 1 }
        await loader.resolve(.success(s)); try await waitFor { c.snapshot != nil }
        XCTAssertFalse(c.isStale)
        c.suspend(); now = now.addingTimeInterval(86_400); c.resume()
        XCTAssertTrue(c.isStale)
        try await waitFor { await loader.calls.count == 2 }
        await loader.resolve(.success(s))
        // The timer may start the next read before polling observes the brief idle state.
        try await waitFor { await loader.calls.count == 3 }
        XCTAssertTrue(c.isLoading)
        c.stop(); await loader.resolve(.failure(CancellationError()))
    }
    func testErrorSnapshotDoesNotReplaceGoodNumbers() async throws {
        let loader = ControlledLoader(), s = try fixture(), error = try fixture { $0["status"] = "error" }
        let c = RefreshController(loader: loader, source: LogSource(rootsEnvironment: "a"))
        c.refresh(); try await waitFor { await loader.calls.count == 1 }; await loader.resolve(.success(s))
        try await waitFor { !c.isLoading }; c.refresh()
        try await waitFor { await loader.calls.count == 2 }; await loader.resolve(.success(error))
        try await waitFor { !c.isLoading }
        XCTAssertEqual(c.snapshot?.status, "ready"); XCTAssertTrue(c.isStale); c.stop()
    }
}
