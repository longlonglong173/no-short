import Foundation

public enum ConnectionStatus: String, Sendable, Equatable {
    case notConfigured, configuredNoData, active, error
    public var label: String {
        switch self {
        case .notConfigured: "Chưa cấu hình"
        case .configuredNoData: "Đã cấu hình · Chờ dữ liệu"
        case .active: "Đang hoạt động"
        case .error: "Cần kiểm tra kết nối"
        }
    }
}

public struct ConnectionDiagnostic: Identifiable, Sendable {
    public let id, title, guidance: String
    public let status: ConnectionStatus
    public let lastReceived: Date?
    public let paths: [String]
}

/// Read-only inspection; installing a connection remains a separate user action.
public enum ConnectionDiagnostics {
    private static func configuration(_ path: URL) throws -> [String: Any]? {
        let fm = FileManager.default
        let attributes: [FileAttributeKey: Any]
        do { attributes = try fm.attributesOfItem(atPath: path.path) }
        catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError { return nil }
        guard attributesOrReadable(attributes, path: path),
              let size = attributes[.size] as? Int, size <= 1_048_576,
              let object = try JSONSerialization.jsonObject(with: Data(contentsOf: path)) as? [String: Any] else { throw SnapshotError.invalid }
        return object
    }
    private static func attributesOrReadable(_ attributes: [FileAttributeKey: Any], path: URL) -> Bool {
        attributes[.type] as? FileAttributeType == .typeRegular && FileManager.default.isReadableFile(atPath: path.path)
    }
    private static func command(executable: URL, argument: String) -> String {
        "'" + executable.path.replacingOccurrences(of: "'", with: "'\"'\"'") + "'" + argument
    }
    public static func hooks(at paths: [URL], provider: UsageProvider, executable: URL) -> ConnectionStatus {
        guard !paths.isEmpty else { return .notConfigured }
        var installed = 0
        do {
            for path in paths {
                guard let object = try configuration(path) else { continue }
                if object["hooks"] == nil { continue }
                guard let hooks = object["hooks"] as? [String: [[String: Any]]] else { return .error }
                // A partial, disabled or differently targeted installation must not appear connected.
                let expected = command(executable: executable, argument: " --no-short-usage-hook " + provider.rawValue)
                var owned = false, complete = true
                for event in ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"] {
                    var found = false
                    for group in hooks[event] ?? [] {
                        guard let handlers = group["hooks"] as? [[String: Any]] else { return .error }
                        for handler in handlers {
                            let value = handler["command"] as? String ?? ""
                            if value.contains(" --no-short-usage-hook ") { owned = true }
                            if value == expected && handler["type"] as? String == "command" && handler["disabled"] as? Bool != true && group["disabled"] as? Bool != true && (group["matcher"] as? String ?? "").isEmpty { found = true }
                        }
                    }
                    complete = complete && found
                }
                if owned && (!complete || object["disableAllHooks"] as? Bool == true) { return .error }
                if complete { installed += 1 }
            }
            return installed == paths.count ? .configuredNoData : installed == 0 ? .notConfigured : .error
        } catch { return .error }
    }
    public static func claudeContext(at paths: [URL], executable: URL) -> ConnectionStatus {
        guard !paths.isEmpty else { return .notConfigured }
        var installed = 0
        do {
            for path in paths {
                guard let object = try configuration(path), let value = object["statusLine"] else { continue }
                guard let status = value as? [String: Any], status["type"] as? String == "command",
                      status["command"] as? String == command(executable: executable, argument: " --claude-context-statusline") else { return .error }
                installed += 1
            }
            return installed == paths.count ? .configuredNoData : installed == 0 ? .notConfigured : .error
        } catch { return .error }
    }
    public static func receiving(_ configured: ConnectionStatus, lastReceived: Date?, now: Date) -> ConnectionStatus {
        guard configured == .configuredNoData, let lastReceived,
              (-5...86_400).contains(now.timeIntervalSince(lastReceived)) else { return configured }
        return .active
    }
    public static func scan(source: LogSource, customSources: Set<UsageProvider>, configurations: [(URL, UsageProvider)], executable: URL,
                            snapshot: UsageSnapshot?, stale: Bool, notice: String?, activities: [SessionActivity], contextDirectory: URL, now: Date = Date()) -> [ConnectionDiagnostic] {
        var result: [ConnectionDiagnostic] = []
        let fm = FileManager.default
        for provider in UsageProvider.allCases {
            let roots = (provider == .codex ? source.rootsEnvironment : source.claudeRootsEnvironment ?? "").split(separator: ",").map { URL(fileURLWithPath: String($0)) }
            var available = 0, invalid = false
            for root in roots {
                let directory = root.appendingPathComponent(provider == .codex ? "sessions" : "projects")
                var isDirectory: ObjCBool = false
                if !fm.fileExists(atPath: directory.path, isDirectory: &isDirectory) {
                    if customSources.contains(provider) { invalid = true }
                    continue
                }
                if !isDirectory.boolValue || !fm.isReadableFile(atPath: directory.path) || !fm.isExecutableFile(atPath: directory.path) || (try? fm.contentsOfDirectory(atPath: directory.path)) == nil { invalid = true }
                else { available += 1 }
            }
            let dates = ISO8601DateFormatter()
            let received = snapshot?.sessions.filter { $0.usageProvider == provider }.compactMap { session -> Date? in
                guard let text = session.lastActivity else { return nil }
                dates.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let value = dates.date(from: text) { return value <= now.addingTimeInterval(5) ? value : nil }
                dates.formatOptions = [.withInternetDateTime]
                return dates.date(from: text).flatMap { $0 <= now.addingTimeInterval(5) ? $0 : nil }
            }.max()
            let logStatus: ConnectionStatus = invalid ? .error : available == 0 ? .notConfigured : stale || notice != nil ? .error : received != nil && snapshot?.status == "ready" ? .active : .configuredNoData
            result.append(ConnectionDiagnostic(id: "logs-" + provider.rawValue, title: provider == .codex ? "Nguồn log Codex" : "Nguồn log Claude Code", guidance: "Log được đọc tự động. Chọn thư mục chứa sessions (Codex) hoặc projects (Claude Code); gửi một tin nhắn rồi làm mới. Khi có lỗi, kiểm tra đường dẫn và quyền đọc.", status: logStatus, lastReceived: received, paths: roots.map(\.path)))
            let files = configurations.filter { $0.1 == provider }.map(\.0)
            let event = activities.filter { $0.provider == provider && $0.recordedAt <= now.addingTimeInterval(5) }.map(\.recordedAt).max()
            let hookStatus = receiving(hooks(at: files, provider: provider, executable: executable), lastReceived: event, now: now)
            result.append(ConnectionDiagnostic(id: "hooks-" + provider.rawValue, title: provider == .codex ? "Hooks Codex" : "Hooks Claude Code", guidance: "Hooks là tùy chọn. Sau khi kết nối, Codex: mở /hooks để tin cậy; Claude Code: mở lại phiên. Gửi tin nhắn để kiểm tra. Nếu lỗi, kiểm tra cấu hình và kết nối lại từ app hiện tại.", status: hookStatus, lastReceived: event, paths: files.map(\.path)))
        }
        var contextDate: Date?, contextError = false
        if fm.fileExists(atPath: contextDirectory.path) {
            do {
                let files = try fm.contentsOfDirectory(at: contextDirectory, includingPropertiesForKeys: nil)
                let store = ClaudeContextStore(directory: contextDirectory)
                for path in files.prefix(512) where path.pathExtension == "json" {
                    let id = path.deletingPathExtension().lastPathComponent
                    guard ContextReading.validSessionID(id) else { continue }
                    if let value = store.read(sessionID: id, now: now) { contextDate = max(contextDate ?? .distantPast, value.recordedAt) }
                    else { contextError = true }
                }
            } catch { contextError = true }
        }
        let files = configurations.filter { $0.1 == .claude }.map(\.0)
        let config = claudeContext(at: files, executable: executable)
        // A custom script can integrate the numeric collector without being owned by
        // the installer. Only telemetry newer than its configuration proves that path.
        let customVerified = config == .error && contextDate.map { received in
            !files.isEmpty && files.allSatisfy { path in
                guard let object = try? configuration(path), let status = object["statusLine"] as? [String: Any],
                      status["type"] as? String == "command", let command = status["command"] as? String, !command.isEmpty,
                      let modified = (try? fm.attributesOfItem(atPath: path.path))?[.modificationDate] as? Date else { return false }
                return received >= modified.addingTimeInterval(-5)
            }
        } == true
        let inspected = customVerified ? ConnectionStatus.configuredNoData : config
        let status = contextError && config != .notConfigured ? .error : receiving(inspected, lastReceived: contextDate, now: now)
        result.append(ConnectionDiagnostic(id: "context-claude", title: "Context Claude Code", guidance: "Context Claude Code là tùy chọn và độc lập với hooks. Kết nối rồi mở lại phiên và gửi tin nhắn để status line gửi số liệu. Nếu đã có status line riêng, app giữ nguyên; xem hướng dẫn để tích hợp.", status: status, lastReceived: contextDate, paths: files.map(\.path)))
        return result
    }
}
