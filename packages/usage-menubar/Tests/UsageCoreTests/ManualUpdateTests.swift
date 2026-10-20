import XCTest
import Foundation
@testable import UsageCore

final class SemanticVersionTests: XCTestCase {
    func testNewerEqualAndOlderUseNumericPrecedence() throws {
        for (installed, latest, expected) in [
            ("0.4.2", "v0.4.3", true), ("0.4.2", "0.4.2", false),
            ("0.4.2", "0.4.1", false), ("0.9.9", "0.10.0", true),
            ("1.0.0", "2.0.0", true), ("1.0.0+one", "1.0.0+two", false),
            ("1.0.0-rc.2", "1.0.0-rc.10", true), ("1.0.0-rc.1", "1.0.0", true),
            ("1.0.0", "1.0.0-rc.1", false),
            ("999999999999999999999.0.0", "1000000000000000000000.0.0", true)
        ] {
            XCTAssertEqual(try XCTUnwrap(SemanticVersion(installed)) < XCTUnwrap(SemanticVersion(latest)), expected, "\(installed) -> \(latest)")
        }
        XCTAssertEqual(SemanticVersion("1.0.0+one"), SemanticVersion("v1.0.0+two"))
    }
    func testPrereleasePrecedenceFollowsSemver() throws {
        let ordered = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"]
        for pair in zip(ordered, ordered.dropFirst()) {
            XCTAssertLessThan(try XCTUnwrap(SemanticVersion(pair.0)), try XCTUnwrap(SemanticVersion(pair.1)))
        }
    }
    func testInvalidVersionsAreRejected() {
        for value in ["", "latest", "1.2", "1.2.3.4", "01.2.3", "1.02.3", "1.2.-3", " 1.2.3", "1.2.3\n", "1.2.3-", "1.2.3-01", "1.2.3-a..b", "1.2.3+", "1.2.3+a+b", "1.2.3-你好", "v", "vv1.2.3"] {
            XCTAssertNil(SemanticVersion(value), value)
        }
    }
}

