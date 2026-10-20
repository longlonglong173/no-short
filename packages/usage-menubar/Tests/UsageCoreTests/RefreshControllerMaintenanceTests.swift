import XCTest
@testable import UsageCore

@MainActor final class RefreshControllerMaintenanceTests: XCTestCase {
    func waitFor(_ predicate: @escaping @MainActor () async -> Bool) async throws {
        for _ in 0..<100 { if await predicate() { return }; try await Task.sleep(for: .milliseconds(5)) }
        XCTFail("Condition timed out")
    }
    func testMaintenanceWaitsForCancelledReaderAndRefreshesAfterward() async throws {
        let loader = ControlledLoader(), snapshot = try fixture()
        let controller = RefreshController(loader: loader, source: .init(rootsEnvironment: "synthetic"), now: { fixtureNow })
        controller.refresh(); try await waitFor { await loader.calls.count == 1 }
        var entered = false
        let work = Task { try await controller.withMaintenance { entered = true; return 7 } }
        try await waitFor { controller.isMaintaining }
        controller.refresh(); try await Task.sleep(for: .milliseconds(20)); XCTAssertFalse(entered)
        await loader.resolve(.success(snapshot))
        let result = try await work.value
        XCTAssertEqual(result, 7)
        try await waitFor { await loader.calls.count == 2 }
        XCTAssertFalse(controller.isMaintaining); XCTAssertTrue(entered)
        await loader.resolve(.success(snapshot)); try await waitFor { !controller.isLoading }
        controller.stop()
    }
    func testSleepDuringMaintenanceAndFailureDoNotRestartSuspendedReader() async throws {
        let loader = ControlledLoader()
        let controller = RefreshController(loader: loader, source: .init(rootsEnvironment: "synthetic"))
        do {
            let _: Int = try await controller.withMaintenance {
                controller.suspend()
                throw CacheMaintenanceError.unsafePath
            }
            XCTFail("Expected maintenance error")
        } catch { XCTAssertEqual(error as? CacheMaintenanceError, .unsafePath) }
        XCTAssertFalse(controller.isMaintaining)
        let calls = await loader.calls.count; XCTAssertEqual(calls, 0)
        controller.resume(); try await waitFor { await loader.calls.count == 1 }
        controller.stop(); await loader.resolve(.failure(CancellationError()))
    }
    func testShutdownWaitsForMaintenanceBeforeApplicationCanExit() async throws {
        let loader = ControlledLoader()
        let controller = RefreshController(loader: loader, source: .init(rootsEnvironment: "synthetic"))
        var release: CheckedContinuation<Void, Never>?
        let work = Task { try await controller.withMaintenance { await withCheckedContinuation { release = $0 }; return 1 } }
        try await waitFor { release != nil }
        var shutdownDone = false
        let shutdown = Task { await controller.shutdown(); shutdownDone = true }
        try await Task.sleep(for: .milliseconds(20))
        XCTAssertFalse(shutdownDone, "Quit must wait for the owned maintenance guard to be released")
        release?.resume(); _ = try await work.value; await shutdown.value
        XCTAssertTrue(shutdownDone); XCTAssertFalse(controller.isMaintaining)
        let calls = await loader.calls.count; XCTAssertEqual(calls, 0)
    }

}
