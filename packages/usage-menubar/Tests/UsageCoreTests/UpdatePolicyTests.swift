import XCTest
import CryptoKit
@testable import UsageCore

final class UpdatePolicyTests: XCTestCase {
    func testOnlyCanonicalProductionConfigurationIsAccepted() throws {
        let key = Curve25519.Signing.PrivateKey().publicKey.rawRepresentation.base64EncodedString()
        let valid = try UpdateConfiguration(feedURL: "https://no-short.io.vn/updates/experimental-arm64.xml", publicKey: key)
        XCTAssertEqual(valid.publicKey.count, 32)
        for url in ["http://no-short.io.vn/updates/experimental-arm64.xml", "https://evil.example/feed.xml", "https://no-short.io.vn:443/updates/experimental-arm64.xml", "https://no-short.io.vn/updates/experimental-arm64.xml?q=1", "https://u:p@no-short.io.vn/updates/experimental-arm64.xml", "https://no-short.io.vn/updates/experimental-arm64.xml#x"] {
            XCTAssertThrowsError(try UpdateConfiguration(feedURL: url, publicKey: key), url)
        }
        for invalid in ["", "bad", Data(repeating: 0, count: 32).base64EncodedString(), Data(repeating: 1, count: 31).base64EncodedString(), key + "\n"] {
            XCTAssertThrowsError(try UpdateConfiguration(feedURL: valid.feedURL.absoluteString, publicKey: invalid))
        }
    }
    func testUserCheckRequiresArm64ConfigurationAndNoConflictingOperation() {
        XCTAssertTrue(UpdatePolicy.permitsUserCheck(architecture: "arm64", configured: true, terminating: false, maintenanceActive: false, sessionActive: false))
        for (arch, configured, terminating, maintenance, active) in [("x86_64",true,false,false,false),("arm64",false,false,false,false),("arm64",true,true,false,false),("arm64",true,false,true,false),("arm64",true,false,false,true)] {
            XCTAssertFalse(UpdatePolicy.permitsUserCheck(architecture: arch, configured: configured, terminating: terminating, maintenanceActive: maintenance, sessionActive: active))
        }
    }
    func testAllBusyPhasesDisableDuplicateCheck() {
        for state in [NativeUpdateState.checking, .available(version: "0.6.1"), .downloading, .installing] { XCTAssertTrue(state.isBusy) }
        for state in [NativeUpdateState.idle, .current, .failed(.verification)] { XCTAssertFalse(state.isBusy) }
    }
}
