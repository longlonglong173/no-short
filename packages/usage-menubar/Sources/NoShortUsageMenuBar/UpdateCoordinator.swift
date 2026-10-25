import Foundation
import Combine
import UsageCore

@MainActor protocol NativeUpdateDriving: AnyObject {
    var canCheck: Bool { get }
    var onState: (@MainActor (NativeUpdateState) -> Void)? { get set }
    func checkForUpdates() throws
}
@MainActor final class UpdateCoordinator: ObservableObject {
    @Published private(set) var state: NativeUpdateState = .idle
    private(set) var releaseVersion: String?
    var onChange: (() -> Void)?
    let hasInstallCapability: Bool
    private let configuration: UpdateConfiguration?
    private let architecture: String
    private let mayCheck: @MainActor () -> Bool
    private let makeDriver: @MainActor () -> any NativeUpdateDriving
    private var driver: (any NativeUpdateDriving)?
    init(configuration: UpdateConfiguration?, architecture: String, mayCheck: @escaping @MainActor () -> Bool, makeDriver: @escaping @MainActor () -> any NativeUpdateDriving) {
        self.configuration=configuration;self.architecture=architecture;self.mayCheck=mayCheck;self.makeDriver=makeDriver
        hasInstallCapability=configuration != nil && architecture=="arm64"
    }
    var canCheck: Bool { hasInstallCapability && mayCheck() && !state.isBusy && (driver?.canCheck ?? true) }
    private func update(_ value: NativeUpdateState) {
        if case .available(let version)=value { releaseVersion=version }
        state=value;onChange?()
    }
    func check() {
        guard hasInstallCapability else { update(.failed(architecture=="arm64" ? .notConfigured : .unsupportedArchitecture));return }
        guard canCheck else { return }
        if driver == nil {
            let d=makeDriver();d.onState={ [weak self] state in self?.update(state) };driver=d
        }
        update(.checking)
        do { try driver?.checkForUpdates() }
        catch { update(.failed((error as? NativeUpdateFailure) ?? .unexpected)) }
    }
}
