import Foundation
import XCTest
import SwiftUI
import AppKit
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class PricingSettingsTests: XCTestCase {
    func testEditorRendersCompactWithZeroAndInvalidRatesInThreeLanguages() throws {
        let dir = ProcessInfo.processInfo.environment["NO_SHORT_PRICING_RENDER_DIR"]
        _ = NSApplication.shared
        let output = dir.map { URL(fileURLWithPath: $0) } ?? FileManager.default.temporaryDirectory.appendingPathComponent("ns16-render-\(UUID())")
        if dir != nil { try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true) }
        for language in AppLanguage.allCases {
            let store = PricingConfigStore(url: output.appendingPathComponent("unused-\(language.rawValue).json"))
            let model = PricingSettingsModel(store: store, language: language)
            model.beginEditing(); model.addRow(); model.rows[0].model = "local-model"
            model.rows[0].input = "-1"; XCTAssertFalse(model.save())
            for (name, scheme) in [("light", ColorScheme.light), ("dark", .dark)] {
                let host = NSHostingView(rootView: PricingSettingsView(model: model).environment(\.colorScheme, scheme))
                host.frame = NSRect(x: 0, y: 0, width: 440, height: 650); host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                if dir != nil { try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: output.appendingPathComponent("pricing-\(language.rawValue)-\(name).png")) }
                XCTAssertGreaterThanOrEqual(bitmap.pixelsWide, 440)
            }
        }
    }

    func testCancelAndResetAreDraftOnlyUntilSave() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ns16-ui-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = PricingConfigStore(url: root.appendingPathComponent("pricing.json"))
        let rule = PriceOverride(provider: "claude", model: "local-model", input: 0, output: 0, cacheRead: 0, cacheWrite: 0)
        try store.save([rule])
        let model = PricingSettingsModel(store: store, language: .vietnamese)
        model.beginEditing()
        model.rows[0].input = "5"
        model.cancel()
        XCTAssertEqual(try store.load().overrides, [rule])
        model.resetAll()
        XCTAssertEqual(try store.load().overrides, [rule])
        XCTAssertTrue(model.save())
        XCTAssertTrue(try store.load().overrides.isEmpty)
    }
    func testInvalidSaveAndCorruptLoadAreVisibleAndDoNotOverwrite() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ns16-ui-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = PricingConfigStore(url: root.appendingPathComponent("pricing.json"))
        try Data("{".utf8).write(to: store.url)
        let model = PricingSettingsModel(store: store, language: .english)
        model.beginEditing()
        XCTAssertNotNil(model.errorKey); XCTAssertFalse(model.save())
        XCTAssertEqual(try String(contentsOf: store.url, encoding: .utf8), "{")
        model.resetAll(); model.addRow()
        model.rows[0].model = "m"; model.rows[0].input = "NaN"
        XCTAssertFalse(model.save()); XCTAssertNotNil(model.errorKey)
        model.rows[0].input = "0"
        XCTAssertTrue(model.save())
        XCTAssertEqual(try store.load().overrides.first?.input, 0)
    }
}
