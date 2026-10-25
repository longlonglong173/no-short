import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class AppUpdatePresentationTests:XCTestCase {
    func testUnverifiedAndFailedChecksDoNotClaimCurrent() {
        let unknown=AppUpdatePresentation(installedVersion:"0.6.1")
        XCTAssertEqual(unknown.versionText,"v0.6.1")
        XCTAssertEqual(unknown.statusText(language:.english),"Updates not checked yet.")
        let failed=AppUpdatePresentation(installedVersion:"0.6.1",latestVersion:"0.6.1",state:.failed(.network),lastCheckedAt:Date(),canCheck:true)
        XCTAssertTrue(failed.statusText(language:.english).contains("Could not"))
        XCTAssertFalse(failed.statusText(language:.english).contains("No newer"))
    }
    func testNewerVersionRemainsActionableAfterProbeReturnsIdleAndNeverOffersDowngrade() {
        let newer=AppUpdatePresentation(installedVersion:"0.6.1",latestVersion:"0.6.2",lastCheckedAt:Date(),canCheck:true)
        XCTAssertTrue(newer.isOutdated);XCTAssertEqual(newer.statusText(language:.english),"New version available: 0.6.2")
        XCTAssertEqual(newer.actionTitle(language:.english),"Update…");XCTAssertTrue(newer.canCheck)
        for version in ["0.6.0","0.6.1","not-a-version"] {
            XCTAssertFalse(AppUpdatePresentation(installedVersion:"0.6.1",latestVersion:version).isOutdated)
        }
        let busy=AppUpdatePresentation(installedVersion:"0.6.1",latestVersion:"0.6.2",state:.installing,canCheck:false)
        XCTAssertFalse(busy.canCheck);XCTAssertFalse(busy.statusText(language:.english).contains("New version"))
    }
    func testUpdateRowRendersEveryLanguageThemeAndState() throws {
        _ = NSApplication.shared
        let examples:[(String,AppUpdatePresentation)]=[
            ("available",.init(installedVersion:"0.6.1",latestVersion:"0.6.2",lastCheckedAt:Date(timeIntervalSince1970:1_792_000_000),canCheck:true)),
            ("current",.init(installedVersion:"0.6.1",latestVersion:"0.6.1",state:.current,lastCheckedAt:Date(timeIntervalSince1970:1_792_000_000),canCheck:true)),
            ("error",.init(installedVersion:"0.6.1",state:.failed(.network),canCheck:true))]
        for language in AppLanguage.allCases { for (theme,scheme) in [("light",ColorScheme.light),("dark",.dark)] { for (name,presentation) in examples {
            let host=NSHostingView(rootView:AppUpdateStatusView(presentation:presentation,language:language,onCheck:{}).padding(16).background(scheme == .dark ? Color.black : Color.white).environment(\.colorScheme,scheme));host.frame=NSRect(x:0,y:0,width:400,height:160);host.layoutSubtreeIfNeeded()
            let bitmap=try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in:host.bounds));host.cacheDisplay(in:host.bounds,to:bitmap)
            XCTAssertGreaterThanOrEqual(bitmap.pixelsWide,400)
            if let dir=ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {let root=URL(fileURLWithPath:dir);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true);try XCTUnwrap(bitmap.representation(using:.png,properties:[:])).write(to:root.appendingPathComponent("update-\(language.rawValue)-\(theme)-\(name).png"))}
        } } }
    }
}
