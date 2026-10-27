import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class InsightsControllerTests: XCTestCase {
    func testDefaultsExplicitSaveDeniedPermissionAndRestartDedup() async throws {
        let suite = "NS19-\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let s = try insightsFixture(), sender = InsightSender()
        let c = InsightsController(defaults: defaults, notifications: sender, now: { s.generatedAt })
        XCTAssertFalse(c.anomalyEnabled); XCTAssertFalse(c.scenarioEnabled); XCTAssertFalse(c.notificationsEnabled)
        c.update(snapshot: s, source: "a", isStale: false)
        await c.deliverIfNeeded(language: .english)
        XCTAssertNil(c.result); XCTAssertEqual(sender.requests, 0); XCTAssertEqual(sender.checks, 0)
        let budget = BudgetController(defaults: defaults, notifications: sender)
        let settings = BudgetSettingsModel(controller: budget, language: .english, insights: c)
        settings.beginEditing(); settings.anomalyEnabled = true; settings.scenarioEnabled = true; settings.insightNotificationsEnabled = true
        settings.cancel(); XCTAssertFalse(c.anomalyEnabled); XCTAssertEqual(sender.requests, 0)
        settings.beginEditing(); settings.anomalyEnabled = true; settings.scenarioEnabled = true; settings.insightNotificationsEnabled = true
        sender.allowed = false
        let saved = await settings.save(); XCTAssertTrue(saved)
        XCTAssertEqual(sender.requests, 1); XCTAssertEqual(c.result?.anomaly, true); XCTAssertNotNil(c.notificationNotice)
        await c.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 0); XCTAssertEqual(sender.requests, 1)
        sender.allowed = true; await c.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 1)
        await c.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 1)
        let restored = InsightsController(defaults: defaults, notifications: sender, now: { s.generatedAt })
        restored.update(snapshot: s, source: "a", isStale: false)
        await restored.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 1)
        restored.update(snapshot: s, source: "b", isStale: false)
        await restored.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 2)
        restored.update(snapshot: s, source: "c", isStale: true)
        await restored.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 2)
    }
    func testFailureAndSourceChangeDuringPermissionCheckDoNotSendStaleReading() async throws {
        let suite = "NS19-race-\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let s = try insightsFixture(), sender = InsightSender()
        let c = InsightsController(defaults: defaults, notifications: sender, now: { s.generatedAt })
        c.apply(anomalyEnabled: true, scenarioEnabled: true, notificationsEnabled: true, provider: "all")
        c.update(snapshot: s, source: "a", isStale: false)
        sender.onCheck = { c.update(snapshot: s, source: "b", isStale: false) }
        await c.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 0)
        sender.onCheck = nil; sender.fail = true
        await c.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 1); XCTAssertNotNil(c.notificationNotice)
        XCTAssertEqual(c.result?.anomaly, true)
        await c.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 1); XCTAssertNotNil(c.notificationNotice)
        let panel = UsagePanelModel(preferredLanguages: ["en"])
        panel.update(snapshot: s, source: "b", isLoading: false, isStale: true, notice: "read failure", loginState: .notRegistered)
        panel.insightResult = c.result; panel.insightAnomalyEnabled = true
        XCTAssertEqual(UsagePopoverView(model: panel).warning, "read failure")
    }
}
@MainActor private final class InsightSender: InsightNotificationSending, BudgetNotificationSending {
    var allowed = true, fail = false, requests = 0, checks = 0, sent = 0
    var onCheck: (() -> Void)?
    func authorize() async throws -> Bool { requests += 1; return allowed }
    func isAuthorized() async -> Bool { checks += 1; onCheck?(); return allowed }
    func sendBudget(_ reading: UsageBudgetReading, language: AppLanguage) async throws {}
    func sendAnomaly(_ result: UsageInsightsResult, language: AppLanguage) async throws {
        sent += 1; if fail { throw NSError(domain: "synthetic-ns19", code: 1) }
    }
}

extension InsightsControllerTests {
    func testProviderChangesRecomputeAndSettingsEditsCannotReplaySameDay() async throws {
        let suite = "NS19-provider-\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let s = try insightsFixture(), sender = InsightSender()
        let c = InsightsController(defaults: defaults, notifications: sender, now: { s.generatedAt })
        c.apply(anomalyEnabled: true, scenarioEnabled: false, notificationsEnabled: true, provider: "all")
        c.update(snapshot: s, source: "a", isStale: false); await c.deliverIfNeeded(language: .english)
        c.apply(anomalyEnabled: false, scenarioEnabled: true, notificationsEnabled: false, provider: "claude")
        XCTAssertEqual(c.result?.sampleCount, 0); XCTAssertEqual(c.result?.scenarioReason, .history)
        c.apply(anomalyEnabled: true, scenarioEnabled: true, notificationsEnabled: true, provider: "all")
        await c.deliverIfNeeded(language: .vietnamese); XCTAssertEqual(sender.sent, 1)
        XCTAssertEqual(sender.requests, 0, "Applying/refreshing settings never requests permission")
        c.apply(anomalyEnabled: true, scenarioEnabled: false, notificationsEnabled: true, provider: "codex")
        await c.deliverIfNeeded(language: .english); XCTAssertEqual(sender.sent, 2)
    }
}
