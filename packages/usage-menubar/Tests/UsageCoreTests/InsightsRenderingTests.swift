import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class InsightsRenderingTests: XCTestCase {
    func testEnabledInsightsRenderInEveryLanguage() throws {
        for key in ["Chỉ thống kê log còn trên máy; không phải toàn bộ lịch sử tài khoản.", "Giá theo ccusage"] {
            for language in [AppLanguage.english, .simplifiedChinese] { XCTAssertNotEqual(AppLocalization(language: language).text(key), key) }
        }
        _ = NSApplication.shared
        let s = try insightsFixture(), result = UsageInsights.evaluate(s, provider: "all", now: s.generatedAt)
        for language in AppLanguage.allCases {
            let view = UsageInsightsView(value: result, snapshot: s, anomalyEnabled: true, scenarioEnabled: true, language: language)
            let host = NSHostingView(rootView: view.environment(\.colorScheme, .light).background(Color.white))
            host.appearance = NSAppearance(named: .aqua)
            host.frame = NSRect(x: 0, y: 0, width: 400, height: 660); host.layoutSubtreeIfNeeded()
            let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds)); host.cacheDisplay(in: host.bounds, to: bitmap)
            XCTAssertGreaterThanOrEqual(bitmap.pixelsWide, 400)
            if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                let url = URL(fileURLWithPath: directory); try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: url.appendingPathComponent("ns19-\(language.rawValue).png"))
            }
        }
    }
}
