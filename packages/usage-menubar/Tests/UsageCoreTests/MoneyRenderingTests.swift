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
                        let nativeObservations = request.results ?? []
                        let observations = nativeObservations.map { $0.topCandidates(5).map(\.string) }
                        let text = observations.flatMap { $0 }
                        if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                            let evidence: [String: Any] = ["language": language.rawValue, "row": row.name, "theme": theme, "candidates": observations]
                            try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: directory).appendingPathComponent("ns23-\(language.rawValue)-\(row.name)-\(theme)-ocr.json"))
                        }
                        if row.name == "partial-999999999.995" {
                            XCTAssertEqual(observations.filter { $0.contains { $0.contains("1,000,000,000.") && !$0.contains("...") && !$0.contains("…") } }.count, 3, "All three money values must be visible: \(text)")
                        } else {
                            let visibleCaption = try pricingCaptionIsPainted(image: XCTUnwrap(bitmap.cgImage), observations: nativeObservations,
                                stem: "ns23-\(language.rawValue)-\(row.name)-\(theme)")
                            XCTAssertEqual(visibleCaption.anchorCount, row.name == "zero" ? 0 : 1,
                                "Actual priced-zero must omit the caption; partial zero needs one [\(language.rawValue)/\(row.name)/\(theme)]: \(text)")
                            if row.name != "zero" { XCTAssertTrue(visibleCaption.painted, "Caption glyphs must have in-bounds geometry and nonuniform composited paint") }
                        }
                    }
                }
            }
        }
    }
    func testExactPricingCaptionSemanticsInEveryLanguage() {
        let expected: [(AppLanguage, [String])] = [
            (.english, ["Estimated", "Partial pricing", "Unknown price"]),
            (.vietnamese, ["Ước tính", "Thiếu một phần giá", "Chưa biết giá"]),
            (.simplifiedChinese, ["估算值", "部分价格缺失", "价格未知"])
        ]
        for (language, labels) in expected {
            let model = UsagePanelModel(preferredLanguages: [language.rawValue])
            for (status, label) in zip(["estimated", "partial", "unknown"], labels) {
                XCTAssertEqual(model.pricingLabel(UsageCost(amountUSD: status == "estimated" ? 0 : nil,
                    knownCostUSD: 0, status: status)), label)
            }
        }
    }

    /// Exact strings belong to the semantic test above. The production view binds
    /// Text directly to pricingLabel. Here Vision locates an actual painted
    /// caption using the literal word `pricing`, without classifying its tiny
    /// first word or supplying expected text to the recognizer.
    private func pricingCaptionIsPainted(image: CGImage, observations: [VNRecognizedTextObservation], stem: String) throws -> (anchorCount: Int, painted: Bool) {
        let anchors = observations.filter { observation in
            observation.topCandidates(5).contains { candidate in
                candidate.string.lowercased().split(whereSeparator: { !$0.isLetter }).contains("pricing")
            }
        }
        var region: [CGFloat] = [], channelRange = 0
        var painted = false
        if anchors.count == 1, let anchor = anchors.first {
            let box = anchor.boundingBox
            let normalizedImage = CGRect(x: 0, y: 0, width: 1, height: 1)
            // Require the whole observed glyph rectangle to fit the render.
            if box.width > 0, box.height > 0, normalizedImage.contains(box) {
                let pixels = CGRect(x: box.minX * CGFloat(image.width), y: (1-box.maxY) * CGFloat(image.height),
                    width: box.width * CGFloat(image.width), height: box.height * CGFloat(image.height)).integral
                if CGRect(x: 0, y: 0, width: image.width, height: image.height).contains(pixels) {
                    let crop = try XCTUnwrap(image.cropping(to: pixels))
                    let bitmap = NSBitmapImageRep(cgImage: crop)
                    var minimum = [255, 255, 255], maximum = [0, 0, 0]
                    for y in 0..<bitmap.pixelsHigh {
                        for x in 0..<bitmap.pixelsWide {
                            let color = try XCTUnwrap(bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB))
                            // Actual composited RGB range, not an expected glyph
                            // template, recognizes painted ink on either theme.
                            for (index, channel) in [color.redComponent, color.greenComponent, color.blueComponent].enumerated() {
                                let value = Int((channel * 255).rounded())
                                minimum[index] = min(minimum[index], value); maximum[index] = max(maximum[index], value)
                            }
                        }
                    }
                    channelRange = zip(maximum, minimum).map { $0 - $1 }.max() ?? 0
                    painted = channelRange > 1
                    region = [pixels.minX, pixels.minY, pixels.width, pixels.height]
                    if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                        try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to:
                            URL(fileURLWithPath: directory).appendingPathComponent(stem + "-caption-paint.png"))
                    }
                }
            }
        }
        if let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
            let output = URL(fileURLWithPath: directory)
            try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
            let evidence: [String: Any] = ["anchorCount": anchors.count, "regionPixels": region,
                "compositedChannelRange": channelRange, "painted": painted,
                "fullViewCandidates": observations.map { $0.topCandidates(5).map(\.string) }]
            try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
                .write(to: output.appendingPathComponent(stem + "-caption-paint.json"))
        }
        return (anchors.count, painted)
    }
}
