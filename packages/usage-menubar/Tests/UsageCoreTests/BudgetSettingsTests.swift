import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class BudgetSettingsTests: XCTestCase {
    func testBudgetSettingsMenuEntryExistsInEveryLanguage() throws {
        _ = NSApplication.shared
        let menu = MenuBuilder(), snapshot = try fixture()
        for (language, title) in [(AppLanguage.english, "Budgets…"), (.vietnamese, "Ngân sách…"), (.simplifiedChinese, "预算…")] {
            menu.update(presentation: UsagePresentation.make(snapshot: snapshot, stale: false, loading: false, now: fixtureNow),
                source: LogSource(rootsEnvironment: "/tmp/synthetic"), isLoading: false, notice: nil, loginState: .notRegistered, snapshot: snapshot, language: language)
            XCTAssertNotNil(menu.menu.item(withTitle: title)?.action)
        }
    }
}

extension BudgetSettingsTests {
    func testDefaultsSaveValidationCancelAndPersistenceDoNotRequestPermission() async throws {
        let defaults = budgetDefaults(); defer { defaults.removePersistentDomain(forName: defaultsSuite(defaults)) }
        let sender = BudgetNotificationStub()
        let controller = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        XCTAssertTrue(controller.rules.isEmpty); XCTAssertFalse(controller.notificationsEnabled)
        let settings = BudgetSettingsModel(controller: controller, language: .english)
        settings.beginEditing(); settings.rows[0].day = "2"; settings.notificationsEnabled = true
        settings.cancel()
        XCTAssertTrue(controller.rules.isEmpty); XCTAssertEqual(sender.requests, 0)
        for invalid in ["0", "-1", "nan", "inf", "1e309", "bad"] {
            settings.beginEditing(); settings.rows[0].day = invalid; settings.notificationsEnabled = true
            let saved = await settings.save(); XCTAssertFalse(saved)
            XCTAssertTrue(controller.rules.isEmpty); XCTAssertFalse(controller.notificationsEnabled)
        }
        settings.beginEditing(); settings.rows[0].day = "2.50"; settings.rows[1].month = "10"
        let saved = await settings.save(); XCTAssertTrue(saved)
        XCTAssertEqual(controller.rules.count, 2); XCTAssertEqual(sender.requests, 0)
        let restored = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        XCTAssertEqual(restored.rules.map(\.limitUSD), [2.5, 10]); XCTAssertFalse(restored.notificationsEnabled)
    }
    func testPermissionIsRequestedOnlyAfterExplicitValidSaveEnablingNotifications() async throws {
        let defaults = budgetDefaults(); defer { defaults.removePersistentDomain(forName: defaultsSuite(defaults)) }
        let sender = BudgetNotificationStub(); sender.allowed = false
        let controller = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        controller.update(snapshot: try fixture(), source: "a", isStale: false)
        await controller.deliverIfNeeded(language: .english)
        XCTAssertEqual(sender.requests, 0); XCTAssertEqual(sender.checks, 0)
        let settings = BudgetSettingsModel(controller: controller, language: .english)
        settings.beginEditing(); settings.rows[0].day = "1"; settings.notificationsEnabled = true
        let saved = await settings.save(); XCTAssertTrue(saved)
        XCTAssertEqual(sender.requests, 1)
        XCTAssertTrue(controller.readings.first?.exceeded == true)
        XCTAssertNotNil(controller.notificationNotice)
        await controller.deliverIfNeeded(language: .english)
        XCTAssertEqual(sender.requests, 1); XCTAssertEqual(sender.sent.count, 0)
        XCTAssertTrue(controller.readings.first?.exceeded == true)
    }
    func testNotificationLatchPersistsAcrossRestartAndThresholdChangesButSeparatesSources() async throws {
        let defaults = budgetDefaults(); defer { defaults.removePersistentDomain(forName: defaultsSuite(defaults)) }
        let sender = BudgetNotificationStub(), rule = try UsageBudgetRule(provider: "all", period: .day, limitUSD: 2)
        let controller = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        try controller.apply(rules: [rule], notificationsEnabled: true)
        controller.update(snapshot: try fixture(), source: "a", isStale: false)
        await controller.deliverIfNeeded(language: .english)
        await controller.deliverIfNeeded(language: .english)
        XCTAssertEqual(sender.requests, 0); XCTAssertEqual(sender.sent.count, 1)
        let restored = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        try restored.apply(rules: [try .init(provider: "all", period: .day, limitUSD: 1)], notificationsEnabled: true)
        restored.update(snapshot: try fixture(), source: "a", isStale: false)
        await restored.deliverIfNeeded(language: .english)
        XCTAssertEqual(sender.sent.count, 1)
        restored.update(snapshot: try fixture(), source: "b", isStale: false)
        await restored.deliverIfNeeded(language: .english)
        XCTAssertEqual(sender.sent.count, 2)
        restored.update(snapshot: try fixture(), source: "c", isStale: true)
        await restored.deliverIfNeeded(language: .english)
        XCTAssertEqual(sender.sent.count, 2)
    }
    func testNotificationFailureLeavesInAppBudgetAndUsageReadFailureIndependent() async throws {
        let defaults = budgetDefaults(); defer { defaults.removePersistentDomain(forName: defaultsSuite(defaults)) }
        let sender = BudgetNotificationStub(); sender.fail = true
        let controller = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        try controller.apply(rules: [try .init(provider: "all", period: .day, limitUSD: 1)], notificationsEnabled: true)
        controller.update(snapshot: try fixture(), source: "a", isStale: false)
        await controller.deliverIfNeeded(language: .english)
        XCTAssertNotNil(controller.notificationNotice); XCTAssertTrue(controller.readings[0].exceeded)
        let panel = UsagePanelModel(preferredLanguages: ["en"])
        panel.update(snapshot: try fixture(), source: "a", isLoading: false, isStale: true, notice: "read failure", loginState: .notRegistered)
        panel.budgetReadings = controller.readings; panel.budgetNotificationNotice = controller.notificationNotice
        XCTAssertEqual(UsagePopoverView(model: panel).warning, "read failure")
        await controller.deliverIfNeeded(language: .english)
        XCTAssertEqual(sender.sent.count, 1, "A failed delivery must not spam attempts in the same period")
    }
    func testSettingsAndBudgetWarningsRenderInThreeLanguagesWithoutSystemPermissionCalls() throws {
        _ = NSApplication.shared
        let defaults = budgetDefaults(); defer { defaults.removePersistentDomain(forName: defaultsSuite(defaults)) }
        let sender = BudgetNotificationStub()
        let controller = BudgetController(defaults: defaults, notifications: sender, now: { fixtureNow })
        try controller.apply(rules: [try .init(provider: "all", period: .day, limitUSD: 1)], notificationsEnabled: false)
        controller.update(snapshot: try fixture(), source: "synthetic", isStale: false)
        for language in AppLanguage.allCases {
            let settings = BudgetSettingsModel(controller: controller, language: language); settings.beginEditing()
            for scheme in [ColorScheme.light, .dark] {
                let host = NSHostingView(rootView: BudgetSettingsView(model: settings).environment(\.colorScheme, scheme))
                host.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
                host.frame = NSRect(x: 0, y: 0, width: 560, height: 560); host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsWide, 560)
                if let dir = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
                    try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: dir).appendingPathComponent("ns11-\(language.rawValue)-\(scheme == .dark ? "dark" : "light").png"))
                }
            }
            let panel = UsagePanelModel(preferredLanguages: [language.rawValue])
            panel.update(snapshot: try fixture(), source: "synthetic", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
            panel.budgetReadings = controller.readings
            let panelHost = NSHostingView(rootView: UsagePopoverView(model: panel))
            panelHost.frame = NSRect(x: 0, y: 0, width: 400, height: 360); panelHost.layoutSubtreeIfNeeded()
            let panelBitmap = try XCTUnwrap(panelHost.bitmapImageRepForCachingDisplay(in: panelHost.bounds))
            panelHost.cacheDisplay(in: panelHost.bounds, to: panelBitmap)
            if let dir = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                try XCTUnwrap(panelBitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: dir).appendingPathComponent("ns11-popover-\(language.rawValue).png"))
            }
            let window = BudgetSettingsWindowController(model: settings)
            XCTAssertFalse(try XCTUnwrap(window.window).isReleasedWhenClosed)
            window.close()
        }
        XCTAssertEqual(sender.requests, 0); XCTAssertEqual(sender.checks, 0)
    }
}

@MainActor private final class BudgetNotificationStub: BudgetNotificationSending {
    var allowed = true, fail = false, requests = 0, checks = 0
    var sent: [UsageBudgetReading] = []
    func authorize() async throws -> Bool { requests += 1; return allowed }
    func isAuthorized() async -> Bool { checks += 1; return allowed }
    func sendBudget(_ reading: UsageBudgetReading, language: AppLanguage) async throws {
        sent.append(reading)
        if fail { throw NSError(domain: "synthetic-notifications", code: 1) }
    }
}
@MainActor private var budgetSuites: [ObjectIdentifier: String] = [:]
@MainActor private func budgetDefaults() -> UserDefaults {
    let suite = "BudgetSettingsTests-\(UUID().uuidString)", defaults = UserDefaults(suiteName: suite)!
    budgetSuites[ObjectIdentifier(defaults)] = suite
    return defaults
}
@MainActor private func defaultsSuite(_ defaults: UserDefaults) -> String {
    budgetSuites.removeValue(forKey: ObjectIdentifier(defaults))!
}
