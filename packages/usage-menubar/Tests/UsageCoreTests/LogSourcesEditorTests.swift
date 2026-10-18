import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class LogSourcesEditorTests: XCTestCase {
    func testDraftEditsValidateEachRowAndOnlySaveACompleteValidList() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let suite = "sources-editor-\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let a = root.appendingPathComponent("A"), b = root.appendingPathComponent("B"), bad = root.appendingPathComponent("missing")
        for url in [a,b] { try FileManager.default.createDirectory(at: url.appendingPathComponent("sessions"), withIntermediateDirectories: true) }
        let store = LogSourceStore(defaults: defaults, environment: [:], home: root)
        try store.choose(a)
        let saved = store.current
        let model = LogSourcesEditorModel(store: store, provider: .codex, language: .english)
        model.add([b,bad,a])
        XCTAssertEqual(model.urls.map(\.path), [a.path,b.path,bad.path])
        XCTAssertNotNil(model.errors[bad.path])
        XCTAssertNil(model.errors[a.path])
        XCTAssertEqual(store.current, saved, "Draft changes must not persist before Save")
        XCTAssertFalse(model.save())
        XCTAssertEqual(store.current, saved)
        model.remove(bad)
        XCTAssertTrue(model.save())
        XCTAssertEqual(store.current.rootsEnvironment, "\(a.path),\(b.path)")
        model.remove(a); model.remove(b)
        XCTAssertFalse(model.save())
        XCTAssertNotNil(model.notice)
        XCTAssertEqual(store.current.rootsEnvironment, "\(a.path),\(b.path)")
    }

    func testEditorRendersDraftRowsAndValidationGuidanceInAllLanguages() throws {
        _ = NSApplication.shared
        let suite = "sources-preview-\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = LogSourceStore(defaults: defaults, environment: ["CODEX_HOME":"/Example/Current Codex"], home: URL(fileURLWithPath: "/Example"))
        for language in AppLanguage.allCases {
            let model = LogSourcesEditorModel(store: store, provider: .codex, language: language)
            model.add([URL(fileURLWithPath: "/Example/Backup Codex")])
            XCTAssertEqual(model.errors.count, 2)
            let host = NSHostingView(rootView: LogSourcesEditorView(model: model, onAdd: {}).environment(\.colorScheme, .light))
            host.appearance = NSAppearance(named: .aqua)
            host.frame = NSRect(x: 0, y: 0, width: 520, height: 340)
            host.layoutSubtreeIfNeeded()
            let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
            host.cacheDisplay(in: host.bounds, to: bitmap)
            if let path = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                let directory = URL(fileURLWithPath: path)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: directory.appendingPathComponent("sources-\(language.rawValue).png"))
            }
        }
    }
}
