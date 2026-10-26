import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class UsageGroupingRenderTests: XCTestCase {
    func testMemberRowsRenderAllLanguagesThemesAndDepths() throws {
        _ = NSApplication.shared
        let url=URL(fileURLWithPath:#filePath).deletingLastPathComponent().appendingPathComponent("../../../usage/tests/fixtures/grouping-snapshot.json").standardized
        let snapshot=try UsageSnapshot.decode(Data(contentsOf:url))
        let value=try XCTUnwrap(UsageGrouping.project(snapshot,provider:"all",range:.init(start:"2026-10-27",end:"2026-10-27")))
        var rows=value.works.flatMap(\.sessions)
        let aggregate=try XCTUnwrap(rows.first?.aggregate)
        rows.append(.init(id:"deep-fixture",title:"Phiên chưa xác định",provider:.codex,kind:"unknown",depth:12,aggregate:aggregate))
        for language in AppLanguage.allCases { for width in [360,640] { for (theme,scheme) in [("light",ColorScheme.light),("dark",.dark)] {
            let content=UsageGroupingMembers(rows:rows,language:language)
                .textSelection(.enabled).padding(16)
                .frame(width:CGFloat(width),alignment:.topLeading)
                .background(scheme == .dark ? Color.black : Color.white)
                .environment(\.colorScheme,scheme).environment(\.locale,language.locale)
            let host=NSHostingView(rootView:content)
            host.appearance=NSAppearance(named:scheme == .dark ? .darkAqua : .aqua)
            host.frame=NSRect(x:0,y:0,width:width,height:800);host.layoutSubtreeIfNeeded()
            let bitmap=try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in:host.bounds))
            host.cacheDisplay(in:host.bounds,to:bitmap)
            XCTAssertGreaterThanOrEqual(bitmap.pixelsWide,width);XCTAssertGreaterThanOrEqual(bitmap.pixelsHigh,800)
            let png=try XCTUnwrap(bitmap.representation(using:.png,properties:[:]))
            let filename="ns13-members-\(language.rawValue)-\(width)-\(theme).png"
            if let baseline=ProcessInfo.processInfo.environment["NO_SHORT_RENDER_BASELINE_DIR"] {
                let original=URL(fileURLWithPath:baseline).appendingPathComponent(filename)
                XCTAssertEqual(png,try Data(contentsOf:original),filename)
            }
            if let dir=ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                let root=URL(fileURLWithPath:dir);try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
                try png.write(to:root.appendingPathComponent(filename))
            }
        } } }
    }
}
