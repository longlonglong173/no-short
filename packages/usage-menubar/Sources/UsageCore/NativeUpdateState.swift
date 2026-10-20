import Foundation

public enum NativeUpdateFailure: Error, Equatable, Sendable {
    case notConfigured, unsupportedArchitecture, network, verification, unexpected
}
public enum NativeUpdateState: Equatable, Sendable {
    case idle, checking, available(version: String), downloading, installing, current, failed(NativeUpdateFailure)
    public var isBusy: Bool {
        switch self {
        case .checking, .available, .downloading, .installing: true
        default: false
        }
    }
}
