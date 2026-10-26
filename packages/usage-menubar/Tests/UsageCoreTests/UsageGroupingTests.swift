import XCTest
@testable import UsageCore
@testable import NoShortUsageMenuBar

final class UsageGroupingTests: XCTestCase {
    func groupingFixture(_ edit: (inout [String:Any])->Void = {_ in}) throws -> UsageSnapshot {
        let path=URL(fileURLWithPath:#filePath).deletingLastPathComponent().appendingPathComponent("../../../usage/tests/fixtures/grouping-snapshot.json").standardizedFileURL
        var value=try JSONSerialization.jsonObject(with:Data(contentsOf:path)) as! [String:Any];edit(&value)
        return try UsageSnapshot.decode(JSONSerialization.data(withJSONObject:value))
    }
    func testProjectAndExplicitMultilevelWorkUseExactDayNotLifetimeUsage() throws {
        let s=try groupingFixture(),v=try XCTUnwrap(UsageGrouping.project(s,provider:"codex",range:.init(start:"2026-10-27",end:"2026-10-27")))
        XCTAssertTrue(v.reconciled);XCTAssertEqual(v.projects.count,2)
        XCTAssertEqual(v.projects.first{$0.id=="unknown"}?.aggregate.tokens.total,3)
        let root=try XCTUnwrap(v.works.first{$0.id=="rollout-root"})
        XCTAssertEqual(root.aggregate.tokens.total,9);XCTAssertEqual(root.aggregate.cost.status,"partial")
        XCTAssertEqual(root.sessions.map(\.depth),[0,1,2]);XCTAssertEqual(root.sessions.map{$0.aggregate.tokens.total},[3,3,3])
    }
    func testCyclesSelfAndOrphanRemainSeparateAndNoProviderJoin() throws {
        let s=try groupingFixture { value in
            var sessions=value["sessions"] as! [[String:Any]]
            for (index,parent) in [(0,"child"),(1,"root"),(2,"grandchild"),(4,"missing")] {
                var grouping=sessions[index]["grouping"] as! [String:Any];grouping["parent"]=["sessionKey":parent,"source":"codex-session-meta"];sessions[index]["grouping"]=grouping
            };value["sessions"]=sessions
        }
        let v=try XCTUnwrap(UsageGrouping.project(s,provider:"all",range:.init(start:"2026-10-27",end:"2026-10-27")))
        XCTAssertEqual(v.works.count,5);XCTAssertEqual(v.works.reduce(0){$0+$1.aggregate.tokens.total},15)
        XCTAssertTrue(v.works.filter{$0.id != "rollout-unknown"}.allSatisfy{!$0.issues.isEmpty})
    }
    func testInvalidOptionalMetadataKeepsLegacyDashboardAndLedgerAbsenceUnavailable() throws {
        let s=try groupingFixture {value in var sessions=value["sessions"] as! [[String:Any]];sessions[0]["grouping"]=["project":["id":"bad","label":"/private/path"]];value["sessions"]=sessions}
        XCTAssertNil(s.sessions[0].grouping)
        let old=try groupingFixture {value in var h=value["history"] as! [String:Any];h.removeValue(forKey:"sessionDays");value["history"]=h}
        XCTAssertNil(UsageGrouping.project(old,provider:"all",range:.init(start:"2026-10-27",end:"2026-10-27")))
    }
    func testGroupedExportKeepsIdentifierOptInAndRangeFilter() throws {
        let s=try groupingFixture()
        let document=try XCTUnwrap(UsageExport.create(s,provider:"codex",start:"2026-10-27",end:"2026-10-27",groupBy:"work"))
        let json=try document.serialize(.json)
        XCTAssertTrue(json.contains("grouping"));XCTAssertFalse(json.contains("Private"));XCTAssertFalse(json.contains("rollout-root"));XCTAssertFalse(json.contains("999"))
        let optIn=try XCTUnwrap(UsageExport.create(s,provider:"codex",start:"2026-10-27",end:"2026-10-27",includeSessionIdentifiers:true,groupBy:"work"))
        XCTAssertTrue(try optIn.serialize(.json).contains("rollout-root"))
        XCTAssertTrue(try optIn.serialize(.csv).contains("selected-range-direct"))
    }
    func testGroupedCSVDefusesProjectLabelsAndSessionTitlesIncludingBOM() throws {
        for prefix in ["=","+","-","@","  =","\u{feff}="] {
            let snapshot=try groupingFixture { value in
                var sessions=value["sessions"] as! [[String:Any]]
                for index in sessions.indices {
                    sessions[index]["title"]=prefix+"PRIVATE"
                    if var grouping=sessions[index]["grouping"] as? [String:Any], var project=grouping["project"] as? [String:Any] {
                        project["label"]=prefix+"PROJECT";grouping["project"]=project;sessions[index]["grouping"]=grouping
                    }
                };value["sessions"]=sessions
            }
            let doc=try XCTUnwrap(UsageExport.create(snapshot,provider:"codex",start:"2026-10-27",end:"2026-10-27",includeSessionIdentifiers:true,groupBy:"project"))
            let csv=try doc.serialize(.csv)
            XCTAssertTrue(csv.contains("\"'"+prefix+"PROJECT\""));XCTAssertTrue(csv.contains("\"'"+prefix+"PRIVATE\""))
        }
    }
    @MainActor func testNativeHistoryModelGroupingAndExportFollowProviderAndRange() throws {
        let snapshot=try groupingFixture(),model=UsageHistoryModel(provider:"codex",language:.english,now:{snapshot.generatedAt})
        model.update(snapshot:snapshot,source:"synthetic",isLoading:false,isStale:false,notice:nil,language:.english)
        XCTAssertEqual(model.groupBy,"none");model.groupBy="work"
        XCTAssertTrue(model.applyCustom(start:"2026-10-27",end:"2026-10-27"))
        XCTAssertEqual(model.grouping?.aggregate.tokens.total,12)
        var payload=try model.prepareExport(.json,includeSessionIdentifiers:false)
        XCTAssertFalse(String(decoding:payload.data,as:UTF8.self).contains("Private"))
        model.setProvider("claude");XCTAssertEqual(model.grouping?.aggregate.tokens.total,3)
        payload=try model.prepareExport(.json,includeSessionIdentifiers:false)
        let value=try JSONSerialization.jsonObject(with:payload.data) as! [String:Any]
        XCTAssertEqual(value["provider"] as? String,"claude")
    }

}
