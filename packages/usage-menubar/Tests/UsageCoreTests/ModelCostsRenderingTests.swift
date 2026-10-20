import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class ModelCostsRenderingTests: XCTestCase {
    func testModelDetailsRenderInAllLanguagesWithMixedPricesAllAndLongLists() throws {
        _ = NSApplication.shared
        for language in AppLanguage.allCases {
            for (name, scheme) in [("dashboard", ColorScheme.light), ("models", .light), ("models-dark", .dark), ("all-models", .light), ("empty-models", .light), ("long-models", .dark), ("missing-breakdowns", .light), ("missing-breakdowns-all", .dark)] {
                let model = UsagePanelModel(preferredLanguages: [language.rawValue])
                let snapshot: UsageSnapshot
                if name == "long-models" {
                    snapshot = try fixture { object in
                        var sessions = object["sessions"] as! [[String: Any]]
                        let session = sessions[2]
                        sessions[2]["models"] = (0..<40).map { index in
                            ["name": "provider/very-long-model-name-\(index)-上下文-🪷", "tokens": session["tokens"]!, "cost": session["cost"]!]
                        }
                        sessions[2]["tokens"] = ["input": 48_000, "output": 3_200, "cacheRead": 32_000, "cacheWrite": 0, "total": 83_200]
                        sessions[2]["cost"] = ["amountUSD": 94, "knownCostUSD": 94, "status": "estimated"]
                        object["sessions"] = sessions
                    }
                } else if name.hasPrefix("missing-breakdowns") {
                    snapshot = try modelCostsSnapshot { $0.removeValue(forKey: "providerBreakdowns") }
                } else if name == "empty-models" { snapshot = try fixture() }
                else { snapshot = try modelCostsSnapshot() }
                model.update(snapshot: snapshot, source: "synthetic-local-logs", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
                if name == "all-models" || name == "missing-breakdowns-all" { model.setProviderFilter("all") }
                let height = model.panelHeight
                if name != "dashboard" && !name.hasPrefix("missing-breakdowns") { model.showModelCosts() }
                XCTAssertEqual(model.panelHeight, height, "Details must fit the existing popover")
                let host = NSHostingView(rootView: UsagePopoverView(model: model).environment(\.colorScheme, scheme))
                host.frame = NSRect(x: 0, y: 0, width: 400, height: height)
                host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsWide, 400)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsHigh, Int(height))
                if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                    let url = URL(fileURLWithPath: directory)
                    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                    try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: url.appendingPathComponent("ns06-\(language.rawValue)-\(name).png"))
                }
            }
        }
    }
}
