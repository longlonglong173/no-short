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
    private static func load(_ name:String) -> NSImage? {
        guard let url = resources?.url(forResource:name,withExtension:"pdf"), let image = NSImage(contentsOf:url) else { return nil }
        image.size = NSSize(width:16,height:16)
        image.isTemplate = true
        return image
    }

    static func image(provider:UsageProvider,reading:ContextReading?,threshold:Int = 70,forceColor:Bool = false) -> NSImage? {
        guard let logo = provider == .codex ? codex : claude else { return nil }
        let warning = reading.map { $0.fraction * 100 >= Double(threshold) } ?? false
        let colored = warning || forceColor
        let result = NSImage(size:NSSize(width:22,height:22),flipped:false) { _ in
            let track = NSBezierPath(ovalIn:NSRect(x:1.5,y:1.5,width:19,height:19))
            track.lineWidth = 1.5
            if reading == nil { track.setLineDash([1.6,2.1],count:2,phase:0) }
            let color: NSColor = warning ? .systemRed : colored ? .labelColor : .black
            color.withAlphaComponent(reading == nil ? 0.38 : 0.20).setStroke(); track.stroke()
            if let reading, reading.fraction > 0 {
                let arc = NSBezierPath(); arc.lineWidth = 1.7; arc.lineCapStyle = .round
                arc.appendArc(withCenter:NSPoint(x:11,y:11),radius:9.5,startAngle:90,endAngle:90 - CGFloat(reading.fraction * 360),clockwise:true)
                color.setStroke(); arc.stroke()
            }
            let mark = NSImage(size:NSSize(width:11,height:11),flipped:false) { _ in
                logo.draw(in:NSRect(x:0,y:0,width:11,height:11))
                color.setFill()
                NSRect(x:0,y:0,width:11,height:11).fill(using:.sourceIn)
                return true
            }
            mark.draw(in:NSRect(x:5.5,y:5.5,width:11,height:11))
            return true
        }
        result.isTemplate = !colored
        return result
    }
    private static func combined(_ model:UsagePanelModel) -> NSImage? {
        let colored = !model.activeContextAlerts.isEmpty
        guard let codex = image(provider:.codex,reading:model.contextReading(for:.codex),threshold:model.contextAlertThreshold,forceColor:colored),
              let claude = image(provider:.claude,reading:model.contextReading(for:.claude),threshold:model.contextAlertThreshold,forceColor:colored) else { return nil }
        let image = NSImage(size:NSSize(width:48,height:22),flipped:false) { _ in
            codex.draw(in:NSRect(x:0,y:0,width:22,height:22))
            claude.draw(in:NSRect(x:26,y:0,width:22,height:22))
            return true
        }
        image.isTemplate = !colored
        return image
    }

    static func apply(to button:NSStatusBarButton,model:UsagePanelModel) {
        let name:String
        switch model.providerFilter {
        case "all": button.image = combined(model); name = model.l("Codex và Claude Code")
        case "claude": button.image = image(provider:.claude,reading:model.contextReading(for:.claude),threshold:model.contextAlertThreshold); name = UsageProvider.claude.title
        default: button.image = image(provider:.codex,reading:model.contextReading(for:.codex),threshold:model.contextAlertThreshold); name = UsageProvider.codex.title
        }
        // Keep the provider mark to the left of the amount.
        button.imagePosition = .imageLeft
        button.title = model.statusTitle
        button.setAccessibilityLabel("\(name) · No Short Usage")
        button.setAccessibilityValue(model.statusTitle + " · " + model.contextLabel)
    }
}