// Each session owns its stub class: no shared mutable handler, credentials or live traffic.
private class ReleaseURLProtocol: URLProtocol, @unchecked Sendable {
    class var status: Int { 200 }
    class var payload: String { #"{"tag_name":"v0.4.3","html_url":"https://github.com/longlonglong173/no-short/releases/tag/v0.4.3","draft":false,"prerelease":false}"# }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard request.url?.absoluteString == "https://api.github.com/repos/longlonglong173/no-short/releases/latest",
              request.httpMethod == "GET", request.value(forHTTPHeaderField: "Authorization") == nil,
              request.value(forHTTPHeaderField: "Cookie") == nil else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL)); return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: "HTTP/1.1", headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(Self.payload.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
private final class HTTPFailureProtocol: ReleaseURLProtocol, @unchecked Sendable { override class var status: Int { 503 } }
private final class RateLimitProtocol: ReleaseURLProtocol, @unchecked Sendable { override class var status: Int { 403 } }
private final class MalformedProtocol: ReleaseURLProtocol, @unchecked Sendable { override class var payload: String { "not json" } }
private final class InvalidTagProtocol: ReleaseURLProtocol, @unchecked Sendable { override class var payload: String { #"{"tag_name":"latest","html_url":"https://github.com/longlonglong173/no-short/releases/tag/latest","draft":false,"prerelease":false}"# } }
private final class UnsafeLinkProtocol: ReleaseURLProtocol, @unchecked Sendable { override class var payload: String { #"{"tag_name":"v0.4.3","html_url":"https://evil.example/update","draft":false,"prerelease":false}"# } }
private final class DraftProtocol: ReleaseURLProtocol, @unchecked Sendable { override class var payload: String { #"{"tag_name":"v0.4.3","html_url":"https://github.com/longlonglong173/no-short/releases/tag/v0.4.3","draft":true,"prerelease":false}"# } }
private final class OfflineProtocol: ReleaseURLProtocol, @unchecked Sendable {
    override func startLoading() { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
}

@MainActor final class ManualUpdateTests: XCTestCase {
    private func client(_ stub: ReleaseURLProtocol.Type) -> GitHubReleaseClient {
        let configuration = GitHubReleaseClient.configuration()
        configuration.protocolClasses = [stub]
        return GitHubReleaseClient(session: URLSession(configuration: configuration))
    }
    func testRealURLSessionBoundaryDecodesLatestReleaseWithoutAuth() async throws {
        let release = try await client(ReleaseURLProtocol.self).fetchLatest()
        XCTAssertEqual(release.tag, "v0.4.3")
        XCTAssertEqual(release.notesURL.absoluteString, "https://github.com/longlonglong173/no-short/releases/tag/v0.4.3")
        let config = GitHubReleaseClient.configuration()
        XCTAssertNil(config.urlCache); XCTAssertNil(config.urlCredentialStorage); XCTAssertNil(config.httpCookieStorage)
        XCTAssertFalse(config.httpShouldSetCookies)
    }
    func testHTTPMalformedAndOfflineBoundaries() async {
        for (stub, expected) in [(HTTPFailureProtocol.self, UpdateCheckError.http(503)), (RateLimitProtocol.self, .http(403)),
                                  (MalformedProtocol.self, .malformed), (InvalidTagProtocol.self, .malformed),
                                  (UnsafeLinkProtocol.self, .malformed), (DraftProtocol.self, .malformed), (OfflineProtocol.self, .network)] {
            do { _ = try await client(stub).fetchLatest(); XCTFail("Expected \(expected)") }
            catch { XCTAssertEqual(error as? UpdateCheckError, expected) }
        }
    }
    func testOnlyExplicitCheckChangesIdleAndNewerEqualOlderStates() async {
        for (installed, available) in [("0.4.2", true), ("0.4.3", false), ("0.5.0", false)] {
            let controller = ManualUpdateController(installedVersion: installed, client: client(ReleaseURLProtocol.self))
            XCTAssertEqual(controller.state, .idle)
            await controller.check()
            if case .available(let release) = controller.state { XCTAssertTrue(available); XCTAssertEqual(release.tag, "v0.4.3") }
            else if case .current(let release) = controller.state { XCTAssertFalse(available); XCTAssertEqual(release.tag, "v0.4.3") }
            else { XCTFail("Unexpected \(controller.state)") }
        }
    }
    func testInvalidInstalledVersionNeverClaimsCurrent() async {
        let controller = ManualUpdateController(installedVersion: nil, client: client(ReleaseURLProtocol.self))
        await controller.check()
        XCTAssertEqual(controller.state, .failed(.invalidInstalledVersion))
    }
    func testFailureCanRetryAndInFlightRequestsAreCoalesced() async {
        let stub = GatedReleaseLoader()
        let controller = ManualUpdateController(installedVersion: "0.4.2", client: stub)
        let first = Task { await controller.check() }
        await stub.waitUntilRequested()
        XCTAssertEqual(controller.state, .checking)
        await controller.check()
        let count = await stub.calls
        XCTAssertEqual(count, 1)
        await stub.finish(.failure(UpdateCheckError.network)); await first.value
        XCTAssertEqual(controller.state, .failed(.network))
        let retry = Task { await controller.check() }
        await stub.waitUntilRequested()
        await stub.finish(.success(GitHubRelease(tag: "v0.4.3", notesURL: URL(string: "https://github.com/longlonglong173/no-short/releases/tag/v0.4.3")!)))
        await retry.value
        guard case .available = controller.state else { return XCTFail("Retry did not recover") }
    }
}

private actor GatedReleaseLoader: LatestReleaseLoading {
    private var pending: CheckedContinuation<GitHubRelease, any Error>?
    private(set) var calls = 0
    func fetchLatest() async throws -> GitHubRelease {
        calls += 1
        return try await withCheckedThrowingContinuation { pending = $0 }
    }
    func waitUntilRequested() async { while pending == nil { await Task.yield() } }
    func finish(_ result: Result<GitHubRelease, any Error>) { pending?.resume(with: result); pending = nil }
}
