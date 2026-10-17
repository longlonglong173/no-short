import Foundation
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
        if let saved = defaults.string(forKey: key), !saved.isEmpty { return LogSource(rootsEnvironment: saved,claudeRootsEnvironment:claudeRoots) }
        let inherited = environment["CODEX_HOME"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return LogSource(rootsEnvironment: inherited.isEmpty ? home.appendingPathComponent(".codex").path : inherited,claudeRootsEnvironment:claudeRoots)
    }
    private var claudeRoots: String {
        if let saved = defaults.string(forKey:"selectedClaudeHome"), !saved.isEmpty { return saved }
        let inherited = environment["CLAUDE_CONFIG_DIR"]?.trimmingCharacters(in:.whitespacesAndNewlines) ?? ""
        return inherited.isEmpty ? [".config/claude",".claude"].map { home.appendingPathComponent($0).path }.joined(separator:",") : inherited
    }
    public func canChoose(_ url: URL) -> Bool {
        // ccusage's existing source contract separates roots using commas.
        url.isFileURL && !url.path.contains(",") && !url.path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    public func choose(_ url: URL) { if canChoose(url) { defaults.set(url.path, forKey: key) } }
    public func reset() { defaults.removeObject(forKey: key) }
    public func chooseClaude(_ url:URL) { if canChoose(url) { defaults.set(url.path,forKey:"selectedClaudeHome") } }
    public func resetClaude() { defaults.removeObject(forKey:"selectedClaudeHome") }
}
