import Foundation

public enum LogSourceSelectionError: LocalizedError, Equatable {
    case invalidPath, commaInPath, missingDirectory(UsageProvider), unreadableDirectory, emptySelection

    public var errorDescription: String? {
        switch self {
        case .emptySelection:
            "Thêm ít nhất một thư mục hoặc dùng nguồn log mặc định trong Cài đặt."
        case .invalidPath:
            "Hãy chọn một thư mục log trên máy. Nguồn log hiện tại được giữ nguyên."
        case .commaInPath:
            "Tên thư mục không được chứa dấu phẩy vì bộ đọc dùng dấu phẩy để tách nguồn log."
        case .missingDirectory(.codex):
            "Hãy chọn thư mục Codex home chứa thư mục sessions, không chọn sessions hoặc tệp log bên trong. Nguồn log hiện tại được giữ nguyên."
        case .missingDirectory(.claude):
            "Hãy chọn thư mục Claude Code chứa thư mục projects, không chọn projects hoặc tệp log bên trong. Nguồn log hiện tại được giữ nguyên."
        case .unreadableDirectory:
            "Không đọc hoặc truy cập được thư mục log. Kiểm tra quyền đọc và truy cập thư mục rồi chọn lại. Nguồn log hiện tại được giữ nguyên."
        }
    }
}

public struct LogSource: Sendable, Equatable {
    public let rootsEnvironment: String
    public let claudeRootsEnvironment: String?
    public var displayName: String { claudeRootsEnvironment.map { "Codex: \(rootsEnvironment) · Claude Code: \($0)" } ?? rootsEnvironment }
    public init(rootsEnvironment: String, claudeRootsEnvironment: String? = nil) { self.rootsEnvironment = rootsEnvironment; self.claudeRootsEnvironment = claudeRootsEnvironment }
}

@MainActor public final class LogSourceStore {
    private let defaults: UserDefaults
    private let environment: [String: String]
    private let home: URL
    private let key = "selectedCodexHome"
    public init(defaults: UserDefaults = .standard, environment: [String: String] = ProcessInfo.processInfo.environment, home: URL = FileManager.default.homeDirectoryForCurrentUser) {
        self.defaults = defaults; self.environment = environment; self.home = home
    }
    public var current: LogSource {
        if let saved = defaults.stringArray(forKey: "selectedCodexHomes"), !saved.isEmpty {
            return LogSource(rootsEnvironment: saved.joined(separator: ","), claudeRootsEnvironment: claudeRoots)
        }
        if let saved = defaults.string(forKey: key), !saved.isEmpty { return LogSource(rootsEnvironment: saved,claudeRootsEnvironment:claudeRoots) }
        let inherited = environment["CODEX_HOME"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return LogSource(rootsEnvironment: inherited.isEmpty ? home.appendingPathComponent(".codex").path : inherited,claudeRootsEnvironment:claudeRoots)
    }
    private var claudeRoots: String {
        if let saved = defaults.stringArray(forKey: "selectedClaudeHomes"), !saved.isEmpty { return saved.joined(separator: ",") }
        if let saved = defaults.string(forKey:"selectedClaudeHome"), !saved.isEmpty { return saved }
        let inherited = environment["CLAUDE_CONFIG_DIR"]?.trimmingCharacters(in:.whitespacesAndNewlines) ?? ""
        return inherited.isEmpty ? [".config/claude",".claude"].map { home.appendingPathComponent($0).path }.joined(separator:",") : inherited
    }
    private func validate(_ url: URL, provider: UsageProvider) throws {
        guard url.isFileURL, !url.path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw LogSourceSelectionError.invalidPath }
        // ccusage's existing source contract separates roots using commas.
        guard !url.path.contains(",") else { throw LogSourceSelectionError.commaInPath }
        let fm = FileManager.default
        let logs = url.appendingPathComponent(provider == .codex ? "sessions" : "projects")
        for directory in [url, logs] {
            var isDirectory: ObjCBool = false
            guard fm.fileExists(atPath: directory.path, isDirectory: &isDirectory), isDirectory.boolValue else {
                throw LogSourceSelectionError.missingDirectory(provider)
            }
            // Directories need both listing (read) and traversal (search) access.
            guard fm.isReadableFile(atPath: directory.path), fm.isExecutableFile(atPath: directory.path) else {
                throw LogSourceSelectionError.unreadableDirectory
            }
            do { _ = try fm.contentsOfDirectory(atPath: directory.path) }
            catch { throw LogSourceSelectionError.unreadableDirectory }
        }
    }
    public func canChoose(_ url: URL, provider: UsageProvider = .codex) -> Bool {
        (try? validate(url, provider: provider)) != nil
    }
    public func selectionError(for url: URL, provider: UsageProvider) -> LogSourceSelectionError? {
        do { try validate(url, provider: provider); return nil }
        catch { return error as? LogSourceSelectionError ?? .unreadableDirectory }
    }
    public func sourceURLs(provider: UsageProvider) -> [URL] {
        let value = provider == .codex ? current.rootsEnvironment : current.claudeRootsEnvironment ?? ""
        return Self.uniqueURLs(value.split(separator: ",").map { URL(fileURLWithPath: String($0).trimmingCharacters(in: .whitespacesAndNewlines)) })
    }
    public static func uniqueURLs(_ urls: [URL]) -> [URL] {
        var seen = Set<String>()
        return urls.filter { seen.insert($0.resolvingSymlinksInPath().standardizedFileURL.absoluteString).inserted }
    }
    public func choose(_ urls: [URL], provider: UsageProvider) throws {
        guard !urls.isEmpty else { throw LogSourceSelectionError.emptySelection }
        // Validate the whole draft before changing any preference. Validate before
        // deduplication too, so an invalid alias cannot bypass path restrictions.
        for url in urls { try validate(url, provider: provider) }
        let paths = Self.uniqueURLs(urls).map { $0.standardizedFileURL.path }
        defaults.set(paths, forKey: provider == .codex ? "selectedCodexHomes" : "selectedClaudeHomes")
        defaults.removeObject(forKey: provider == .codex ? key : "selectedClaudeHome")
    }
    public func choose(_ url: URL) throws {
        try choose([url], provider: .codex)
    }
    public func reset() { defaults.removeObject(forKey: key); defaults.removeObject(forKey: "selectedCodexHomes") }
    public func chooseClaude(_ url:URL) throws {
        try choose([url], provider: .claude)
    }
    public func resetClaude() { defaults.removeObject(forKey:"selectedClaudeHome"); defaults.removeObject(forKey: "selectedClaudeHomes") }
}
