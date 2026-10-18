import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

/// Marketing previews use synthetic data, never local account logs or session titles.
@MainActor final class WebsitePreviewRenderingTests: XCTestCase {
    func testWebsitePreviewsForEveryLanguageAndTheme() throws {
        _ = NSApplication.shared
        for language in AppLanguage.allCases {
            let title: String
            switch language {
            case .english: title = "Sample session"
            case .vietnamese: title = "Phiên minh họa"
            case .simplifiedChinese: title = "示例会话"
            }
            let snapshot = try fixture { object in
                var sessions = object["sessions"] as! [[String: Any]]
                sessions = sessions.filter { $0["id"] as? String == "main" }
                sessions[0]["title"] = title
                object["sessions"] = sessions
                object["chart"] = (12...18).enumerated().map { index, day in
                    let amount = [0.8, 1.3, 0.6, 1.1, 2.7, 1.2, 2.35][index]
                    return ["date": "2026-10-\(day)", "cost": ["amountUSD": amount, "knownCostUSD": amount, "status": "estimated"]]
                }
                var month = object["month"] as! [String: Any]
                month["cost"] = ["amountUSD": 10.05, "knownCostUSD": 10.05, "status": "estimated"]
                object["month"] = month
            }
            let model = UsagePanelModel(preferredLanguages: [language.rawValue])
            model.update(snapshot: snapshot, source: "Demo", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
            model.chooseSession("main")
            model.updateContexts([.codex: ContextReading(sessionID: "main", usedTokens: 74_000, limitTokens: 100_000, recordedAt: snapshot.generatedAt)])
            XCTAssertEqual(model.selectionLabel, title)
            XCTAssertEqual(model.mainCost, "$2.35")
            XCTAssertNotNil(model.contextWarning)
            for (theme, scheme) in [("light", ColorScheme.light), ("dark", .dark)] {
                let host = NSHostingView(rootView: UsagePopoverView(model: model).environment(\.colorScheme, scheme))
                host.appearance = NSAppearance(named: theme == "dark" ? .darkAqua : .aqua)
                host.frame = NSRect(x: 0, y: 0, width: 400, height: model.panelHeight)
                host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsWide, 400)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsHigh, Int(model.panelHeight))
                if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                    let folder = URL(fileURLWithPath: directory)
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    let png = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]))
                    try png.write(to: folder.appendingPathComponent("popover-\(language.rawValue)-\(theme).png"))
                }
            }
        }
    }
}
