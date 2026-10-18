import XCTest
@testable import UsageCore

final class ClaudeContextInstallerTests: XCTestCase {
    func testInstallAndRemovalPreserveSettingsAndRefuseAnExistingStatusLine() throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
        defer { try? FileManager.default.removeItem(at:root) }
        let settings=root.appendingPathComponent("settings.json")
        let installer=ClaudeContextInstaller(executable:URL(fileURLWithPath:"/App With Space/Usage"))
        try Data(#"{"theme":"dark","hooks":{"Stop":[]}}"#.utf8).write(to:settings)
        try installer.install(at:settings)
        var object = try JSONSerialization.jsonObject(with:Data(contentsOf:settings)) as! [String:Any]
        XCTAssertEqual(object["theme"] as? String,"dark")
        XCTAssertNotNil(object["hooks"])
        XCTAssertTrue((object["statusLine"] as? [String:Any])?["command"] as? String == "'/App With Space/Usage' --claude-context-statusline")
        try installer.install(at:settings)
        try installer.remove(at:settings)
        object = try JSONSerialization.jsonObject(with:Data(contentsOf:settings)) as! [String:Any]
        XCTAssertNil(object["statusLine"])
        let custom = Data(#"{"statusLine":{"type":"command","command":"my-original-statusline"},"theme":"dark"}"#.utf8)
        try custom.write(to:settings)
        XCTAssertThrowsError(try installer.install(at:settings))
        try installer.remove(at:settings)
        XCTAssertEqual(try Data(contentsOf:settings),custom)
    }
    func testComposedStatusLineEndingInCollectorIsNeverClaimedOrRemoved() throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
        defer { try? FileManager.default.removeItem(at:root) }
        let settings=root.appendingPathComponent("settings.json")
        let original=Data(#"{"statusLine":{"type":"command","command":"my-custom-display; '/Apps/Usage' --claude-context-statusline"}}"#.utf8)
        try original.write(to:settings)
        let installer=ClaudeContextInstaller(executable:URL(fileURLWithPath:"/Apps/Usage"))
        XCTAssertThrowsError(try installer.install(at:settings))
        XCTAssertEqual(try Data(contentsOf:settings),original)
        try installer.remove(at:settings)
        XCTAssertEqual(try Data(contentsOf:settings),original)
    }

}
