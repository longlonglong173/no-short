import Foundation
import XCTest
@testable import UsageCore

@MainActor final class LogSourceTests: XCTestCase {
    func testSavedSourceOverridesEnvironmentAndResetRestoresIt() throws {
        let suite = "dev.noshort.tests.\(UUID())"
        let isolated = UserDefaults(suiteName: suite)!
        defer { isolated.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: isolated, environment: ["CODEX_HOME": "/tmp/custom,/tmp/other"], home: URL(fileURLWithPath: "/tmp/home"))
        XCTAssertEqual(store.current.rootsEnvironment, "/tmp/custom,/tmp/other")
        store.choose(URL(fileURLWithPath: "/tmp/Nguồn log"))
        XCTAssertEqual(store.current.rootsEnvironment, "/tmp/Nguồn log")
        XCTAssertEqual(LogSourceStore(defaults: isolated, environment: [:], home: URL(fileURLWithPath: "/tmp/home")).current.rootsEnvironment, "/tmp/Nguồn log")
        store.reset(); XCTAssertEqual(store.current.rootsEnvironment, "/tmp/custom,/tmp/other")
    }
    func testEmptyEnvironmentUsesHomeAndCommaFolderIsRejected() throws {
        let suite = "dev.noshort.tests.\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: defaults, environment: ["CODEX_HOME":"   "], home: URL(fileURLWithPath: "/tmp/home"))
        XCTAssertEqual(store.current.rootsEnvironment, "/tmp/home/.codex")
        XCTAssertFalse(store.canChoose(URL(fileURLWithPath: "/tmp/a,b")))
    }
}
