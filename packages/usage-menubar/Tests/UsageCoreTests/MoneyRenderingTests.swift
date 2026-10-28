import XCTest
import AppKit
import SwiftUI
import Vision
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class MoneyRenderingTests: XCTestCase {
    func testCompactMoneyInEveryLanguageAndTheme() throws {
        _ = NSApplication.shared
        let rows = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../usage/tests/fixtures/money-presentation.json").standardized
        struct Row: Decodable { let name: String; let cost: UsageCost; let expected: String }
        let cases = try JSONDecoder().decode([Row].self, from: Data(contentsOf: rows))
        for language in AppLanguage.allCases {
            for row in cases.filter({ ["estimated", "partial", "unknown", "zero", "partial-zero", "partial-999999999.995"].contains($0.name) }) {
                let cost = try JSONSerialization.jsonObject(with: JSONEncoder().encode(row.cost))
                let snapshot = try fixture { object in
                    for key in ["today", "month"] {
                        var aggregate = object[key] as! [String: Any]; aggregate["cost"] = cost; object[key] = aggregate
                    }
                    var sessions = object["sessions"] as! [[String: Any]]
                    for index in sessions.indices { sessions[index]["cost"] = cost }
                    object["sessions"] = sessions
                    object.removeValue(forKey: "providerBreakdowns")
                }
                let model = UsagePanelModel(preferredLanguages: [language.rawValue])
                model.update(snapshot: snapshot, source: "synthetic-money-fixture", isLoading: false, isStale: true, notice: nil, loginState: .notRegistered)
                XCTAssertEqual(model.mainCost, row.expected)
                for (theme, scheme) in [("light", ColorScheme.light), ("dark", .dark)] {
                    let host = NSHostingView(rootView: UsagePopoverView(model: model).environment(\.colorScheme, scheme))
                    host.frame = NSRect(x: 0, y: 0, width: 360, height: model.panelHeight)
                    host.layoutSubtreeIfNeeded()
                    // Keep the raster independent of the attached display. Hosted macOS
                    // has a 1x backing scale; tiny label OCR otherwise differs from Retina.
                    let bitmap = try XCTUnwrap(NSBitmapImageRep(bitmapDataPlanes: nil,
                        pixelsWide: Int(host.bounds.width * 2), pixelsHigh: Int(host.bounds.height * 2),
                        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0))
                    bitmap.size = host.bounds.size
                    host.cacheDisplay(in: host.bounds, to: bitmap)
                    if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                        let url = URL(fileURLWithPath: directory)
                        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                        try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: url.appendingPathComponent("ns23-\(language.rawValue)-\(row.name)-\(theme).png"))
                    }
                    if language == .english && ["zero", "partial-zero", "partial-999999999.995"].contains(row.name) {
                        let request = VNRecognizeTextRequest()
                        request.recognitionLevel = .accurate
                        request.recognitionLanguages = ["en-US"]
                        try VNImageRequestHandler(cgImage: XCTUnwrap(bitmap.cgImage)).perform([request])
                        let observations = request.results?.map { $0.topCandidates(5).map(\.string) } ?? []
                        let text = observations.flatMap { $0 }
                        if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                            let evidence: [String: Any] = ["language": language.rawValue, "row": row.name, "theme": theme, "candidates": observations]
                            try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: directory).appendingPathComponent("ns23-\(language.rawValue)-\(row.name)-\(theme)-ocr.json"))
                        }
                        if row.name == "partial-999999999.995" {
                            XCTAssertEqual(observations.filter { $0.contains { $0.contains("1,000,000,000.") && !$0.contains("...") && !$0.contains("…") } }.count, 3, "All three money values must be visible: \(text)")
                        } else if row.name == "zero" {
                            XCTAssertFalse(text.contains { $0.contains("Partial pricing") }, "Absence control must not hallucinate a missing-price label [\(theme)]: \(text)")
                        } else {
                            XCTAssertTrue(text.contains { $0.contains("Partial pricing") }, "Zero known money still needs a missing-price label [\(language.rawValue)/\(row.name)/\(theme)]: \(text)")
                        }
                    }
                }
            }
        }
    }
}
