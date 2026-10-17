import Foundation
public struct LogSource: Sendable, Equatable {
    public let rootsEnvironment: String
    public var displayName: String { rootsEnvironment }
    public init(rootsEnvironment: String) { self.rootsEnvironment = rootsEnvironment }
}
