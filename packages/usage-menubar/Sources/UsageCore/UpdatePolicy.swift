import Foundation

public struct UpdateConfiguration: Equatable, Sendable {
    public static let productionFeed = "https://no-short.io.vn/updates/experimental-arm64.xml"
    public let feedURL: URL
    public let publicKey: Data
    public init(feedURL: String, publicKey: String) throws {
        guard feedURL == Self.productionFeed, let url = URL(string: feedURL),
              let key = Data(base64Encoded: publicKey), key.count == 32,
              key.base64EncodedString() == publicKey, key.contains(where: { $0 != 0 }) else {
            throw NativeUpdateFailure.notConfigured
        }
        self.feedURL = url; self.publicKey = key
    }
}
public enum UpdatePolicy {
    public static func permitsUserCheck(architecture: String, configured: Bool, terminating: Bool, maintenanceActive: Bool, sessionActive: Bool) -> Bool {
        architecture == "arm64" && configured && !terminating && !maintenanceActive && !sessionActive
    }
}
