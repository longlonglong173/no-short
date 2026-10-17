import AppKit
import UsageCore

@main @MainActor struct Main {
    static func main() {
        let args = CommandLine.arguments
        if args.count == 3 && args[1] == "--snapshot-worker" { runSnapshotWorker(helper: args[2]) }
        if args.contains("--version") { print("No Short Usage Menu Bar \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "development")"); return }
        if let identifier = Bundle.main.bundleIdentifier,
           let existing = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            existing.activate(options: []); return
        }
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let delegate = AppDelegate(); app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
