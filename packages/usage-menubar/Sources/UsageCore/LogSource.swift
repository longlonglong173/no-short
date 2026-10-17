import Foundation
public struct LogSource: Sendable, Equatable {
    public let rootsEnvironment: String
    public var displayName: String { rootsEnvironment }
    public init(rootsEnvironment: String) { self.rootsEnvironment = rootsEnvironment }
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
        if let saved = defaults.string(forKey: key), !saved.isEmpty { return LogSource(rootsEnvironment: saved) }
        let inherited = environment["CODEX_HOME"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return LogSource(rootsEnvironment: inherited.isEmpty ? home.appendingPathComponent(".codex").path : inherited)
    }
    public func canChoose(_ url: URL) -> Bool {
        // ccusage's existing source contract separates roots using commas.
        url.isFileURL && !url.path.contains(",") && !url.path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    public func choose(_ url: URL) { if canChoose(url) { defaults.set(url.path, forKey: key) } }
    public func reset() { defaults.removeObject(forKey: key) }
}
