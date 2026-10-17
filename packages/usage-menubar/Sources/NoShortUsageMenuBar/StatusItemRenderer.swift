import AppKit
import UsageCore

@MainActor enum StatusItemRenderer {
    private static let resources: Bundle? = {
        // SwiftPM 6.0's accessor looks beside the app rather than in its resources.
        // Packaged apps must use their own bundle, never the build-path fallback.
        if Bundle.main.bundleURL.pathExtension == "app" {
            guard let url = Bundle.main.resourceURL?.appendingPathComponent("NoShortUsageMenuBar_NoShortUsageMenuBar.bundle") else { return nil }
            return Bundle(url:url)
        }
        return Bundle.module
    }()
    private static let codex = load("codex"), claude = load("claude")
    static var hasProviderIcons: Bool { codex != nil && claude != nil }
    private static let combined: NSImage? = {
        guard let codex, let claude else { return nil }
        let image = NSImage(size:NSSize(width:36,height:16),flipped:false) { _ in
            codex.draw(in:NSRect(x:0,y:0,width:16,height:16))
            claude.draw(in:NSRect(x:20,y:0,width:16,height:16))
            return true
        }
        image.isTemplate = true
        return image
    }()

    private static func load(_ name:String) -> NSImage? {
        guard let url = resources?.url(forResource:name,withExtension:"pdf"), let image = NSImage(contentsOf:url) else { return nil }
        image.size = NSSize(width:16,height:16)
        image.isTemplate = true
        return image
    }

    static func apply(to button:NSStatusBarButton,model:UsagePanelModel) {
        let name:String
        switch model.providerFilter {
        case "all": button.image = combined; name = "Codex và Claude Code"
        case "claude": button.image = claude; name = UsageProvider.claude.title
        default: button.image = codex; name = UsageProvider.codex.title
        }
        // Keep the provider mark to the left of the amount.
        button.imagePosition = .imageLeft
        button.title = model.statusTitle
        button.setAccessibilityLabel("\(name) · No Short Usage")
        button.setAccessibilityValue(model.statusTitle)
    }
}
