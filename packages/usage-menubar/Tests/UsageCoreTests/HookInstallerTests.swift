import XCTest
@testable import UsageCore

final class HookInstallerTests: XCTestCase {
    func testInstallIsIdempotentPreservesExistingHooksAndRemoveDeletesOnlyOwnedHandlers() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:dir) }
        try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
        let config = dir.appendingPathComponent("settings.json")
        let original = Data(#"{"model":"keep-me","hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"echo keep"}]}]}}"#.utf8)
        try original.write(to:config)
        let installer = HookInstaller(executable:URL(fileURLWithPath:"/Applications/Long's App.app/Contents/MacOS/Usage"))
        try installer.install(at:config,provider:.claude)
        try installer.install(at:config,provider:.claude)
        let obj = try JSONSerialization.jsonObject(with:Data(contentsOf:config)) as! [String:Any]
        XCTAssertEqual(obj["model"] as? String,"keep-me")
        let hooks = obj["hooks"] as! [String:[[String:Any]]]
        XCTAssertEqual(hooks["UserPromptSubmit"]?.count,2)
        XCTAssertTrue(try String(contentsOf:config,encoding:.utf8).contains("echo keep"))
        XCTAssertEqual(try Data(contentsOf:config.appendingPathExtension("no-short-backup")),original)
        try installer.remove(at:config)
        let restored = try JSONSerialization.jsonObject(with:Data(contentsOf:config)) as! [String:Any]
        let remaining = restored["hooks"] as! [String:[[String:Any]]]
        XCTAssertEqual(remaining["UserPromptSubmit"]?.count,1)
        XCTAssertNil(remaining["Stop"])
    }
    func testMalformedConfigurationIsNeverOverwritten() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:dir) }
        try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
        for contents in ["{broken", "[]", #"{"hooks":"invalid"}"#, #"{"hooks":{"Stop":"invalid"}}"#] {
            let config = dir.appendingPathComponent("config.json")
            try Data(contents.utf8).write(to:config)
            XCTAssertThrowsError(try HookInstaller(executable:URL(fileURLWithPath:"/app")).install(at:config,provider:.codex))
            XCTAssertEqual(try String(contentsOf:config,encoding:.utf8),contents)
        }
    }
    func testDanglingSettingsSymlinkIsNotReplacedByAnInstallation() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:dir) }
        try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
        let link = dir.appendingPathComponent("settings.json"), target = dir.appendingPathComponent("missing.json")
        try FileManager.default.createSymbolicLink(at:link,withDestinationURL:target)
        XCTAssertThrowsError(try HookInstaller(executable:URL(fileURLWithPath:"/app")).install(at:link,provider:.claude))
        XCTAssertEqual(try? FileManager.default.destinationOfSymbolicLink(atPath:link.path),target.path)
        XCTAssertFalse(FileManager.default.fileExists(atPath:target.path))
    }
}
