import Foundation

public struct GitHubRelease: Equatable, Sendable {
    public let tag: String
    public let notesURL: URL
    public init(tag: String, notesURL: URL) { self.tag = tag; self.notesURL = notesURL }
}
public enum UpdateCheckError: Error, Equatable, Sendable {
    case http(Int), malformed, network, invalidInstalledVersion
}
public protocol LatestReleaseLoading: Sendable {
    func fetchLatest() async throws -> GitHubRelease
}
public struct GitHubReleaseClient: LatestReleaseLoading {
    public static let releasesURL = URL(string: "https://github.com/longlonglong173/no-short/releases")!
    private let session: URLSession
    public init(session: URLSession? = nil) {
        self.session = session ?? URLSession(configuration: Self.configuration())
    }
    public static func configuration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil; config.urlCredentialStorage = nil; config.httpCookieStorage = nil
        config.httpShouldSetCookies = false; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 20
        return config
    }
    public static func notesURL(for version: String?) -> URL {
        guard let version, SemanticVersion(version) != nil else { return releasesURL }
        let tag = version.hasPrefix("v") ? version : "v" + version
        return releasesURL.appendingPathComponent("tag").appendingPathComponent(tag)
    }
    public func fetchLatest() async throws -> GitHubRelease {
        var request = URLRequest(url: URL(string: "https://api.github.com/repos/longlonglong173/no-short/releases/latest")!)
        request.httpMethod = "GET"
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        request.setValue("NoShortUsage-ManualUpdate", forHTTPHeaderField: "User-Agent")
        let data: Data, response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch { throw UpdateCheckError.network }
        guard let http = response as? HTTPURLResponse else { throw UpdateCheckError.malformed }
        guard http.statusCode == 200 else { throw UpdateCheckError.http(http.statusCode) }
        struct Payload: Decodable { let tag_name, html_url: String; let draft, prerelease: Bool }
        guard let payload = try? JSONDecoder().decode(Payload.self, from: data),
              !payload.draft, !payload.prerelease, SemanticVersion(payload.tag_name) != nil,
              let url = URL(string: payload.html_url),
              url == Self.releasesURL.appendingPathComponent("tag").appendingPathComponent(payload.tag_name) else {
            throw UpdateCheckError.malformed
        }
        return GitHubRelease(tag: payload.tag_name, notesURL: url)
    }
}

public enum ManualUpdateState: Equatable, Sendable {
    case idle, checking, available(GitHubRelease), current(GitHubRelease), failed(UpdateCheckError)
    public var isChecking: Bool { self == .checking }
}

/// Owned independently of usage refreshes. Initialization never starts a request.
@MainActor public final class ManualUpdateController {
    public private(set) var state: ManualUpdateState = .idle
    public var onChange: (() -> Void)?
    private let installedVersion: String?
    private let client: any LatestReleaseLoading
    public init(installedVersion: String?, client: any LatestReleaseLoading = GitHubReleaseClient()) {
        self.installedVersion = installedVersion; self.client = client
    }
    public func check() async {
        guard !state.isChecking else { return }
        guard let installedVersion, let installed = SemanticVersion(installedVersion) else {
            state = .failed(.invalidInstalledVersion); onChange?(); return
        }
        state = .checking; onChange?()
        do {
            let release = try await client.fetchLatest()
            guard let latest = SemanticVersion(release.tag) else { throw UpdateCheckError.malformed }
            state = installed < latest ? .available(release) : .current(release)
        } catch { state = .failed((error as? UpdateCheckError) ?? .network) }
        onChange?()
    }
}
