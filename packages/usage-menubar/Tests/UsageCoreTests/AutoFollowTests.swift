import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class AutoFollowTests: XCTestCase {
    let now = Date(timeIntervalSince1970:1_792_299_600)
    func event(_ provider:UsageProvider, _ id:String, _ name:String = "UserPromptSubmit", turn:String = "t1", offset:Double = 0) throws -> SessionActivity {
        try XCTUnwrap(SessionActivity.parse(JSONSerialization.data(withJSONObject:["session_id":id,"hook_event_name":name,"turn_id":turn]),provider:provider,now:now.addingTimeInterval(offset)))
    }
    func model() throws -> UsagePanelModel {
        let model = UsagePanelModel()
        let snapshot = try fixture { o in
            var sessions = o["sessions"] as! [[String:Any]]
            sessions[2]["provider"] = "codex"; sessions[2]["sessionKey"] = "same"
            var claude = sessions[2]; claude["id"] = "claude:same"; claude["provider"] = "claude"; claude["sessionKey"] = "same"; claude["title"] = "Phiên Claude"
            claude["cost"] = ["amountUSD":1.25,"knownCostUSD":1.25,"status":"estimated"]
            sessions.append(claude); o["sessions"] = sessions
        }
        model.update(snapshot:snapshot,source:"a",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        return model
    }
    func testSubmissionFollowsCorrectProviderAndNewUnpricedSessionNeverBorrowsCost() throws {
        let model = try model()
        model.applyActivities([try event(.claude,"same")],now:now)
        XCTAssertEqual(model.providerFilter,"claude"); XCTAssertEqual(model.mainCost,"$1.25")
        XCTAssertEqual(model.selectedSession?.id,"claude:same")
        model.applyActivities([try event(.codex,"new-session",offset:1)],now:now.addingTimeInterval(1))
        XCTAssertNil(model.selectedSession); XCTAssertEqual(model.mainCost,"—")
        XCTAssertTrue(model.waitingForUsage); XCTAssertTrue(model.activityLabel.contains("Đang xử lý"))
    }
    func testPinSurvivesOtherChatsAndSessionStartDoesNotStealSelection() throws {
        let model = try model()
        model.chooseSession("main")
        model.applyActivities([try event(.claude,"same"),try event(.codex,"new-session","SessionStart",offset:1)],now:now.addingTimeInterval(1))
        XCTAssertEqual(model.selectedSession?.id,"main"); XCTAssertEqual(model.mainCost,"$2.35")
        model.chooseSession(nil)
        XCTAssertEqual(model.selectedSession?.id,"claude:same")
    }
    func testLateStopFromAnotherChatOrTurnCannotEndTheCurrentTurn() throws {
        let model = try model()
        let submitted = try event(.claude,"same",turn:"new",offset:1)
        model.applyActivities([submitted,try event(.codex,"same","Stop",offset:2),try event(.claude,"same","Stop",turn:"old",offset:3)],now:now.addingTimeInterval(3))
        XCTAssertTrue(model.activityLabel.contains("Đang xử lý"))
        model.applyActivities([submitted,try event(.claude,"same","Stop",turn:"new",offset:4)],now:now.addingTimeInterval(4))
        XCTAssertFalse(model.activityLabel.contains("Đang xử lý"))
        model.applyActivities([try event(.codex,"stale",offset:-90_000)],now:now)
        XCTAssertNotEqual(model.selectionLabel,"stale")
    }
    func testSavedPinAndProviderRestoreWithoutDependingOnEventAvailability() throws {
        let suite = "no-short-auto-test-" + UUID().uuidString, defaults = UserDefaults(suiteName:suite)!
        defer { defaults.removePersistentDomain(forName:suite) }
        let first = UsagePanelModel(defaults:defaults)
        first.setProviderFilter("claude"); first.chooseSession("claude:retained")
        let second = UsagePanelModel(defaults:defaults)
        XCTAssertEqual(second.providerFilter,"claude"); XCTAssertEqual(second.selectedSessionID,"claude:retained")
    }
    func testAllViewUsesAggregateInsteadOfClaimingOneSessionsCostIsTheTotal() throws {
        let model = try model()
        model.setProviderFilter("all")
        XCTAssertEqual(model.mainCost,model.todayCost)
        XCTAssertNil(model.selectedSession)
    }
    func testRestartPreservesManualFilterUntilAnotherPromptIsSubmitted() throws {
        let suite = "no-short-filter-test-" + UUID().uuidString, defaults = UserDefaults(suiteName:suite)!
        defer { defaults.removePersistentDomain(forName:suite) }
        let past = try event(.claude,"same")
        let first = UsagePanelModel(defaults:defaults)
        first.applyActivities([past],now:now)
        first.setProviderFilter("all")
        let reopened = UsagePanelModel(defaults:defaults)
        reopened.applyActivities([past],now:now.addingTimeInterval(1))
        XCTAssertEqual(reopened.providerFilter,"all")
        reopened.applyActivities([past,try event(.codex,"next",offset:2)],now:now.addingTimeInterval(2))
        XCTAssertEqual(reopened.providerFilter,"codex")
    }
}
