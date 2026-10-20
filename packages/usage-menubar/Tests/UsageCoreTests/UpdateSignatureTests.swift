import XCTest
import CryptoKit
import Foundation

final class UpdateSignatureTests:XCTestCase {
    func testPinnedSDKSignatureIsVerifiedByCryptoKit() throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
        defer{try? FileManager.default.removeItem(at:root)}
        let bytes=Data("NS14 synthetic archive bytes".utf8),file=root.appendingPathComponent("fixture.zip")
        try bytes.write(to:file)
        let key=Curve25519.Signing.PrivateKey()
        let tool=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent(".build/artifacts/sparkle/Sparkle/bin/sign_update")
        let p=Process(),input=Pipe(),output=Pipe(),error=Pipe()
        p.executableURL=tool;p.arguments=["--ed-key-file","-","-p",file.path];p.standardInput=input;p.standardOutput=output;p.standardError=error
        try p.run();input.fileHandleForWriting.write(Data((key.rawRepresentation.base64EncodedString()+"\n").utf8));try input.fileHandleForWriting.close()
        let data=output.fileHandleForReading.readDataToEndOfFile();_ = error.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
        XCTAssertEqual(p.terminationStatus,0)
        let signature=try XCTUnwrap(Data(base64Encoded:try XCTUnwrap(String(data:data,encoding:.utf8)).trimmingCharacters(in:.whitespacesAndNewlines)))
        XCTAssertTrue(key.publicKey.isValidSignature(signature,for:bytes))
        XCTAssertFalse(key.publicKey.isValidSignature(signature,for:Data("modified".utf8)))
        XCTAssertFalse(Curve25519.Signing.PrivateKey().publicKey.isValidSignature(signature,for:bytes))
    }
}
