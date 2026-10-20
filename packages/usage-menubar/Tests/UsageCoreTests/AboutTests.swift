import XCTest
import AppKit
import SwiftUI
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class AboutTests: XCTestCase {
    func testOpeningAboutAndChangingLanguageDoesNotCheck() async {
        _ = NSApplication.shared
        let stub = AboutReleaseStub()
        let about = AboutModel(info: AppBuildInfo(version: "0.4.2", build: "42"), language: .english, client: stub)
        let window = AboutWindowController(model: about)
        window.present()
        defer { window.close() }
        about.language = .simplifiedChinese
        await Task.yield()
        let calls = await stub.calls
        XCTAssertEqual(calls, 0)
        XCTAssertEqual(about.state, .idle)
    }
    func testVersionAndBuildComeFromTheRunningBundleNotReleaseConstants() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathExtension("app")
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root.appendingPathComponent("Contents"), withIntermediateDirectories: true)
        let plist = ["CFBundleIdentifier": "test.ns04.\(UUID().uuidString)", "CFBundleShortVersionString": "1.2.3", "CFBundleVersion": "987"]
        try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0).write(to: root.appendingPathComponent("Contents/Info.plist"))
        let info = AppBuildInfo(bundle: try XCTUnwrap(Bundle(url: root)))
        XCTAssertEqual(info.version, "1.2.3"); XCTAssertEqual(info.build, "987")
        let about = AboutModel(info: info, language: .english, client: AboutReleaseStub())
        XCTAssertEqual(about.versionText, "Version: 1.2.3")
        XCTAssertEqual(about.buildText, "Build: 987")
        XCTAssertEqual(about.releaseNotesURL.absoluteString, "https://github.com/longlonglong173/no-short/releases/tag/v1.2.3")
        XCTAssertEqual(about.state, .idle)
    }
    func testUpdateStatesNeverOverwriteUsageLoadingOrWarnings() async throws {
        let usage = UsagePanelModel(preferredLanguages: ["en"])
        usage.update(snapshot: try fixture(), source: "a", isLoading: true, isStale: true, notice: "read failure", loginState: .notRegistered)
        usage.connectionNotice = "connection status"
        let stub = AboutReleaseStub()
        let about = AboutModel(info: AppBuildInfo(version: "0.4.2", build: "42"), language: .english, client: stub)
        var states: [ManualUpdateState] = []
        about.onChange = { states.append(about.state) }
        await about.check()
        XCTAssertEqual(states.first, .checking)
        XCTAssertEqual(about.statusText, "New version available: v0.4.3")
        XCTAssertEqual(about.releaseNotesURL.absoluteString, "https://github.com/longlonglong173/no-short/releases/tag/v0.4.3")
        await stub.failNext()
        await about.check()
        XCTAssertEqual(about.state, .failed(.network))
        XCTAssertTrue(usage.isLoading); XCTAssertTrue(usage.isStale)
        XCTAssertEqual(usage.notice, "read failure"); XCTAssertEqual(usage.connectionNotice, "connection status")
        XCTAssertEqual(UsagePopoverView(model: usage).warning, "read failure")
        usage.update(snapshot: nil, source: "a", isLoading: false, isStale: false, notice: nil, loginState: .notRegistered)
        XCTAssertEqual(about.state, .failed(.network))
    }
    func testRightClickActionsAndUpdateLoadingAreIndependent() throws {
        _ = NSApplication.shared
        let menu = MenuBuilder(), snapshot = try fixture()
        let presentation = UsagePresentation.make(snapshot: snapshot, stale: true, loading: true, now: snapshot.generatedAt)
        var actions: [String] = []
        menu.onAbout = { actions.append("about") }; menu.onCheckUpdates = { actions.append("check") }; menu.onReleaseNotes = { actions.append("notes") }
        menu.update(presentation: presentation, source: LogSource(rootsEnvironment: "/tmp/logs"), isLoading: true, notice: "read failure", loginState: .notRegistered, snapshot: snapshot, language: .english)
        menu.updateReleaseState(.idle, language: .english)
        for title in ["About No Short Usage…", "Check for Updates…", "Release Notes…"] {
            let index = menu.menu.indexOfItem(withTitle: title)
            XCTAssertGreaterThanOrEqual(index, 0)
            if index >= 0 { menu.menu.performActionForItem(at: index) }
        }
        XCTAssertEqual(actions, ["about", "check", "notes"])
        menu.updateReleaseState(.checking, language: .english)
        XCTAssertEqual(menu.menu.item(withTitle: "Checking for updates…")?.isEnabled, false)
        XCTAssertEqual(menu.menu.item(withTitle: "Updating…")?.isEnabled, false)
        XCTAssertNotNil(menu.menu.item(withTitle: "read failure"))
        menu.updateReleaseState(.failed(.network), language: .english)
        XCTAssertEqual(menu.menu.item(withTitle: "Check for Updates…")?.isEnabled, true)
        XCTAssertNotNil(menu.menu.item(withTitle: "read failure"))
    }
    func testAboutRendersAllStatesInThreeLanguagesWithoutStartingRequests() throws {
        _ = NSApplication.shared
        let release = GitHubRelease(tag: "v0.4.3", notesURL: URL(string: "https://github.com/longlonglong173/no-short/releases/tag/v0.4.3")!)
        let states: [ManualUpdateState] = [.idle, .checking, .available(release), .current(release), .failed(.network), .failed(.http(403)), .failed(.malformed), .failed(.invalidInstalledVersion)]
        for language in AppLanguage.allCases {
            let about = AboutModel(info: AppBuildInfo(version: "0.4.2", build: "42"), language: language, client: AboutReleaseStub())
            XCTAssertEqual(about.state, .idle)
            for (index, state) in states.enumerated() {
                let host = NSHostingView(rootView: AboutView(model: about, state: state, onCheck: {}).environment(\.colorScheme, .light))
                host.appearance = NSAppearance(named: .aqua)
                host.frame = NSRect(x: 0, y: 0, width: 460, height: 460); host.layoutSubtreeIfNeeded()
                let bitmap = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds))
                host.cacheDisplay(in: host.bounds, to: bitmap)
                XCTAssertGreaterThanOrEqual(bitmap.pixelsHigh, 460)
                let status = state.localizedDescription(language: language)
                XCTAssertFalse(status.isEmpty)
                if language != .vietnamese { XCTAssertNotEqual(status, state.localizedDescription(language: .vietnamese)) }
                if let dir = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] {
                    let url = URL(fileURLWithPath: dir)
                    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                    try XCTUnwrap(bitmap.representation(using: .png, properties: [:])).write(to: url.appendingPathComponent("about-\(language.rawValue)-\(index).png"))
                }
            }
        }
        let about = AboutModel(info: AppBuildInfo(version: nil, build: nil), language: .english, client: AboutReleaseStub())
        XCTAssertEqual(about.versionText, "Version: Unavailable")
        XCTAssertEqual(about.releaseNotesURL, GitHubReleaseClient.releasesURL)
        let window = AboutWindowController(model: about)
        XCTAssertNotNil(window.window?.contentViewController as? NSHostingController<AboutWindowView>)
        XCTAssertEqual(window.window?.isReleasedWhenClosed, false)
    }
}

private actor AboutReleaseStub: LatestReleaseLoading {
    private var shouldFail = false
    private(set) var calls = 0
    func failNext() { shouldFail = true }
    func fetchLatest() async throws -> GitHubRelease {
        calls += 1
        if shouldFail { throw UpdateCheckError.network }
        return GitHubRelease(tag: "v0.4.3", notesURL: URL(string: "https://github.com/longlonglong173/no-short/releases/tag/v0.4.3")!)
    }
}
