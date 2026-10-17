import AppKit
import UsageCore
import Darwin

@main @MainActor struct Main {
    static func main() {
        let args = CommandLine.arguments
        if args.count == 3 && args[1] == "--no-short-usage-hook" {
            // Never write hook output: both hosts may inject stdout into model context.
            if let provider = UsageProvider(rawValue:args[2]) {
                var data = Data(), bytes = [UInt8](repeating:0,count:16_384)
                while data.count <= 8_388_608 {
                    let count = Darwin.read(STDIN_FILENO,&bytes,bytes.count)
                    if count <= 0 { break }; data.append(contentsOf:bytes.prefix(count))
                }
                if let event = SessionActivity.parse(data,provider:provider) { try? ActivityStore().append(event) }
            }
            return
        }
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
