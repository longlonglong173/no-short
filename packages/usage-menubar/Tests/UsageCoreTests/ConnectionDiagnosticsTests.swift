import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

final class ConnectionDiagnosticsTests: XCTestCase {
    private func withConfig(_ body: (URL, URL) throws -> Void) throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try body(dir.appendingPathComponent("settings.json"), dir.appendingPathComponent("Usage"))
    }
    func testConfiguredHooksWaitForRealEventsAndKeepProviderSeparate() throws {
        try withConfig { path, executable in
            try HookInstaller(executable: executable).install(at: path, provider: .codex)
            XCTAssertEqual(ConnectionDiagnostics.hooks(at: [path], provider: .codex, executable: executable), .configuredNoData)
            XCTAssertEqual(ConnectionDiagnostics.hooks(at: [path], provider: .claude, executable: executable), .error)
            var config = try JSONSerialization.jsonObject(with: Data(contentsOf: path)) as! [String: Any]
            var hooks = config["hooks"] as! [String: Any]; hooks.removeValue(forKey: "Stop"); config["hooks"] = hooks
            try JSONSerialization.data(withJSONObject: config).write(to: path)
            XCTAssertEqual(ConnectionDiagnostics.hooks(at: [path], provider: .codex, executable: executable), .error)
        }
    }
    func testMissingMalformedSymlinkAndForeignExecutableAreNotConnected() throws {
        try withConfig { path, executable in
            XCTAssertEqual(ConnectionDiagnostics.hooks(at: [path], provider: .codex, executable: executable), .notConfigured)
            try Data("{broken".utf8).write(to: path)
            XCTAssertEqual(ConnectionDiagnostics.hooks(at: [path], provider: .codex, executable: executable), .error)
            try FileManager.default.removeItem(at: path)
            try HookInstaller(executable: URL(fileURLWithPath: "/old/app")).install(at: path, provider: .codex)
            XCTAssertEqual(ConnectionDiagnostics.hooks(at: [path], provider: .codex, executable: executable), .error)
            try FileManager.default.removeItem(at: path)
            try FileManager.default.createSymbolicLink(at: path, withDestinationURL: executable)
            XCTAssertEqual(ConnectionDiagnostics.hooks(at: [path], provider: .codex, executable: executable), .error)
        }
    }
    func testClaudeStatusLineDoesNotClaimCustomPipelines() throws {
        try withConfig { path, executable in
            try ClaudeContextInstaller(executable: executable).install(at: path)
            XCTAssertEqual(ConnectionDiagnostics.claudeContext(at: [path], executable: executable), .configuredNoData)
            try Data(#"{"statusLine":{"type":"command","command":"echo custom | app --claude-context-statusline"}}"#.utf8).write(to: path)
            let original = try Data(contentsOf: path)
            XCTAssertEqual(ConnectionDiagnostics.claudeContext(at: [path], executable: executable), .error)
            XCTAssertEqual(try Data(contentsOf: path), original)
        }
    }
    func testEvidenceUsesRecordedTimeRejectsFutureAndExpiresWithoutInventingReceipts() {
        let now = Date(timeIntervalSince1970: 200_000), received = Date(timeIntervalSince1970: 199_990)
        XCTAssertEqual(ConnectionDiagnostics.receiving(.configuredNoData, lastReceived: nil, now: now), .configuredNoData)
        XCTAssertEqual(ConnectionDiagnostics.receiving(.configuredNoData, lastReceived: received, now: now), .active)
        XCTAssertEqual(ConnectionDiagnostics.receiving(.configuredNoData, lastReceived: now.addingTimeInterval(60), now: now), .configuredNoData)
        XCTAssertEqual(ConnectionDiagnostics.receiving(.configuredNoData, lastReceived: now.addingTimeInterval(-86_401), now: now), .configuredNoData)
        XCTAssertEqual(ConnectionDiagnostics.receiving(.error, lastReceived: received, now: now), .error)
        XCTAssertEqual(ConnectionDiagnostics.receiving(.notConfigured, lastReceived: received, now: now), .notConfigured)
    }
    func testLogsNeedActualSessionsAndStaleDataCannotAppearActive() throws {
        try withConfig { path, executable in
            let root = path.deletingLastPathComponent(), context = root.appendingPathComponent("context")
            try FileManager.default.createDirectory(at: root.appendingPathComponent("sessions"), withIntermediateDirectories: true)
            let source = LogSource(rootsEnvironment: root.path)
            let empty = try fixture { $0["status"] = "empty"; $0["sessions"] = [] }
            let now = Date(timeIntervalSince1970: 1_792_320_000)
            func scan(_ snapshot: UsageSnapshot?, _ stale: Bool = false) -> ConnectionDiagnostic {
                ConnectionDiagnostics.scan(source: source, customSources: [.codex], configurations: [], executable: executable,
                    snapshot: snapshot, stale: stale, notice: nil, activities: [], contextDirectory: context, now: now).first { $0.id == "logs-codex" }!
            }
            XCTAssertEqual(scan(empty).status, .configuredNoData)
            XCTAssertNil(scan(empty).lastReceived)
            let full = try fixture { object in
                var sessions = object["sessions"] as! [[String: Any]]
                for index in sessions.indices { sessions[index]["lastActivity"] = "2026-10-17T00:00:00Z" }
                object["sessions"] = sessions
            }
            let received = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-10-17T00:00:00Z"))
            XCTAssertEqual(scan(full).status, .active)
            XCTAssertEqual(scan(full).lastReceived, received)
            XCTAssertEqual(scan(full, true).status, .error)
            try FileManager.default.removeItem(at: root.appendingPathComponent("sessions"))
            XCTAssertEqual(scan(full).status, .error)
        }
    }
    func testClaudeReceiptsAreReadIndependentOfSelectedProviderAndKeepTheirTimestamp() throws {
        try withConfig { path, executable in
            let root = path.deletingLastPathComponent(), directory = root.appendingPathComponent("context")
            try ClaudeContextInstaller(executable: executable).install(at: path)
            let now = Date(timeIntervalSince1970: 200_000), received = now.addingTimeInterval(-10)
            try ClaudeContextStore(directory: directory).write(ContextReading(sessionID: "claude-main", usedTokens: 40, limitTokens: 100, recordedAt: received))
            let results = ConnectionDiagnostics.scan(source: LogSource(rootsEnvironment: root.path), customSources: [], configurations: [(path, .claude)], executable: executable,
                snapshot: nil, stale: false, notice: nil, activities: [], contextDirectory: directory, now: now)
            let context = try XCTUnwrap(results.first { $0.id == "context-claude" })
            XCTAssertEqual(context.status, .active)
            XCTAssertEqual(context.lastReceived, received)
        }
    }
    func testUnusedDefaultHomeAndOldHookReceiptRemainHonest() throws {
        try withConfig { path, executable in
            let root = path.deletingLastPathComponent()
            try HookInstaller(executable: executable).install(at: path, provider: .codex)
            let now = Date(), old = now.addingTimeInterval(-86_401)
            let store = ActivityStore(directory: root.appendingPathComponent("activity"))
            try store.append(try XCTUnwrap(SessionActivity.parse(Data(#"{"session_id":"old-main","hook_event_name":"UserPromptSubmit"}"#.utf8), provider: .codex, now: old)))
            let diagnostics = ConnectionDiagnostics.scan(source: LogSource(rootsEnvironment: root.path), customSources: [], configurations: [(path, .codex)], executable: executable,
                snapshot: nil, stale: false, notice: nil, activities: store.events(now: now, maximumAge: nil), contextDirectory: root.appendingPathComponent("context"), now: now)
            XCTAssertEqual(diagnostics.first { $0.id == "logs-codex" }?.status, .notConfigured)
            XCTAssertEqual(diagnostics.first { $0.id == "hooks-codex" }?.status, .configuredNoData)
            XCTAssertEqual(diagnostics.first { $0.id == "hooks-codex" }?.lastReceived, old)
        }
    }
    func testCustomContextIntegrationCanProveConnectionWithNewTelemetry() throws {
        try withConfig { path, executable in
            let root = path.deletingLastPathComponent(), directory = root.appendingPathComponent("context")
            try Data(#"{"statusLine":{"type":"command","command":"/my/custom-script"}}"#.utf8).write(to: path)
            let now = Date()
            try ClaudeContextStore(directory: directory).write(ContextReading(sessionID: "custom-main", usedTokens: 40, limitTokens: 100, recordedAt: now))
            let results = ConnectionDiagnostics.scan(source: LogSource(rootsEnvironment: root.path), customSources: [], configurations: [(path, .claude)], executable: executable,
                snapshot: nil, stale: false, notice: nil, activities: [], contextDirectory: directory, now: now)
            XCTAssertEqual(results.first { $0.id == "context-claude" }?.status, .active)
        }
    }
    @MainActor func testFirstRunGuidanceCanBeReopenedAndDoesNotInstallAnything() {
        let suite = "SetupTests-\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = UsagePanelModel(defaults: defaults)
        XCTAssertTrue(model.showsSetup)
        model.dismissSetup()
        XCTAssertFalse(UsagePanelModel(defaults: defaults).showsSetup)
        model.showsSetup = true
        XCTAssertTrue(model.showsSetup)
        XCTAssertTrue(model.connectionDiagnostics.isEmpty)
    }
}
