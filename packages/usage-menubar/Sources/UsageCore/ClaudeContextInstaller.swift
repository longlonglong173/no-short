import Foundation

public enum ClaudeContextInstallationError: Error, LocalizedError {
    case invalidConfiguration, existingStatusLine
    public var errorDescription:String? {
        switch self {
        case .existingStatusLine: return "Claude Code đã có status line riêng; app giữ nguyên. Xem tài liệu để nối bộ thu context vào script hiện có."
        case .invalidConfiguration: return "Cấu hình Claude Code không hợp lệ hoặc là liên kết. App chưa thay đổi tệp."
        }
    }
}
public struct ClaudeContextInstaller {
    public let executable:URL
    public init(executable:URL) { self.executable=executable }
    private let marker = " --claude-context-statusline"
    public func install(at path:URL) throws { try change(at:path,install:true) }
    public func remove(at path:URL) throws { try change(at:path,install:false) }
    private func change(at path:URL,install:Bool) throws {
        let fm=FileManager.default
        var object: [String:Any] = [:], original:Data?
        if let attributes = try? fm.attributesOfItem(atPath:path.path), attributes[.type] as? FileAttributeType != .typeRegular { throw ClaudeContextInstallationError.invalidConfiguration }
        if fm.fileExists(atPath:path.path) {
            original = try Data(contentsOf:path)
            guard let parsed = try JSONSerialization.jsonObject(with:original!) as? [String:Any] else { throw ClaudeContextInstallationError.invalidConfiguration }
            object=parsed
        } else if !install { return }
        let status=object["statusLine"] as? [String:Any]
        let quoted = "'" + executable.path.replacingOccurrences(of:"'",with:"'\"'\"'") + "'"
        let command=quoted + marker
        // Suffix matching would also claim a user's composed shell pipeline.
        let owned = status?["type"] as? String == "command" && status?["command"] as? String == command
        if install {
            guard object["statusLine"] == nil || owned else { throw ClaudeContextInstallationError.existingStatusLine }
            object["statusLine"] = ["type":"command","command":command]
        } else {
            guard owned else { return }
            object.removeValue(forKey:"statusLine")
        }
        let data = try JSONSerialization.data(withJSONObject:object,options:[.prettyPrinted,.sortedKeys,.withoutEscapingSlashes])
        try fm.createDirectory(at:path.deletingLastPathComponent(),withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
        if let original {
            let backup=path.appendingPathExtension("no-short-context-backup")
            if !fm.fileExists(atPath:backup.path) { try original.write(to:backup,options:.withoutOverwriting); try fm.setAttributes([.posixPermissions:0o600],ofItemAtPath:backup.path) }
        }
        try data.write(to:path,options:.atomic)
        try fm.setAttributes([.posixPermissions:0o600],ofItemAtPath:path.path)
    }
}
