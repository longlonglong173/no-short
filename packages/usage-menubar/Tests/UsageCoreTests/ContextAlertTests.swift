import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

final class ContextAlertTests: XCTestCase {
    private func reading(_ used: Double, session: String = "main") -> ContextReading {
        ContextReading(sessionID:session,usedTokens:used,limitTokens:100,recordedAt:Date())
    }
    func testOnlyCrossingTheExactThresholdAlertsAndUnknownDoesNotRearm() {
        var tracker = ContextAlertTracker()
        XCTAssertFalse(tracker.consume(reading(69.9),provider:.codex,source:"a",threshold:70))
        XCTAssertTrue(tracker.consume(reading(70),provider:.codex,source:"a",threshold:70))
        XCTAssertFalse(tracker.consume(nil,provider:.codex,source:"a",threshold:70))
        XCTAssertFalse(tracker.consume(reading(90),provider:.codex,source:"a",threshold:70))
        XCTAssertFalse(tracker.consume(reading(30),provider:.codex,source:"a",threshold:70))
        XCTAssertTrue(tracker.consume(reading(71),provider:.codex,source:"a",threshold:70))
    }
    func testSessionsProvidersAndSourcesHaveIndependentCrossingsAndSurviveRestart() throws {
        var tracker = ContextAlertTracker()
        XCTAssertTrue(tracker.consume(reading(80),provider:.codex,source:"a",threshold:70))
        XCTAssertTrue(tracker.consume(reading(80,session:"second"),provider:.codex,source:"a",threshold:70))
        XCTAssertTrue(tracker.consume(reading(80),provider:.claude,source:"a",threshold:70))
        XCTAssertTrue(tracker.consume(reading(80),provider:.codex,source:"b",threshold:70))
        var restored = try JSONDecoder().decode(ContextAlertTracker.self,from:JSONEncoder().encode(tracker))
        XCTAssertFalse(restored.consume(reading(90),provider:.codex,source:"a",threshold:70))
        XCTAssertFalse(restored.consume(reading(90,session:"second"),provider:.codex,source:"a",threshold:70))
    }
}

@MainActor final class ContextAlertModelTests: XCTestCase {
    func testDisablingNotificationsKeepsWarningAndDoesNotReplayOldCrossings() throws {
        let model = UsagePanelModel(), snapshot = try fixture()
        model.update(snapshot:snapshot,source:"a",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        model.setContextNotificationsEnabled(false)
        model.updateContexts([.codex:ContextReading(sessionID:"main",usedTokens:80,limitTokens:100,recordedAt:Date())])
        XCTAssertNotNil(model.contextWarning)
        XCTAssertTrue(model.consumeContextAlerts().isEmpty)
        model.setContextNotificationsEnabled(true)
        XCTAssertTrue(model.consumeContextAlerts().isEmpty)
        model.updateContexts([.codex:ContextReading(sessionID:"main",usedTokens:20,limitTokens:100,recordedAt:Date())])
        XCTAssertTrue(model.consumeContextAlerts().isEmpty)
        model.updateContexts([.codex:ContextReading(sessionID:"main",usedTokens:70,limitTokens:100,recordedAt:Date())])
        XCTAssertEqual(model.consumeContextAlerts().count,1)
    }
    func testDefaultThresholdSettingsPersistenceAndStaleSuppression() throws {
        let suite = "context-alert-tests-\(UUID())", defaults = try XCTUnwrap(UserDefaults(suiteName:suite))
        defer { defaults.removePersistentDomain(forName:suite) }
        let snapshot = try fixture(), model = UsagePanelModel(defaults:defaults)
        model.update(snapshot:snapshot,source:"a",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        model.updateContexts([.codex:ContextReading(sessionID:"main",usedTokens:70,limitTokens:100,recordedAt:Date())])
        XCTAssertNotNil(model.contextWarning)
        XCTAssertEqual(model.consumeContextAlerts().map(\.provider),[.codex])
        XCTAssertTrue(model.consumeContextAlerts().isEmpty)
        let restored = UsagePanelModel(defaults:defaults)
        restored.update(snapshot:snapshot,source:"a",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        restored.updateContexts(model.contextReadings)
        XCTAssertTrue(restored.consumeContextAlerts().isEmpty)
        model.setContextAlertThreshold(80)
        XCTAssertNil(model.contextWarning)
        XCTAssertEqual(UsagePanelModel(defaults:defaults).contextAlertThreshold,80)
        model.setContextAlertThreshold(0)
        XCTAssertEqual(model.contextAlertThreshold,80)
        model.setContextAlertThreshold(70)
        model.update(snapshot:snapshot,source:"a",isLoading:false,isStale:true,notice:nil,loginState:.notRegistered)
        XCTAssertNil(model.contextWarning)
        XCTAssertTrue(model.consumeContextAlerts().isEmpty)
    }
}
