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
                            let caption = try pricingCaption(image: XCTUnwrap(bitmap.cgImage), observations: nativeObservations,
                                stem: "ns23-\(language.rawValue)-\(row.name)-\(theme)")
                            if row.name == "zero" {
                                XCTAssertFalse(caption.contains { $0.contains("Partial pricing") }, "Actual priced-zero absence control must not hallucinate a missing-price label [\(theme)]: \(caption)")
                            } else {
                                XCTAssertTrue(caption.contains { $0.contains("Partial pricing") }, "Zero known money still needs an exactly recognized visible missing-price caption [\(language.rawValue)/\(row.name)/\(theme)]: \(caption); full view: \(text)")
                            }
                        }
                    }
                }
            }
        }
    }
    func testRetainedHostedCaptionsHaveExactDedicatedRecognition() throws {
        for theme in ["light", "dark"] {
            let path=URL(fileURLWithPath:#filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/money-caption-macos15-\(theme).png")
            let image=try XCTUnwrap(NSImage(contentsOf:path)?.cgImage(forProposedRect:nil,context:nil,hints:nil))
            let observations=try recognize(image)
            let caption=try pricingCaption(image:image,observations:observations,stem:"hosted-reference-\(theme)")
            XCTAssertTrue(caption.contains { $0.contains("Partial pricing") }, "Retained actual macOS15 caption must be visible and recognized exactly: \(caption)")
        }
    }

    private func recognize(_ image:CGImage) throws -> [VNRecognizedTextObservation] {
        let request=VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages=["en-US"]
        try VNImageRequestHandler(cgImage:image).perform([request])
        return request.results ?? []
    }

    /// The full view locates the actual caption; recognition then gets its own
    /// glyph-sized region rather than relying on the tiny text in a whole panel.
    /// No expected caption or spelling variants are supplied to Vision.
    private func pricingCaption(image:CGImage,observations:[VNRecognizedTextObservation],stem:String) throws -> [String] {
        let anchors=observations.filter { observation in
            observation.topCandidates(5).contains { candidate in
                candidate.string.lowercased().split(whereSeparator:{ !$0.isLetter }).contains("pricing")
            }
        }
        var caption:[String]=[],region:[CGFloat]=[]
        if anchors.count==1,let anchor=anchors.first {
            let box=anchor.boundingBox,padding=box.height/2
            let pixels=CGRect(x:(box.minX-padding)*CGFloat(image.width),y:(1-box.maxY-padding)*CGFloat(image.height),
                width:(box.width+2*padding)*CGFloat(image.width),height:(box.height+2*padding)*CGFloat(image.height))
                .integral.intersection(CGRect(x:0,y:0,width:image.width,height:image.height))
            region=[pixels.minX,pixels.minY,pixels.width,pixels.height]
            let crop=try XCTUnwrap(image.cropping(to:pixels))
            // One fixed transform, selected from retained light/dark failure
            // evidence. Never sweep scales until one happens to recognize text.
            let context=try XCTUnwrap(CGContext(data:nil,width:crop.width*4,height:crop.height*4,bitsPerComponent:8,bytesPerRow:0,
                space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue))
            context.interpolationQuality = .high
            context.draw(crop,in:CGRect(x:0,y:0,width:crop.width*4,height:crop.height*4))
            let enlarged=try XCTUnwrap(context.makeImage())
            caption=try recognize(enlarged).flatMap { $0.topCandidates(5).map(\.string) }
            if let directory=ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                let output=URL(fileURLWithPath:directory)
                try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
                try XCTUnwrap(NSBitmapImageRep(cgImage:enlarged).representation(using:.png,properties:[:])).write(to:output.appendingPathComponent(stem+"-caption.png"))
            }
        }
        if let directory=ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
            let output=URL(fileURLWithPath:directory)
            try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
            let evidence:[String:Any]=["anchorCount":anchors.count,"regionPixels":region,"fixedScale":4,
                "firstStageCandidates":observations.map { $0.topCandidates(5).map(\.string) },"captionCandidates":caption]
            try JSONSerialization.data(withJSONObject:evidence,options:[.prettyPrinted,.sortedKeys]).write(to:output.appendingPathComponent(stem+"-caption.json"))
        }
        return caption
    }

}
