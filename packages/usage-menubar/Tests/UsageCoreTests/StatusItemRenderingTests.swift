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
        XCTAssertEqual(button.image?.size,NSSize(width:22,height:22))
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
        XCTAssertEqual(button.image?.size,NSSize(width:48,height:22))
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

    func testRingUsesLiveProgressAndUnknownIsNotAnEmptyWindow() throws {
        func reading(_ used:Int) throws -> ContextReading {
            let log = "{\"type\":\"event_msg\",\"timestamp\":\"2026-10-18T08:00:00Z\",\"payload\":{\"type\":\"token_count\",\"info\":{\"model_context_window\":100,\"last_token_usage\":{\"total_tokens\":\(used)}}}}\n"
            return try XCTUnwrap(ContextReading.codex(Data(log.utf8),sessionID:"main"))
        }
        let empty = try XCTUnwrap(StatusItemRenderer.image(provider:.codex,reading:reading(0))?.tiffRepresentation)
        let half = try XCTUnwrap(StatusItemRenderer.image(provider:.codex,reading:reading(50))?.tiffRepresentation)
        let full = try XCTUnwrap(StatusItemRenderer.image(provider:.codex,reading:reading(100))?.tiffRepresentation)
        let unknown = try XCTUnwrap(StatusItemRenderer.image(provider:.codex,reading:nil)?.tiffRepresentation)
        XCTAssertNotEqual(empty,half); XCTAssertNotEqual(half,full); XCTAssertNotEqual(unknown,empty)
        XCTAssertNotEqual(StatusItemRenderer.image(provider:.claude,reading:try reading(50))?.tiffRepresentation,half)
        for percent in 0...100 { XCTAssertNotNil(StatusItemRenderer.image(provider:.codex,reading:try reading(percent))) }
    }

    func testPinnedSessionAndStaleDataCannotBorrowAnotherSessionsContext() throws {
        let model=UsagePanelModel()
        let snapshot=try fixture()
        model.update(snapshot:snapshot,source:"a",isLoading:false,isStale:false,notice:nil,loginState:.notRegistered)
        let value=ContextReading(sessionID:"main",usedTokens:250,limitTokens:1000,recordedAt:Date())
        model.updateContexts([.codex:value])
        XCTAssertEqual(model.contextReading(for:.codex)?.percent,25)
        model.chooseSession("unknown")
        XCTAssertNil(model.contextReading(for:.codex))
        model.chooseSession("main")
        XCTAssertEqual(model.contextReading(for:.codex)?.percent,25)
        model.update(snapshot:snapshot,source:"a",isLoading:false,isStale:true,notice:"old",loginState:.notRegistered)
        XCTAssertNil(model.contextReading(for:.codex))
        XCTAssertEqual(model.mainCost,"$2.35")
    }
    func testRenderContextRingContactSheet() throws {
        guard let directory=ProcessInfo.processInfo.environment["NO_SHORT_RENDER_DIR"] else { return }
        _ = NSApplication.shared
        let url=URL(fileURLWithPath:directory)
        try FileManager.default.createDirectory(at:url,withIntermediateDirectories:true)
        for (name,appearance) in [("light",NSAppearance.Name.aqua),("dark",.darkAqua)] {
            let view=NSView(frame:NSRect(x:0,y:0,width:640,height:164))
            view.appearance=NSAppearance(named:appearance)
            view.wantsLayer=true
            view.layer?.backgroundColor = (name == "dark" ? NSColor(calibratedWhite:0.12,alpha:1) : NSColor(calibratedWhite:0.97,alpha:1)).cgColor
            for (row,provider) in UsageProvider.allCases.enumerated() {
                let title=NSTextField(labelWithString:provider.title)
                title.frame=NSRect(x:14,y:126-CGFloat(row)*76,width:90,height:18)
                view.addSubview(title)
                for (column,percent) in [0,25,50,75,100,-1].enumerated() {
                    let reading:ContextReading? = percent < 0 ? nil : ContextReading(sessionID:"sample",usedTokens:Double(percent),limitTokens:100,recordedAt:Date())
                    let button=NSButton(title:percent < 0 ? "—" : "\(percent)%",target:nil,action:nil)
                    button.image=StatusItemRenderer.image(provider:provider,reading:reading)
                    button.imagePosition = .imageAbove; button.isBordered=false
                    button.frame=NSRect(x:112+CGFloat(column)*84,y:91-CGFloat(row)*76,width:70,height:56)
                    view.addSubview(button)
                }
            }
            view.layoutSubtreeIfNeeded()
            let bitmap=try XCTUnwrap(view.bitmapImageRepForCachingDisplay(in:view.bounds))
            view.cacheDisplay(in:view.bounds,to:bitmap)
            try XCTUnwrap(bitmap.representation(using:.png,properties:[:])).write(to:url.appendingPathComponent("context-rings-\(name).png"))
        }
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
