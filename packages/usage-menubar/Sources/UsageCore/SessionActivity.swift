import Foundation

public enum UsageProvider: String, Codable, Sendable, CaseIterable {
    case codex, claude
    public var title: String { self == .codex ? "Codex" : "Claude Code" }
}
public struct SessionActivity: Codable, Sendable, Equatable {
    public enum Event: String, Codable, Sendable { case started, submitted, stopped, ended }
    public let provider: UsageProvider
    public let sessionID: String
    public let turnID: String?
    public let event: Event
    public let recordedAt: Date
    public static func parse(_ data: Data, provider: UsageProvider, now: Date = Date()) -> SessionActivity? {
        guard data.count <= 8_388_608,
              let object = try? JSONSerialization.jsonObject(with:data) as? [String:Any],
              let id = object["session_id"] as? String, !id.isEmpty, id.count <= 160,
              id.range(of: "^[A-Za-z0-9_-]+$", options:.regularExpression) != nil,
              (object["agent_id"] as? String ?? "").isEmpty,
              !(object["transcript_path"] as? String ?? "").contains("/subagents/"), !id.hasPrefix("agent-") else { return nil }
        let events: [String:Event] = ["SessionStart":.started,"UserPromptSubmit":.submitted,"Stop":.stopped,"SessionEnd":.ended,"Interrupt":.stopped]
        guard let name = object["hook_event_name"] as? String, let event = events[name] else { return nil }
        let turn = (object["turn_id"] as? String).map { String($0.prefix(160)) }
        return Self(provider:provider,sessionID:id,turnID:turn,event:event,recordedAt:now)
    }
}

public struct ActivityStore: Sendable {
    public let directory: URL
    public init(directory: URL? = nil) {
        self.directory = directory ?? ProcessInfo.processInfo.environment["NO_SHORT_USAGE_ACTIVITY_DIR"].map { URL(fileURLWithPath:$0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/no-short/usage/activity")
    }
    public func prepare() throws {
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        try FileManager.default.setAttributes([.posixPermissions:0o700],ofItemAtPath:directory.path)
    }
    public func append(_ event: SessionActivity) throws {
        try prepare()
        let path = directory.appendingPathComponent(UUID().uuidString + ".json")
        try JSONEncoder().encode(event).write(to:path,options:.atomic)
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:path.path)
        // Immutable records avoid a late Stop overwriting another chat's prompt.
        let paths = try FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:[.contentModificationDateKey]).filter { $0.pathExtension == "json" }
        if paths.count > 512 {
            let sorted = paths.sorted { ((try? $0.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys:[.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
            for old in sorted.prefix(paths.count - 512) { try? FileManager.default.removeItem(at:old) }
        }
    }
    public func events(now: Date = Date()) -> [SessionActivity] {
        let paths = (try? FileManager.default.contentsOfDirectory(at:directory,includingPropertiesForKeys:[.fileSizeKey])) ?? []
        return paths.filter { $0.pathExtension == "json" }.compactMap { path in
            guard let size = try? path.resourceValues(forKeys:[.fileSizeKey]).fileSize, size <= 4096,
                  let data = try? Data(contentsOf:path), let event = try? JSONDecoder().decode(SessionActivity.self,from:data),
                  now.timeIntervalSince(event.recordedAt) >= -5, now.timeIntervalSince(event.recordedAt) <= 86_400 else { return nil }
            return event
        }.sorted { $0.recordedAt < $1.recordedAt }
    }
}
