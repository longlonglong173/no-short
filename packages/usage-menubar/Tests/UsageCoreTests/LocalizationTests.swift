import XCTest
import AppKit
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class LocalizationTests: XCTestCase {
    func testLanguageChoicePersistsAndUpdatesWithoutChangingSelection() throws {
        let suite = "LocalizationTests-\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = UsagePanelModel(defaults: defaults, preferredLanguages: ["vi-VN"])
        let snapshot = try fixture()
        model.update(snapshot: snapshot, source: "/tmp/logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        model.chooseSession("main")
        let cost = model.mainCost
        model.setLanguage(.simplifiedChinese)
        XCTAssertEqual(model.l("Hôm nay"), "今天")
        XCTAssertEqual(model.selectedSessionID, "main")
        XCTAssertEqual(model.mainCost, cost)
        XCTAssertEqual(UsagePanelModel(defaults: defaults, preferredLanguages: ["en"]).language, .simplifiedChinese)
        model.setLanguage(.english)
        XCTAssertEqual(model.l("Hôm nay"), "Today")
        XCTAssertTrue(model.contextTooltip.contains("subscription"))
    }
    func testSystemLanguageFallbackAndExplicitPreference() {
        XCTAssertEqual(AppLanguage.resolve(saved: nil, preferred: ["zh-Hans-CN"]), .simplifiedChinese)
        XCTAssertEqual(AppLanguage.resolve(saved: nil, preferred: ["vi-VN"]), .vietnamese)
        XCTAssertEqual(AppLanguage.resolve(saved: "invalid", preferred: ["fr"]), .english)
        XCTAssertEqual(AppLanguage.resolve(saved: "vi", preferred: ["en"]), .vietnamese)
    }
    func testCatalogCoversAllLanguagesAndPreservesArguments() {
        for key in AppLocalization.catalog.keys {
            let count = key.components(separatedBy: "%@").count
            for translation in AppLocalization.catalog[key]! {
                XCTAssertEqual(translation.components(separatedBy: "%@").count, count, key)
            }
            for language in AppLanguage.allCases {
                XCTAssertFalse(AppLocalization(language: language).text(key).isEmpty, key)
            }
        }
        let text = AppLocalization(language: .simplifiedChinese).text("Context %@ đã dùng %@%, chạm ngưỡng %@%.", "Codex", "74", "70")
        XCTAssertTrue(text.contains("Codex")); XCTAssertTrue(text.contains("74%")); XCTAssertTrue(text.contains("70%"))
    }
    func testNativeMenuChangesLabelsAndDispatchesTheLanguageChoice() throws {
        _ = NSApplication.shared
        let menu = MenuBuilder(), snapshot = try fixture()
        let presentation = UsagePresentation.make(snapshot: snapshot, stale: false, loading: false, now: snapshot.generatedAt, language: .english)
        menu.updateContextAlertThreshold(80)
        menu.update(presentation: presentation, source: LogSource(rootsEnvironment: "/tmp/logs"), isLoading: false, notice: nil, loginState: .requiresApproval, snapshot: snapshot, language: .english)
        XCTAssertNotNil(menu.menu.item(withTitle: "Refresh"))
        XCTAssertNotNil(menu.menu.item(withTitle: "Context alert threshold: 80%…"))
        let submenu = try XCTUnwrap(menu.menu.item(withTitle: "Language")?.submenu)
        XCTAssertEqual(submenu.item(withTitle: "English")?.state, .on)
        var chosen: AppLanguage?
        menu.onLanguageChange = { chosen = $0 }
        submenu.performActionForItem(at: submenu.indexOfItem(withTitle: "简体中文"))
        XCTAssertEqual(chosen, .simplifiedChinese)
        menu.update(presentation: presentation, source: LogSource(rootsEnvironment: "/tmp/logs"), isLoading: false, notice: nil, loginState: .requiresApproval, snapshot: snapshot, language: .simplifiedChinese)
        XCTAssertNotNil(menu.menu.item(withTitle: "刷新"))
        XCTAssertNotNil(menu.menu.item(withTitle: "上下文提醒阈值：80%…"))
    }
    func testLanguageSwitchDoesNotReplayContextAlertsOrTranslateSessionTitles() throws {
        let model = UsagePanelModel(preferredLanguages: ["vi"]), snapshot = try fixture()
        model.update(snapshot: snapshot, source: "/tmp/logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        model.chooseSession("main")
        let title = model.selectionLabel
        model.updateContexts([.codex: ContextReading(sessionID: "main", usedTokens: 74, limitTokens: 100, recordedAt: Date())])
        XCTAssertEqual(model.consumeContextAlerts().count, 1)
        model.setLanguage(.simplifiedChinese)
        XCTAssertEqual(model.selectionLabel, title)
        XCTAssertTrue(model.contextWarning?.contains("提醒阈值") == true)
        XCTAssertTrue(model.consumeContextAlerts().isEmpty)
    }

}
