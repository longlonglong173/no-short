import XCTest
import AppKit
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class StatusItemRenderingTests: XCTestCase {
    func testProviderChangesAndAllModeUpdateTheActualStatusButton() throws {
        _ = NSApplication.shared
        let item = NSStatusBar.system.statusItem(withLength:NSStatusItem.variableLength)
        defer { NSStatusBar.system.removeStatusItem(item) }
        let button = try XCTUnwrap(item.button), model = UsagePanelModel()
        let snapshot = try fixture { object in
            var sessions = object["sessions"] as! [[String:Any]]
            var claude = sessions[2]
            claude["id"] = "claude:same"; claude["provider"] = "claude"; claude["sessionKey"] = "same"
            claude["cost"] = ["amountUSD":1.25,"knownCostUSD":1.25,"status":"estimated"]
            sessions.append(claude); object["sessions"] = sessions
        }
        model.update(snapshot:snapshot,source:"a",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        StatusItemRenderer.apply(to:button,model:model)
        XCTAssertEqual(button.title,"$2.35")
        XCTAssertEqual(button.accessibilityLabel(),"Codex · No Short Usage")
        let codex = try XCTUnwrap(button.image?.tiffRepresentation)
        XCTAssertEqual(button.image?.size,NSSize(width:16,height:16))
        XCTAssertEqual(button.image?.isTemplate,true)
        try capture(button,name:"codex")

        let now = Date()
        let event = try XCTUnwrap(SessionActivity.parse(Data(#"{"session_id":"same","hook_event_name":"UserPromptSubmit"}"#.utf8),provider:.claude,now:now))
        model.applyActivities([event],now:now)
        StatusItemRenderer.apply(to:button,model:model)
        XCTAssertEqual(button.title,"$1.25")
        XCTAssertEqual(button.accessibilityLabel(),"Claude Code · No Short Usage")
        XCTAssertNotEqual(button.image?.tiffRepresentation,codex)
        try capture(button,name:"claude")

        model.chooseSession("main")
        StatusItemRenderer.apply(to:button,model:model)
        XCTAssertEqual(button.accessibilityLabel(),"Codex · No Short Usage")
        model.setProviderFilter("all")
        StatusItemRenderer.apply(to:button,model:model)
        XCTAssertEqual(button.title,"$2.35")
        XCTAssertEqual(button.accessibilityLabel(),"Codex và Claude Code · No Short Usage")
        XCTAssertEqual(button.image?.size,NSSize(width:36,height:16))
        XCTAssertEqual(button.image?.isTemplate,true)
        try capture(button,name:"all")
    }

    func testLoadingUnknownAndPartialStaleAmountsKeepTheirMeaning() throws {
        let model = UsagePanelModel()
        model.update(snapshot:nil,source:"a",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        XCTAssertEqual(model.statusTitle,"—")
        let snapshot = try fixture { object in
            var sessions = object["sessions"] as! [[String:Any]]
            sessions[2]["cost"] = ["amountUSD":NSNull(),"knownCostUSD":2.35,"status":"partial"]
            object["sessions"] = sessions
        }
        model.update(snapshot:snapshot,source:"a",isLoading:false,isStale:true,notice:nil,loginState:.notRegistered)
        XCTAssertEqual(model.statusTitle,"≥$2.35 ⚠")
    }

    private func capture(_ button:NSStatusBarButton,name:String) throws {
        guard let directory = ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] else { return }
        let url = URL(fileURLWithPath:directory)
        try FileManager.default.createDirectory(at:url,withIntermediateDirectories:true)
        // Preview the actual renderer output in a borderless native button.
        // NSStatusBarButton's system compositor cannot be captured reliably offscreen.
        let preview = NSButton(title:button.title,target:nil,action:nil)
        preview.image = button.image; preview.imagePosition = button.imagePosition
        preview.isBordered = false; preview.font = .menuBarFont(ofSize:0)
        preview.sizeToFit(); preview.frame.size.height = 24
        for (suffix,appearance) in [("light",NSAppearance.Name.aqua),("dark",.darkAqua)] {
            preview.appearance = NSAppearance(named:appearance)
            preview.layoutSubtreeIfNeeded()
            let bitmap = try XCTUnwrap(preview.bitmapImageRepForCachingDisplay(in:preview.bounds))
            preview.cacheDisplay(in:preview.bounds,to:bitmap)
            try XCTUnwrap(bitmap.representation(using:.png,properties:[:])).write(to:url.appendingPathComponent("status-\(name)-\(suffix).png"))
        }
    }

}
