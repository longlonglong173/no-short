import XCTest
import Darwin
@testable import UsageCore

final class CacheMaintenanceTests: XCTestCase {
    let fm = FileManager.default
    func root() throws -> URL {
        let url = URL(fileURLWithPath: fm.currentDirectoryPath).appendingPathComponent(".artifacts/ns12-tests/CacheMaintenance-\(UUID().uuidString)")
        try fm.createDirectory(at: url, withIntermediateDirectories: true); return url
    }
    func file(_ root: URL, _ path: String, _ content: String = "synthetic") throws -> URL {
        let url = root.appendingPathComponent(path)
        try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(content.utf8).write(to: url); return url
    }
    func testGeneratedOnlyCacheReportsNoRetainedEntries() throws {
        let root = try root(); defer { try? fm.removeItem(at: root) }
        _ = try file(root, String(repeating: "a", count: 24) + "/snapshot.json")
        let result = try CacheMaintenance.clear(root: root)
        XCTAssertEqual(result.removedFiles, 1); XCTAssertEqual(result.retainedEntries, 0)
    }
    func testOnlyKnownGeneratedFilesAreRemovedAndOriginalUnknownDataRemains() throws {
        let root = try root(); defer { try? fm.removeItem(at: root) }
        let scope = String(repeating: "a", count: 24)
        for name in ["snapshot.json", "pricing-check.json", "ccusage-config.json", "metadata/metadata-codex.json", "metadata/metadata-claude.json"] { _ = try file(root, scope + "/" + name) }
        let original = try file(root, scope + "/original.jsonl", "ORIGINAL_LOG")
        let unknown = try file(root, scope + "/backups/settings.json", "THIRD_PARTY")
        let other = try file(root, "not-a-scope/snapshot.json", "UNKNOWN_ROOT")
        let result = try CacheMaintenance.clear(root: root)
        XCTAssertEqual(result.removedFiles, 5); XCTAssertGreaterThanOrEqual(result.retainedEntries, 3)
        XCTAssertEqual(try String(contentsOf: original, encoding: .utf8), "ORIGINAL_LOG")
        XCTAssertEqual(try String(contentsOf: unknown, encoding: .utf8), "THIRD_PARTY")
        XCTAssertTrue(fm.fileExists(atPath: other.path))
        XCTAssertFalse(fm.fileExists(atPath: root.appendingPathComponent(".maintenance.lock").path))
    }
    func testAnyActiveScopeLockBlocksAllDeletionAndCleansOwnGuard() throws {
        let root = try root(); defer { try? fm.removeItem(at: root) }
        let first = try file(root, String(repeating: "a", count: 24) + "/snapshot.json")
        let second = try file(root, String(repeating: "b", count: 24) + "/snapshot.json")
        _ = try file(root, String(repeating: "b", count: 24) + "/scan.lock/owner.json")
        XCTAssertThrowsError(try CacheMaintenance.clear(root: root)) { XCTAssertEqual($0 as? CacheMaintenanceError, .busy) }
        XCTAssertTrue(fm.fileExists(atPath: first.path)); XCTAssertTrue(fm.fileExists(atPath: second.path))
        XCTAssertFalse(fm.fileExists(atPath: root.appendingPathComponent(".maintenance.lock").path))
    }
    func testSymlinksAndProtectedRootsAreRejectedWithoutTouchingTargets() throws {
        let root = try root(), outside = try self.root(); defer { try? fm.removeItem(at: root); try? fm.removeItem(at: outside) }
        let target = try file(outside, "original.jsonl", "PRIVATE_LOG")
        let scope = root.appendingPathComponent(String(repeating: "a", count: 24))
        try fm.createDirectory(at: scope, withIntermediateDirectories: true)
        try fm.createSymbolicLink(at: scope.appendingPathComponent("snapshot.json"), withDestinationURL: target)
        XCTAssertThrowsError(try CacheMaintenance.clear(root: root)) { XCTAssertEqual($0 as? CacheMaintenanceError, .unsafePath) }
        XCTAssertEqual(try String(contentsOf: target, encoding: .utf8), "PRIVATE_LOG")
        try fm.removeItem(at: scope.appendingPathComponent("snapshot.json"))
        _ = try file(root, String(repeating: "a", count: 24) + "/snapshot.json")
        XCTAssertThrowsError(try CacheMaintenance.clear(root: root, protectedRoots: [scope])) { XCTAssertEqual($0 as? CacheMaintenanceError, .protectedSource) }
        let alias = outside.appendingPathComponent("cache-alias")
        try fm.createSymbolicLink(at: alias, withDestinationURL: root)
        XCTAssertThrowsError(try CacheMaintenance.clear(root: alias)) { XCTAssertEqual($0 as? CacheMaintenanceError, .unsafePath) }
    }
    func testLiveMaintenanceOwnerIsNeverEvictedByAgeAndDeadOwnerCanRecover() throws {
        let root = try root(); defer { try? fm.removeItem(at: root) }
        let scope = String(repeating: "a", count: 24), snapshot = try file(root, scope + "/snapshot.json")
        let guardURL = root.appendingPathComponent(".maintenance.lock")
        let owner = try file(root, ".maintenance.lock/owner.json", "{\"pid\":\(getpid()),\"token\":\"live\",\"timestamp\":1}")
        try fm.setAttributes([.modificationDate: Date.distantPast], ofItemAtPath: guardURL.path)
        XCTAssertThrowsError(try CacheMaintenance.clear(root: root)) { XCTAssertEqual($0 as? CacheMaintenanceError, .busy) }
        XCTAssertTrue(fm.fileExists(atPath: snapshot.path))
        try Data("{\"pid\":2147483647,\"token\":\"dead\",\"timestamp\":1}".utf8).write(to: owner)
        try fm.setAttributes([.modificationDate: Date.distantPast], ofItemAtPath: guardURL.path)
        XCTAssertEqual(try CacheMaintenance.clear(root: root).removedFiles, 1)
    }
    func testPermissionFailurePreservesFileAndReleasesOwnedGuard() throws {
        let root = try root(); defer { try? fm.removeItem(at: root) }
        let name = String(repeating: "a", count: 24), snapshot = try file(root, name + "/snapshot.json")
        let scope = root.appendingPathComponent(name)
        try fm.setAttributes([.posixPermissions: 0o500], ofItemAtPath: scope.path)
        defer { try? fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: scope.path) }
        XCTAssertThrowsError(try CacheMaintenance.clear(root: root))
        XCTAssertTrue(fm.fileExists(atPath: snapshot.path))
        XCTAssertFalse(fm.fileExists(atPath: root.appendingPathComponent(".maintenance.lock").path))
    }
    func testCancelledMaintenanceDoesNotDeleteFilesOrCreateGuard() async throws {
        let root = try root(); defer { try? fm.removeItem(at: root) }
        let snapshot = try file(root, String(repeating: "a", count: 24) + "/snapshot.json")
        let gate = CacheCancellationGate()
        let work = Task { await gate.wait(); return try CacheMaintenance.clear(root: root) }
        for _ in 0..<100 { if await gate.waiting { break }; try await Task.sleep(for: .milliseconds(5)) }
        work.cancel(); await gate.release()
        do { _ = try await work.value; XCTFail("Cancelled maintenance should not clear") }
        catch { XCTAssertEqual(error as? CacheMaintenanceError, .cancelled) }
        XCTAssertTrue(fm.fileExists(atPath: snapshot.path))
        XCTAssertFalse(fm.fileExists(atPath: root.appendingPathComponent(".maintenance.lock").path))
    }

    func testRecoveryIsSerializedByKernelLockAndNeverRemovesAnotherClaim() throws {
        let root = try root(); defer { try? fm.removeItem(at: root) }
        let snapshot = try file(root, String(repeating: "a", count: 24) + "/snapshot.json")
        let recovery = root.appendingPathComponent(".maintenance-recovery.lock")
        let lockFile: (Int32, Int32) -> Int32 = flock
        let fd = Darwin.open(recovery.path, O_CREAT | O_RDWR, mode_t(0o600))
        XCTAssertGreaterThanOrEqual(fd, 0)
        defer { _ = lockFile(fd, LOCK_UN); Darwin.close(fd) }
        XCTAssertEqual(lockFile(fd, LOCK_EX | LOCK_NB), 0)
        _ = try file(root, ".maintenance.lock/owner.json", "{\"pid\":2147483647,\"token\":\"dead\",\"timestamp\":1}")
        try fm.setAttributes([.modificationDate: Date.distantPast], ofItemAtPath: root.appendingPathComponent(".maintenance.lock").path)
        XCTAssertThrowsError(try CacheMaintenance.clear(root: root)) { XCTAssertEqual($0 as? CacheMaintenanceError, .busy) }
        XCTAssertTrue(fm.fileExists(atPath: snapshot.path))
        XCTAssertEqual(lockFile(fd, LOCK_UN), 0)
        XCTAssertEqual(try CacheMaintenance.clear(root: root).removedFiles, 1)
    }

}

private actor CacheCancellationGate {
    private var continuation: CheckedContinuation<Void, Never>?
    var waiting: Bool { continuation != nil }
    func wait() async { await withCheckedContinuation { continuation = $0 } }
    func release() { continuation?.resume(); continuation = nil }
}
