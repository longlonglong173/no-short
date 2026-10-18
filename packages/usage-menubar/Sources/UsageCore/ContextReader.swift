import Foundation

/// Reads one selected session off the UI actor. Costs remain ccusage's concern.
public actor ContextReader {
    private var paths: [String:URL] = [:]
    private let claude: ClaudeContextStore
    public init(claude:ClaudeContextStore = ClaudeContextStore()) { self.claude=claude }
    public func read(provider:UsageProvider,sessionID:String,source:LogSource) -> ContextReading? {
        guard ContextReading.validSessionID(sessionID) else { return nil }
        if provider == .claude { return claude.read(sessionID:sessionID) }
        let key = source.rootsEnvironment + "|" + sessionID
        let fm = FileManager.default
        var path = paths[key]
        if let existing = path, !fm.fileExists(atPath:existing.path) { path=nil; paths.removeValue(forKey:key) }
        if path == nil {
            roots: for root in source.rootsEnvironment.split(separator:",") {
                for name in ["sessions","archived_sessions"] {
                    let directory = URL(fileURLWithPath:String(root)).appendingPathComponent(name)
                    guard let enumerator = fm.enumerator(at:directory,includingPropertiesForKeys:[.isRegularFileKey,.isSymbolicLinkKey],options:[.skipsHiddenFiles]) else { continue }
                    for case let candidate as URL in enumerator {
                        let stem = candidate.deletingPathExtension().lastPathComponent
                        guard candidate.pathExtension == "jsonl", stem == sessionID || stem.hasSuffix("-" + sessionID),
                              let values = try? candidate.resourceValues(forKeys:[.isRegularFileKey,.isSymbolicLinkKey]),
                              values.isRegularFile == true, values.isSymbolicLink != true else { continue }
                        path=candidate; paths[key]=candidate; break roots
                    }
                }
            }
        }
        guard let path, let handle = try? FileHandle(forReadingFrom:path) else { return nil }
        defer { try? handle.close() }
        do {
            let size = try handle.seekToEnd(), offset = size > 524_288 ? size - 524_288 : 0
            try handle.seek(toOffset:offset)
            var data = try handle.read(upToCount:524_288) ?? Data()
            // A bounded tail may start halfway through JSON or a Unicode scalar.
            if offset > 0 { guard let first = data.firstIndex(of:10) else { return nil }; data.removeSubrange(...first) }
            return ContextReading.codex(data,sessionID:sessionID)
        } catch { return nil }
    }
}

/// Only sanitized, numeric Claude status-line telemetry is stored here.
public struct ClaudeContextStore: Sendable {
    public let directory:URL
    public init(directory:URL? = nil) {
        self.directory = directory ?? ProcessInfo.processInfo.environment["NO_SHORT_USAGE_CONTEXT_DIR"].map { URL(fileURLWithPath:$0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/no-short/usage/context")
    }
    public func write(_ value:ContextReading) throws {
        guard value.isValid else { return }
        let fm = FileManager.default
        if let attributes = try? fm.attributesOfItem(atPath:directory.path), attributes[.type] as? FileAttributeType != .typeDirectory { throw SnapshotError.invalid }
        try fm.createDirectory(at:directory,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        try fm.setAttributes([.posixPermissions:0o700],ofItemAtPath:directory.path)
        let path = directory.appendingPathComponent(value.sessionID + ".json")
        if let attributes = try? fm.attributesOfItem(atPath:path.path), attributes[.type] as? FileAttributeType != .typeRegular { throw SnapshotError.invalid }
        try JSONEncoder().encode(value).write(to:path,options:.atomic)
        try fm.setAttributes([.posixPermissions:0o600],ofItemAtPath:path.path)
        // Bound retained sessions, not just individual input/read sizes. Ignore
        // unrelated files and symlinks; concurrent collectors may already have
        // removed an old record by the time this process reaches it.
        let records = try fm.contentsOfDirectory(at:directory,includingPropertiesForKeys:nil).compactMap { file -> (URL,Date)? in
            guard file.lastPathComponent != path.lastPathComponent, file.pathExtension == "json", ContextReading.validSessionID(file.deletingPathExtension().lastPathComponent),
                  let attributes = try? fm.attributesOfItem(atPath:file.path), attributes[.type] as? FileAttributeType == .typeRegular,
                  let size = attributes[.size] as? Int, size <= 4096,
                  let modified = attributes[.modificationDate] as? Date,
                  let data = try? Data(contentsOf:file), let record = try? JSONDecoder().decode(ContextReading.self,from:data),
                  record.isValid, record.sessionID == file.deletingPathExtension().lastPathComponent else { return nil }
            return (file,modified)
        }.sorted { $0.1 == $1.1 ? $0.0.lastPathComponent < $1.0.lastPathComponent : $0.1 > $1.1 }
        for (file,_) in records.dropFirst(511) { try? fm.removeItem(at:file) }
    }
    public func read(sessionID:String,now:Date = Date()) -> ContextReading? {
        guard ContextReading.validSessionID(sessionID) else { return nil }
        let path = directory.appendingPathComponent(sessionID + ".json")
        guard let attributes = try? FileManager.default.attributesOfItem(atPath:path.path), attributes[.type] as? FileAttributeType == .typeRegular,
              let size = attributes[.size] as? Int, size <= 4096,
              let data = try? Data(contentsOf:path), let value = try? JSONDecoder().decode(ContextReading.self,from:data),
              value.isValid, value.sessionID == sessionID, now.timeIntervalSince(value.recordedAt) >= -5 else { return nil }
        return value
    }
}
