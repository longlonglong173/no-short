import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class BudgetDeliveryRegressionTests: XCTestCase {
    func testReentrantRenderDoesNotPollNotificationsForeverAfterLatchOrDenial() async throws {
        for allowed in [true, false] {
            let name = "BudgetRender-\(UUID().uuidString)", defaults = UserDefaults(suiteName: name)!
            defer { defaults.removePersistentDomain(forName: name) }
            let sender = RenderBudgetSender(allowed: allowed)
            let controller = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
            try controller.apply(rules: [try .init(provider: "all", period: .day, limitUSD: 1)], notificationsEnabled: true)
            controller.update(snapshot: try fixture(), source: "synthetic", isStale: false)
            var renders = 0
            // This is the AppDelegate boundary: a change renders and schedules delivery again.
            controller.onChange = {
                renders += 1
                if renders < 4 { Task { await controller.deliverIfNeeded(language: .english) } }
            }
            await controller.deliverIfNeeded(language: .english)
            try await Task.sleep(for: .milliseconds(30))
            controller.onChange = nil
            XCTAssertLessThanOrEqual(renders, 1, "Unchanged delivery state must not trigger an unbounded render/deliver loop")
            XCTAssertLessThanOrEqual(sender.checks, 2)
            XCTAssertEqual(sender.sent, allowed ? 1 : 0)
        }
    }
    func testOneSuccessfulNotificationCannotEraseAnotherFailureInTheSameBatch() async throws {
        let name = "BudgetBatch-\(UUID().uuidString)", defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let sender = StateBudgetSender(); sender.failFirst = true
        let controller = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        try controller.apply(rules: [try .init(provider: "all", period: .day, limitUSD: 1), try .init(provider: "all", period: .month, limitUSD: 1)], notificationsEnabled: true)
        controller.update(snapshot: try fixture { $0["month"] = $0["today"] }, source: "a", isStale: false)
        await controller.deliverIfNeeded(language: .english)
        XCTAssertEqual(sender.sent, 2); XCTAssertNotNil(controller.notificationNotice)
        await controller.deliverIfNeeded(language: .english)
        XCTAssertNotNil(controller.notificationNotice); XCTAssertEqual(sender.sent, 2)
    }
    func testRestoringPermissionClearsOnlyPermissionNoticeEvenWhenCrossingAlreadyLatched() async throws {
        let name = "BudgetPermission-\(UUID().uuidString)", defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let sender = StateBudgetSender()
        let controller = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        try controller.apply(rules: [try .init(provider: "all", period: .day, limitUSD: 1)], notificationsEnabled: true)
        controller.update(snapshot: try fixture(), source: "a", isStale: false)
        await controller.deliverIfNeeded(language: .english); XCTAssertNil(controller.notificationNotice)
        sender.allowed = false; await controller.deliverIfNeeded(language: .english)
        XCTAssertNotNil(controller.notificationNotice)
        sender.allowed = true; await controller.deliverIfNeeded(language: .english)
        XCTAssertNil(controller.notificationNotice); XCTAssertEqual(sender.sent, 1)
    }

}
@MainActor private final class RenderBudgetSender: BudgetNotificationSending {
    let allowed: Bool
    var checks = 0, sent = 0
    init(allowed: Bool) { self.allowed = allowed }
    func authorize() async throws -> Bool { allowed }
    func isAuthorized() async -> Bool { checks += 1; return allowed }
    func sendBudget(_ reading: UsageBudgetReading, language: AppLanguage) async throws { sent += 1 }
}

@MainActor private final class StateBudgetSender: BudgetNotificationSending {
    var allowed = true, failFirst = false, sent = 0
    func authorize() async throws -> Bool { allowed }
    func isAuthorized() async -> Bool { allowed }
    func sendBudget(_ reading: UsageBudgetReading, language: AppLanguage) async throws {
        sent += 1
        if failFirst && sent == 1 { throw NSError(domain: "synthetic-budget", code: 1) }
    }
}
