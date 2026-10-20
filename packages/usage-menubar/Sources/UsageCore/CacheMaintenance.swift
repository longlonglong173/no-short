import Foundation
import Darwin

public enum CacheMaintenanceError: Error, Equatable { case busy, unsafePath, protectedSource, cancelled }
public struct CacheClearResult: Sendable, Equatable {
    public let removedFiles, retainedEntries: Int
    public init(removedFiles: Int, retainedEntries: Int) { self.removedFiles = removedFiles; self.retainedEntries = retainedEntries }
}
/// Only unlink known generated files. Never recursively remove a cache scope or unknown data.
public enum CacheMaintenance {
    public static var defaultRoot: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Caches/no-short/usage") }
    private struct FilePlan { let url: URL; let inode: UInt64; let size: UInt64; let modified: Date }
    private static var fm: FileManager { FileManager.default }
    private static func attributes(_ url: URL) throws -> [FileAttributeKey: Any] {
        let values = try fm.attributesOfItem(atPath: url.path)
        if values[.type] as? FileAttributeType == .typeSymbolicLink { throw CacheMaintenanceError.unsafePath }
        return values
    }
    private static func ancestors(_ url: URL) throws {
        var current = url.standardizedFileURL
        while current.path != "/" {
            if fm.fileExists(atPath: current.path) { _ = try attributes(current) }
            else if (try? fm.destinationOfSymbolicLink(atPath: current.path)) != nil { throw CacheMaintenanceError.unsafePath }
            current.deleteLastPathComponent()
        }
    }
    private static func overlaps(_ a: String, _ b: String) -> Bool { a == b || a.hasPrefix(b + "/") || b.hasPrefix(a + "/") }
    private static func plan(_ url: URL) throws -> FilePlan {
        let values = try attributes(url)
        guard values[.type] as? FileAttributeType == .typeRegular else { throw CacheMaintenanceError.unsafePath }
        return FilePlan(url: url, inode: (values[.systemFileNumber] as? NSNumber)?.uint64Value ?? 0,
                        size: (values[.size] as? NSNumber)?.uint64Value ?? 0, modified: values[.modificationDate] as? Date ?? .distantPast)
    }
    private static func unlink(_ url: URL) throws {
        if Darwin.unlink(url.path) != 0 { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    }
    private static func removeEmpty(_ url: URL) throws -> Bool {
        if Darwin.rmdir(url.path) == 0 { return true }
        if errno == ENOTEMPTY || errno == EEXIST { return false }
        if errno == ENOENT { return true }
        throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
    }
    private static func owner(_ lock: URL) throws -> [String: Any]? {
        let file = lock.appendingPathComponent("owner.json")
        guard fm.fileExists(atPath: file.path) else { return nil }
        guard try plan(file).size <= 4096 else { throw CacheMaintenanceError.unsafePath }
        return (try? JSONSerialization.jsonObject(with: Data(contentsOf: file))) as? [String: Any]
    }
    /// Stable inode; never remove this file. The kernel releases flock automatically on process exit.
    private static func withRecoveryLock<T>(root: URL, blocking: Bool = false, _ operation: () throws -> T) throws -> T {
        let path = root.appendingPathComponent(".maintenance-recovery.lock").path
        let fd = Darwin.open(path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, mode_t(0o600))
        guard fd >= 0 else {
            if errno == ELOOP { throw CacheMaintenanceError.unsafePath }
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }
        defer { Darwin.close(fd) }
        var info = stat()
        guard Darwin.fstat(fd, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_size == 0 else { throw CacheMaintenanceError.unsafePath }
        let lockFile: (Int32, Int32) -> Int32 = flock
        guard lockFile(fd, LOCK_EX | (blocking ? 0 : LOCK_NB)) == 0 else { throw CacheMaintenanceError.busy }
        defer { _ = lockFile(fd, LOCK_UN) }
        return try operation()
    }
    private static func acquire(_ lock: URL, token: String) throws {
        if (try? fm.destinationOfSymbolicLink(atPath: lock.path)) != nil { throw CacheMaintenanceError.unsafePath }
        if fm.fileExists(atPath: lock.path) {
            let attr = try attributes(lock)
            guard attr[.type] as? FileAttributeType == .typeDirectory else { throw CacheMaintenanceError.unsafePath }
            let age = Date().timeIntervalSince(attr[.modificationDate] as? Date ?? Date())
            let previousOwner = try owner(lock)
            let previousMarker = try? Data(contentsOf: lock.appendingPathComponent("owner.json"))
            let pid = (previousOwner?["pid"] as? NSNumber)?.int32Value ?? 0
            var alive = false
            if pid > 1 { alive = Darwin.kill(pid, 0) == 0 || errno == EPERM }
            guard age > 90, !alive else { throw CacheMaintenanceError.busy }
            let children = try fm.contentsOfDirectory(atPath: lock.path)
            guard children.allSatisfy({ $0 == "owner.json" }) else { throw CacheMaintenanceError.busy }
            let latest = try attributes(lock)
            guard (latest[.systemFileNumber] as? NSNumber) == (attr[.systemFileNumber] as? NSNumber),
                  latest[.modificationDate] as? Date == attr[.modificationDate] as? Date,
                  (try? Data(contentsOf: lock.appendingPathComponent("owner.json"))) == previousMarker else { throw CacheMaintenanceError.busy }
            if children.contains("owner.json") { try unlink(lock.appendingPathComponent("owner.json")) }
            guard try removeEmpty(lock) else { throw CacheMaintenanceError.busy }
        }
        do { try fm.createDirectory(at: lock, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700]) }
        catch { throw CacheMaintenanceError.busy }
        do {
            let data = try JSONSerialization.data(withJSONObject: ["pid": getpid(), "token": token, "timestamp": Date().timeIntervalSince1970 * 1000])
            try data.write(to: lock.appendingPathComponent("owner.json"), options: .atomic)
            try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: lock.appendingPathComponent("owner.json").path)
        } catch {
            try? unlink(lock.appendingPathComponent("owner.json")); _ = try? removeEmpty(lock); throw error
        }
    }
    private static func release(_ lock: URL, token: String) {
        guard (try? owner(lock)?["token"] as? String) == token else { return }
        try? unlink(lock.appendingPathComponent("owner.json")); _ = try? removeEmpty(lock)
    }
    private static func known(_ relative: String) -> Bool {
        if ["snapshot.json", "pricing-check.json", "ccusage-config.json", "metadata/metadata-codex.json", "metadata/metadata-claude.json"].contains(relative) { return true }
        let uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
        return relative.range(of: "^(snapshot-" + uuid + "|metadata/metadata-(codex|claude)\\.json-" + uuid + ")\\.tmp$", options: .regularExpression) != nil
    }
    private static func scopeURLs(_ root: URL) throws -> [URL] {
        try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter {
            $0.lastPathComponent.range(of: "^[0-9a-f]{24}$", options: .regularExpression) != nil
        }.sorted { $0.path < $1.path }
    }
    private static func checkReaders(_ root: URL) throws {
        for scope in try scopeURLs(root) {
            let values = try attributes(scope)
            guard values[.type] as? FileAttributeType == .typeDirectory else { throw CacheMaintenanceError.unsafePath }
            let lock = scope.appendingPathComponent("scan.lock")
            if fm.fileExists(atPath: lock.path) || (try? fm.destinationOfSymbolicLink(atPath: lock.path)) != nil { throw CacheMaintenanceError.busy }
        }
    }
    public static func clear(root requested: URL, protectedRoots: [URL] = []) throws -> CacheClearResult {
        guard requested.isFileURL, requested.path != "/" else { throw CacheMaintenanceError.unsafePath }
        if Task.isCancelled { throw CacheMaintenanceError.cancelled }
        let root = requested.standardizedFileURL
        try ancestors(root)
        let canonical = root.resolvingSymlinksInPath().path
        for source in protectedRoots where overlaps(canonical, source.standardizedFileURL.resolvingSymlinksInPath().path) { throw CacheMaintenanceError.protectedSource }
        guard fm.fileExists(atPath: root.path) else { return CacheClearResult(removedFiles: 0, retainedEntries: 0) }
        guard try attributes(root)[.type] as? FileAttributeType == .typeDirectory else { throw CacheMaintenanceError.unsafePath }
        let lock = root.appendingPathComponent(".maintenance.lock"), token = UUID().uuidString
        try withRecoveryLock(root: root) { try acquire(lock, token: token) }
        defer { try? withRecoveryLock(root: root, blocking: true) { release(lock, token: token) } }
        try checkReaders(root)
        var files: [FilePlan] = [], directories: [URL] = [], retained = 0
        func collect(_ directory: URL, prefix: String) throws {
            for url in try fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).sorted(by: { $0.path < $1.path }) {
                let relative = prefix + url.lastPathComponent, values = try attributes(url)
                if values[.type] as? FileAttributeType == .typeDirectory {
                    if ["metadata", "empty-sources", "empty-sources/projects"].contains(relative) {
                        try collect(url, prefix: relative + "/"); directories.append(url)
                    } else { retained += 1 }
                } else if known(relative) { files.append(try plan(url)) }
                else { retained += 1 }
            }
        }
        let scopes = try scopeURLs(root)
        for entry in try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            _ = try attributes(entry)
            if entry.path != lock.path && entry.lastPathComponent != ".maintenance-recovery.lock" && !scopes.contains(where: { $0.path == entry.path }) { retained += 1 }
        }
        for scope in scopes { try collect(scope, prefix: ""); directories.append(scope) }
        var removed = 0
        for file in files {
            if Task.isCancelled { throw CacheMaintenanceError.cancelled }
            try ancestors(file.url); try checkReaders(root)
            let fresh = try plan(file.url)
            guard fresh.inode == file.inode, fresh.size == file.size, fresh.modified == file.modified else { throw CacheMaintenanceError.busy }
            try unlink(file.url); removed += 1
        }
        for directory in directories { if !(try removeEmpty(directory)) { /* Unknown/new entries remain, never recurse-delete. */ } }
        return CacheClearResult(removedFiles: removed, retainedEntries: retained)
    }
}
