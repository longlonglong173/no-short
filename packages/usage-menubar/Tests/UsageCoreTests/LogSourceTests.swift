import Foundation
import Darwin
import XCTest
@testable import UsageCore

@MainActor final class LogSourceTests: XCTestCase {
    func testSavedSourceOverridesEnvironmentAndResetRestoresIt() throws {
        let suite = "dev.noshort.tests.\(UUID())"
        let isolated = UserDefaults(suiteName: suite)!
        defer { isolated.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: isolated, environment: ["CODEX_HOME": "/tmp/custom,/tmp/other"], home: URL(fileURLWithPath: "/tmp/home"))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("Nguồn log")
        try FileManager.default.createDirectory(at: root.appendingPathComponent("sessions"), withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root.deletingLastPathComponent()) }
        XCTAssertEqual(store.current.rootsEnvironment, "/tmp/custom,/tmp/other")
        try store.choose(root)
        XCTAssertEqual(store.current.rootsEnvironment, root.path)
        XCTAssertEqual(LogSourceStore(defaults: isolated, environment: [:], home: URL(fileURLWithPath: "/tmp/home")).current.rootsEnvironment, root.path)
        store.reset(); XCTAssertEqual(store.current.rootsEnvironment, "/tmp/custom,/tmp/other")
    }
    func testEmptyEnvironmentUsesHomeAndCommaFolderIsRejected() throws {
        let suite = "dev.noshort.tests.\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: defaults, environment: ["CODEX_HOME":"   "], home: URL(fileURLWithPath: "/tmp/home"))
        XCTAssertEqual(store.current.rootsEnvironment, "/tmp/home/.codex")
        XCTAssertFalse(store.canChoose(URL(fileURLWithPath: "/tmp/a,b")))
    }

    func testInvalidSourcesNeverReplaceEitherSavedProvider() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let suite = "dev.noshort.tests.\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: defaults, environment: [:], home: root)
        let valid = root.appendingPathComponent("Nguồn log hợp lệ")
        for name in ["sessions", "projects"] {
            try FileManager.default.createDirectory(at: valid.appendingPathComponent(name), withIntermediateDirectories: true)
        }
        try store.choose(valid)
        try store.chooseClaude(valid)
        let saved = store.current
        let empty = root.appendingPathComponent("empty")
        try FileManager.default.createDirectory(at: empty, withIntermediateDirectories: true)
        let file = root.appendingPathComponent("file")
        try Data().write(to: file)
        let filesInsteadOfDirectories = root.appendingPathComponent("files")
        try FileManager.default.createDirectory(at: filesInsteadOfDirectories, withIntermediateDirectories: true)
        for name in ["sessions", "projects"] { try Data().write(to: filesInsteadOfDirectories.appendingPathComponent(name)) }
        for url in [empty, file, filesInsteadOfDirectories, root.appendingPathComponent("missing"), valid.appendingPathComponent("sessions"), valid.appendingPathComponent("projects"), URL(string: "https://example.com/logs")!, root.appendingPathComponent("a,b")] {
            XCTAssertThrowsError(try store.choose(url), url.absoluteString)
            XCTAssertEqual(store.current, saved)
            XCTAssertThrowsError(try store.chooseClaude(url), url.absoluteString)
            XCTAssertEqual(store.current, saved)
        }
    }

    func testEachProviderRequiresItsOwnLogDirectoryAndPersistsValidSource() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let suite = "dev.noshort.tests.\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: defaults, environment: [:], home: root)
        let codex = root.appendingPathComponent("Codex logs"), claude = root.appendingPathComponent("Claude logs")
        try FileManager.default.createDirectory(at: codex.appendingPathComponent("sessions"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: claude.appendingPathComponent("projects"), withIntermediateDirectories: true)
        let initial = store.current
        XCTAssertThrowsError(try store.choose(claude)) { XCTAssertEqual($0 as? LogSourceSelectionError, .missingDirectory(.codex)) }
        XCTAssertThrowsError(try store.chooseClaude(codex)) { XCTAssertEqual($0 as? LogSourceSelectionError, .missingDirectory(.claude)) }
        XCTAssertEqual(store.current, initial)
        try store.choose(codex)
        try store.chooseClaude(claude)
        let restored = LogSourceStore(defaults: defaults, environment: [:], home: root)
        XCTAssertEqual(restored.current.rootsEnvironment, codex.path)
        XCTAssertEqual(restored.current.claudeRootsEnvironment, claude.path)
        store.resetClaude()
        XCTAssertEqual(store.current.rootsEnvironment, codex.path)
        XCTAssertNotEqual(store.current.claudeRootsEnvironment, claude.path)
    }

    func testUnreadableOrUnsearchableDirectoriesKeepPreviousSources() throws {
        try XCTSkipIf(geteuid() == 0, "Root bypasses POSIX directory permissions")
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let suite = "dev.noshort.tests.\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: defaults, environment: [:], home: root)
        let initial = store.current
        for provider in ["sessions", "projects"] {
            let home = root.appendingPathComponent(provider), logs = home.appendingPathComponent(provider)
            try FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
            for denied in [home, logs] {
                for mode in [0o000, 0o400, 0o100] {
                    try FileManager.default.setAttributes([.posixPermissions: mode], ofItemAtPath: denied.path)
                    defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: denied.path) }
                    if provider == "sessions" {
                        XCTAssertThrowsError(try store.choose(home)) { XCTAssertEqual($0 as? LogSourceSelectionError, .unreadableDirectory) }
                    } else {
                        XCTAssertThrowsError(try store.chooseClaude(home)) { XCTAssertEqual($0 as? LogSourceSelectionError, .unreadableDirectory) }
                    }
                    XCTAssertEqual(store.current, initial)
                }
            }
        }
    }

    func testSelectionErrorsHaveGuidanceInEverySupportedLanguage() throws {
        for error in [LogSourceSelectionError.invalidPath, .commaInPath, .missingDirectory(.codex), .missingDirectory(.claude), .unreadableDirectory, .emptySelection] {
            let key = try XCTUnwrap(error.errorDescription)
            for language in [AppLanguage.english, .simplifiedChinese] {
                let text = AppLocalization(language: language).text(key)
                XCTAssertNotEqual(text, key, "Missing translation for \(error)")
                XCTAssertFalse(text.isEmpty)
            }
        }
    }

    func testMultipleSourcesAreAtomicIndependentAndRestoreAfterRestart() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let suite = "dev.noshort.tests.\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: defaults, environment: [:], home: root)
        let a = root.appendingPathComponent("Nguồn A"), b = root.appendingPathComponent("Nguồn B")
        for url in [a,b] { for name in ["sessions","projects"] { try FileManager.default.createDirectory(at: url.appendingPathComponent(name), withIntermediateDirectories: true) } }
        try store.choose([a,b], provider: .codex)
        try store.choose([b,a], provider: .claude)
        XCTAssertEqual(store.current.rootsEnvironment, "\(a.path),\(b.path)")
        XCTAssertEqual(store.current.claudeRootsEnvironment, "\(b.path),\(a.path)")
        let saved = store.current
        for provider in UsageProvider.allCases {
            XCTAssertThrowsError(try store.choose([b,root.appendingPathComponent("missing")], provider: provider))
            XCTAssertThrowsError(try store.choose([], provider: provider))
            XCTAssertEqual(store.current, saved)
        }
        XCTAssertEqual(LogSourceStore(defaults: defaults, environment: [:], home: root).current, saved)
        try store.choose([b], provider: .codex)
        XCTAssertEqual(store.current.rootsEnvironment, b.path)
        XCTAssertEqual(store.current.claudeRootsEnvironment, saved.claudeRootsEnvironment)
        store.reset()
        XCTAssertEqual(store.current.rootsEnvironment, root.appendingPathComponent(".codex").path)
        XCTAssertEqual(store.current.claudeRootsEnvironment, saved.claudeRootsEnvironment)
    }

    func testMultipleSourcesDeduplicateAliasesAndKeepLegacySelections() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let suite = "dev.noshort.tests.\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        try FileManager.default.createDirectory(at: root.appendingPathComponent("sessions"), withIntermediateDirectories: true)
        let alias = root.appendingPathComponent("alias")
        try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: root)
        defaults.set(root.path, forKey: "selectedCodexHome")
        let store = LogSourceStore(defaults: defaults, environment: ["CODEX_HOME":"/inherited"], home: root)
        XCTAssertEqual(store.sourceURLs(provider: .codex).map(\.path), [root.path])
        try store.choose([root,alias,root.appendingPathComponent(".")], provider: .codex)
        XCTAssertEqual(store.current.rootsEnvironment, root.path)
        store.reset()
        XCTAssertEqual(store.current.rootsEnvironment, "/inherited")
    }
}
