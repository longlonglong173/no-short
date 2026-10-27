import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class DataManagementUITests: XCTestCase {
    func testRuntimeMaintenanceFenceNoticeIsLocalizedInEveryLanguage() throws {
        let key = "Cache đang được bảo trì. Chờ một lúc rồi thử lại."
        for (language, expected) in [(AppLanguage.vietnamese, key),
            (.english, "Cache maintenance is in progress. Wait a moment, then retry."),
            (.simplifiedChinese, "缓存正在维护。请稍候再试。")] {
            let panel = UsagePanelModel(preferredLanguages: [language.rawValue])
            panel.update(snapshot: try fixture(), source: "synthetic", isLoading: false, isStale: true,
                notice: key, loginState: .notRegistered)
            XCTAssertEqual(UsagePopoverView(model: panel).warning, expected)
        }
    }
    func testDataManagementMenuEntryIsActionableInEveryLanguage() throws {
        _ = NSApplication.shared
        let menu = MenuBuilder(), snapshot = try fixture()
        for (language, title) in [(AppLanguage.english, "Data Management…"), (.vietnamese, "Quản lý dữ liệu…"), (.simplifiedChinese, "数据管理…")] {
            menu.update(presentation: UsagePresentation.make(snapshot: snapshot, stale: false, loading: false, now: fixtureNow),
                source: LogSource(rootsEnvironment: "/tmp/synthetic"), isLoading: false, notice: nil, loginState: .notRegistered, snapshot: snapshot, language: language)
            XCTAssertNotNil(menu.menu.item(withTitle: title)?.action)
        }
    }
}

extension DataManagementUITests {
    func testCancelDoesNotClearAndConfirmedClearReportsCountsWithoutReplacingUsageError() async throws {
        var clears = 0, confirmations = 0
        let panel = UsagePanelModel(preferredLanguages: ["en"])
        panel.update(snapshot: try fixture(), source: "synthetic", isLoading: false, isStale: true, notice: "read failure", loginState: .notRegistered)
        let model = DataManagementModel(language: .english, environment: [:], onClear: {
            clears += 1
            return CacheClearResult(removedFiles: 4, retainedEntries: 2)
        })
        model.onConfirm = { confirmations += 1 }
        model.requestClear(); model.requestClear()
        XCTAssertEqual(confirmations, 1)
        await model.clear(confirmed: false)
        XCTAssertEqual(clears, 0); XCTAssertFalse(model.isConfirming)
        model.requestClear(); await model.clear(confirmed: true)
        XCTAssertEqual(clears, 1); XCTAssertFalse(model.isBusy)
        XCTAssertEqual(model.statusText, "Removed 4 generated files; retained 2 other entries.")
        XCTAssertEqual(UsagePopoverView(model: panel).warning, "read failure")
        model.language = .simplifiedChinese
        XCTAssertEqual(model.statusText, "已删除 4 个生成文件；保留 2 个其他项目。")
    }
    func testConcurrentClearIsBlockedUntilInjectedOperationCompletes() async {
        var completion: CheckedContinuation<CacheClearResult, Never>?, clears = 0
        let model = DataManagementModel(language: .english, environment: [:], onClear: {
            clears += 1
            return await withCheckedContinuation { completion = $0 }
        })
        model.requestClear()
        let first = Task { await model.clear(confirmed: true) }
        while completion == nil { await Task.yield() }
        XCTAssertTrue(model.isBusy)
        model.requestClear(); await model.clear(confirmed: true)
        XCTAssertEqual(clears, 1); XCTAssertFalse(model.isConfirming)
        completion?.resume(returning: CacheClearResult(removedFiles: 1, retainedEntries: 0))
        await first.value
        XCTAssertFalse(model.isBusy)
    }
    func testCustomCacheDirectoryIsRejectedWithoutCallingClear() async {
        var clears = 0
        let model = DataManagementModel(language: .english, environment: ["NO_SHORT_USAGE_CACHE_DIR": "/tmp/do-not-delete"], onClear: {
            clears += 1
            return CacheClearResult(removedFiles: 99, retainedEntries: 0)
        })
        model.requestClear(); await model.clear(confirmed: true)
        XCTAssertEqual(clears, 0); XCTAssertFalse(model.isBusy)
        XCTAssertEqual(model.statusText, "Custom NO_SHORT_USAGE_CACHE_DIR is not supported here. Relaunch without that override to manage the default cache.")
    }
    func testMaintenanceErrorsAreActionableAndLocalizedWithoutLeakingPaths() async {
        let cases: [(Error, String)] = [
            (CacheMaintenanceError.busy, "Cache is busy. Close older Usage plugins, wait for readers to finish, then try again."),
            (CacheMaintenanceError.unsafePath, "Unsafe cache path or symbolic link. No source logs or settings were changed; check the default cache location."),
            (CacheMaintenanceError.protectedSource, "Cache overlaps a protected log source. Choose a separate log source before clearing."),
            (CacheMaintenanceError.cancelled, "Cache clearing was cancelled. Some generated files may already have been removed; source logs remain intact."),
            (CocoaError(.fileWriteNoPermission), "Could not clear all generated cache files. Check folder permissions and try again; source logs and settings were not changed.")
        ]
        for (error, expected) in cases {
            let model = DataManagementModel(language: .english, environment: [:], onClear: { throw error })
            model.requestClear(); await model.clear(confirmed: true)
            XCTAssertEqual(model.statusText, expected); XCTAssertFalse(model.isBusy)
            model.language = .simplifiedChinese
            XCTAssertNotEqual(model.statusText, expected)
        }
    }
    func testProtectedRootsIncludeEveryConfiguredAndDefaultProviderRoot() {
        let roots = DataManagementModel.protectedRoots(source: LogSource(rootsEnvironment: " /tmp/codex-a, /tmp/codex-b ", claudeRootsEnvironment: "/tmp/claude"), home: URL(fileURLWithPath: "/tmp/home"))
        XCTAssertEqual(Set(roots.map(\.path)), Set(["/tmp/codex-a", "/tmp/codex-b", "/tmp/claude", "/tmp/home/.codex", "/tmp/home/.claude", "/tmp/home/.config/claude"]))
    }
    func testRetainedWindowAndGuidanceRenderInThreeLanguagesWithoutClearing() throws {
        _ = NSApplication.shared
        var clears = 0
        for language in AppLanguage.allCases {
            let model = DataManagementModel(language: language, environment: [:], onClear: {
                clears += 1; return CacheClearResult(removedFiles: 0, retainedEntries: 0)
            })
            let controller = DataManagementWindowController(model: model)
            XCTAssertFalse(try XCTUnwrap(controller.window).isReleasedWhenClosed)
            for scheme in [ColorScheme.light, .dark] {
                let host = NSHostingView(rootView: DataManagementView(model: model).environment(\.colorScheme, scheme))
                host.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
                host.frame = NSRect(x: 0, y: 0, width: 620, height: 680); host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsHigh, 680)
                if let dir = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
                    try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: URL(fileURLWithPath: dir).appendingPathComponent("ns12-\(language.rawValue)-\(scheme == .dark ? "dark" : "light").png"))
                }
            }
            controller.close()
        }
        XCTAssertEqual(clears, 0)
    }
}
