import AppKit
import UsageCore
import Darwin

@main @MainActor struct Main {
    static func main() {
        let args = CommandLine.arguments
        if args.contains("--install-usage-hooks") || args.contains("--remove-usage-hooks") {
            let executable = URL(fileURLWithPath:CommandLine.arguments[0]).standardizedFileURL
            let installer = HookInstaller(executable:executable)
            do {
                for (config,provider) in HookInstaller.configurationFiles() {
                    if args.contains("--remove-usage-hooks") { try installer.remove(at:config) }
                    else { try installer.install(at:config,provider:provider) }
                }
                print("No Short Usage: hooks configured. Codex requires review/trust in /hooks; reopen Claude Code to load changes.")
            } catch { fputs("No Short Usage: hook configuration failed; existing settings were preserved.\n",stderr); exit(1) }
            return
        }
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
        if args.contains("--verify-resources") {
            guard StatusItemRenderer.hasProviderIcons else { fputs("No Short Usage: provider icons are missing or invalid.\n",stderr); exit(1) }
            print("Provider icons verified"); return
        }
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
