import Foundation
import XCTest
import Darwin
@testable import UsageCore

final class SnapshotClientTests: XCTestCase, @unchecked Sendable {
    func setup(_ body: String) throws -> (URL, URL) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("No Short test \(UUID())")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let helper = dir.appendingPathComponent("fake helper")
        try ("#!/bin/sh\n" + body).write(to: helper, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: helper.path)
        return (dir, helper)
    }
    func worker() -> URL {
        // SwiftPM's XCTest runner and executable are placed in the same products directory.
        Bundle(for: Self.self).bundleURL.deletingLastPathComponent().appendingPathComponent("NoShortUsageMenuBar")
    }
    func testLoadsSnapshotWithSeparateArgumentsAndCustomSource() async throws {
        let (dir, helper) = try setup("[ \"$1\" = --snapshot ] || exit 3\nprintf '%s' \"$CODEX_HOME\" > \"$(dirname \"$0\")/actual-source\"\ncat \"$(dirname \"$0\")/snapshot.json\"\n")
        defer { try? FileManager.default.removeItem(at: dir) }
        try fixtureData().write(to: dir.appendingPathComponent("snapshot.json"))
        let value = try await SnapshotClient(workerURL: worker(), helperURL: helper).load(source: LogSource(rootsEnvironment: "/tmp/nguồn log"))
        XCTAssertEqual(value.today.cost.amountUSD, 2.35)
        let actual = try String(contentsOf: dir.appendingPathComponent("actual-source"), encoding: .utf8)
        XCTAssertEqual(actual, "/tmp/nguồn log", "bytes: \(Array(actual.utf8))")
    }
    func testExitAndInvalidJSONAndOutputLimitReturnErrors() async throws {
        for (body, expected) in [("echo secret >&2; exit 3", SnapshotClientError.reportFailed), ("echo broken", .invalidSnapshot), ("yes x | head -c 100000", .outputTooLarge)] {
            let (dir, helper) = try setup(body); defer { try? FileManager.default.removeItem(at: dir) }
            do { _ = try await SnapshotClient(workerURL: worker(), helperURL: helper, maxOutputBytes: 1000).load(source: LogSource(rootsEnvironment: "/tmp")); XCTFail("Expected \(expected)") }
            catch { XCTAssertEqual(error as? SnapshotClientError, expected) }
        }
    }
    func testDrainsStderrWithoutDeadlock() async throws {
        let (dir, helper) = try setup("yes private | head -c 1000000 >&2\ncat \"$(dirname \"$0\")/snapshot.json\"")
        defer { try? FileManager.default.removeItem(at: dir) }
        try fixtureData().write(to: dir.appendingPathComponent("snapshot.json"))
        let s = try await SnapshotClient(workerURL: worker(), helperURL: helper, timeout: .seconds(3)).load(source: LogSource(rootsEnvironment: "/tmp"))
        XCTAssertEqual(s.latestSession?.id, "main")
    }
    func testTimeoutKillsDescendantsHoldingPipes() async throws {
        let (dir, helper) = try setup("sleep 60 &\necho $! > \"$(dirname \"$0\")/child.pid\"\nwait")
        defer { try? FileManager.default.removeItem(at: dir) }
        let start = Date()
        do { _ = try await SnapshotClient(workerURL: worker(), helperURL: helper, timeout: .seconds(2)).load(source: LogSource(rootsEnvironment: "/tmp")); XCTFail("Expected timeout") }
        catch { XCTAssertEqual(error as? SnapshotClientError, .timeout) }
        XCTAssertLessThan(Date().timeIntervalSince(start), 5)
        let pid = Int32(try String(contentsOf: dir.appendingPathComponent("child.pid"), encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines))!
        for _ in 0..<50 { if kill(pid, 0) != 0 { break }; try await Task.sleep(for: .milliseconds(20)) }
        XCTAssertNotEqual(kill(pid, 0), 0, "Child process still alive")
    }
    func testCancellationCompletesQuickly() async throws {
        let (dir, helper) = try setup("sleep 60")
        defer { try? FileManager.default.removeItem(at: dir) }
        let client = SnapshotClient(workerURL: worker(), helperURL: helper)
        let task = Task { try await client.load(source: LogSource(rootsEnvironment: "/tmp")) }
        try await Task.sleep(for: .milliseconds(100)); task.cancel()
        do { _ = try await task.value; XCTFail("Expected cancellation") } catch { XCTAssertTrue(error is CancellationError) }
    }
    func testCancellationBeforeHandshakeAndBadWorkerStayIsolated() async throws {
        let (dir, helper) = try setup("sleep 60")
        defer { try? FileManager.default.removeItem(at: dir) }
        let task = Task { try await SnapshotClient(workerURL: helper, helperURL: helper).load(source: LogSource(rootsEnvironment: "/tmp")) }
        try await Task.sleep(for: .milliseconds(30)); task.cancel()
        do { _ = try await task.value; XCTFail() } catch { XCTAssertTrue(error is CancellationError) }
        let (badDir, bad) = try setup("echo WRONG_HANDSHAKE_123456789; exit 0")
        defer { try? FileManager.default.removeItem(at: badDir) }
        do { _ = try await SnapshotClient(workerURL: bad, helperURL: bad).load(source: LogSource(rootsEnvironment: "/tmp")); XCTFail() }
        catch { XCTAssertEqual(error as? SnapshotClientError, .launchFailed) }
    }
    func testSuccessfulHelperCleansChildrenEvenWhenTheyClosePipes() async throws {
        try await assertChildCleanup(body: "sleep 60 >/dev/null 2>&1 &\necho $! > \"$(dirname \"$0\")/child.pid\"\ncat \"$(dirname \"$0\")/snapshot.json\"")
    }
    func testTermHandlerClosingPipesCannotBypassFinalKill() async throws {
        try await assertChildCleanup(body: """
        /bin/sh -c 'trap "exec >/dev/null 2>&1" TERM; echo $$ > "$1"; while :; do sleep 60; done' child "$(dirname "$0")/child.pid" &
        while [ ! -f "$(dirname "$0")/child.pid" ]; do sleep .01; done
        cat "$(dirname "$0")/snapshot.json"
        """)
    }
    private func assertChildCleanup(body: String) async throws {
        let (dir, helper) = try setup(body)
        defer { try? FileManager.default.removeItem(at: dir) }
        try fixtureData().write(to: dir.appendingPathComponent("snapshot.json"))
        let snapshot = try await SnapshotClient(workerURL: worker(), helperURL: helper, timeout: .seconds(3)).load(source: LogSource(rootsEnvironment: "/tmp"))
        XCTAssertEqual(snapshot.today.cost.amountUSD, 2.35)
        let pid = Int32(try String(contentsOf: dir.appendingPathComponent("child.pid"), encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines))!
        let group = getpgid(pid)
        defer { if group > 1 && group != getpgrp() { _ = kill(-group, SIGKILL) } }
        for _ in 0..<30 { if kill(pid, 0) != 0 { break }; try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertNotEqual(kill(pid, 0), 0, "Successful helper left a descendant alive")
    }
    func testAlreadyCancelledAndMissingRuntimeDoNotLaunch() async throws {
        let task = Task { try await Task.sleep(for: .seconds(1)); return try await SnapshotClient(workerURL: worker(), helperURL: URL(fileURLWithPath: "/missing")).load(source: LogSource(rootsEnvironment: "/tmp")) }
        task.cancel()
        do { _ = try await task.value; XCTFail() } catch { XCTAssertTrue(error is CancellationError) }
        do { _ = try await SnapshotClient(workerURL: worker(), helperURL: URL(fileURLWithPath: "/missing")).load(source: LogSource(rootsEnvironment: "/tmp")); XCTFail() }
        catch { XCTAssertEqual(error as? SnapshotClientError, .missingRuntime) }
    }
}
