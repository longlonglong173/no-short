import Foundation

public enum HookInstallationError: Error, LocalizedError {
    case invalidConfiguration
    public var errorDescription: String? { "Cấu hình hooks không hợp lệ hoặc là liên kết. Chưa thay đổi tệp; hãy kiểm tra cấu hình hiện có." }
}
public struct HookInstaller {
    public let executable: URL
    public init(executable:URL) { self.executable = executable }
    private let marker = " --no-short-usage-hook "
    public func install(at path:URL,provider:UsageProvider) throws { try change(at:path,provider:provider) }
    public func remove(at path:URL) throws { try change(at:path,provider:nil) }
    private func change(at path:URL,provider:UsageProvider?) throws {
        let fm = FileManager.default
        var object: [String:Any] = [:]
        var original: Data?
        if fm.fileExists(atPath:path.path) {
            guard (try fm.attributesOfItem(atPath:path.path))[.type] as? FileAttributeType == .typeRegular else { throw HookInstallationError.invalidConfiguration }
            original = try Data(contentsOf:path)
            guard let parsed = try JSONSerialization.jsonObject(with:original!) as? [String:Any] else { throw HookInstallationError.invalidConfiguration }
            object = parsed
        } else if provider == nil { return }
        guard object["hooks"] == nil || object["hooks"] is [String:[[String:Any]]] else { throw HookInstallationError.invalidConfiguration }
        var hooks = object["hooks"] as? [String:[[String:Any]]] ?? [:]
        for (name,groups) in hooks {
            var cleaned: [[String:Any]] = []
            for var group in groups {
                guard let handlers = group["hooks"] as? [[String:Any]] else { throw HookInstallationError.invalidConfiguration }
                let retained = handlers.filter { !(($0["command"] as? String ?? "").contains(marker)) }
                if !retained.isEmpty { group["hooks"] = retained; cleaned.append(group) }
            }
            if cleaned.isEmpty { hooks.removeValue(forKey:name) } else { hooks[name] = cleaned }
        }
        if let provider {
            let quoted = "'" + executable.path.replacingOccurrences(of:"'",with:"'\"'\"'") + "'"
            for event in ["SessionStart","UserPromptSubmit","Stop","SessionEnd"] {
                let handler: [String:Any] = ["type":"command","command":quoted + marker + provider.rawValue,"timeout":2]
                hooks[event,default:[]].append(["hooks":[handler]])
            }
        }
        object["hooks"] = hooks
        let updated = try JSONSerialization.data(withJSONObject:object,options:[.prettyPrinted,.sortedKeys,.withoutEscapingSlashes])
        try fm.createDirectory(at:path.deletingLastPathComponent(),withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        if let original {
            let backup = path.appendingPathExtension("no-short-backup")
            if !fm.fileExists(atPath:backup.path) { try original.write(to:backup,options:.withoutOverwriting); try fm.setAttributes([.posixPermissions:0o600],ofItemAtPath:backup.path) }
        }
        try updated.write(to:path,options:.atomic)
        try fm.setAttributes([.posixPermissions:0o600],ofItemAtPath:path.path)
    }
}
