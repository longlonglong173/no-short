// Test-only host of the real History view. No reader, pricing, defaults, hooks or updater.
import AppKit
import SwiftUI
import UsageCore

@main @MainActor struct FixtureMain {
    static func main() throws {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        var object = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Tests/UsageCoreTests/Fixtures/snapshot-v1.json"))) as! [String: Any]
        func aggregate(_ status: String, _ amount: Double) -> [String: Any] {
            ["tokens": ["input": 10,"output": 0,"cacheRead": 0,"cacheWrite": 0,"total": 10], "cost": ["amountUSD": status == "estimated" ? amount as Any : NSNull(), "knownCostUSD": amount,"status": status], "models": []]
        }
        object["history"] = ["version": 1, "providers": ["codex", "claude"], "days": [
            ["date": "2026-10-14","provider":"codex","aggregate": aggregate("partial",12.34)],
            ["date": "2026-10-15","provider":"codex","aggregate": aggregate("unknown",0)],
            ["date": "2026-10-16","provider":"codex","aggregate": aggregate("estimated",0)],
            ["date": "2026-10-17","provider":"codex","aggregate": aggregate("estimated",5)],
            ["date": "2026-10-18","provider":"codex","aggregate": aggregate("partial",0)],
            ["date": "2026-10-14","provider":"claude","aggregate": aggregate("estimated",2)]
        ]]
        var history = object["history"] as! [String: Any]
        history["sessionDays"] = (history["days"] as! [[String: Any]]).map { day in
            var row = day
            row["sessionId"] = day["provider"] as? String == "claude" ? "ns22-claude" : "main"
            return row
        }
        object["history"] = history
        var sessions = object["sessions"] as! [[String: Any]]
        var claude = sessions.first { $0["id"] as? String == "main" }!
        claude["id"] = "ns22-claude"; claude["provider"] = "claude"; claude["title"] = "NS22 Claude fixture"
        sessions.append(claude); object["sessions"] = sessions
        let snapshot = try UsageSnapshot.decode(JSONSerialization.data(withJSONObject: object))
        let language: AppLanguage = CommandLine.arguments.contains("--vi") ? .vietnamese : CommandLine.arguments.contains("--zh") ? .simplifiedChinese : .english
        let model = UsageHistoryModel(provider: "codex", language: language, now: { Date(timeIntervalSince1970: 1_792_299_600) })
        model.update(snapshot: snapshot, source: "NS22 synthetic fixture", isLoading: false, isStale: false, notice: nil, language: language)
        model.onRefresh = { model.update(snapshot: snapshot, source: "NS22 synthetic fixture", isLoading: false, isStale: false, notice: nil, language: language) }
        let window = NSWindow(contentRect: NSRect(x: 50,y: 50,width: 960,height: 1000), styleMask: [.titled,.closable,.resizable],backing:.buffered,defer:false)
        window.title = "NS22 Chart Fixture — 0.7.0 local — " + language.rawValue
        window.contentView = NSHostingView(rootView: UsageHistoryView(model:model))
        window.makeKeyAndOrderFront(nil)
        app.activate()
        withExtendedLifetime((window,model)) { app.run() }
    }
}
