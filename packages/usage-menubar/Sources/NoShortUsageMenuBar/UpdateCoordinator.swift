import Foundation
import Combine
import UsageCore

@MainActor protocol NativeUpdateDriving: AnyObject {
    var canCheck: Bool { get }
    var onState: (@MainActor (NativeUpdateState) -> Void)? { get set }
    func checkForUpdates() throws
    func checkForUpdateInformation() throws
}
@MainActor final class UpdateCoordinator: ObservableObject {
    @Published private(set) var state: NativeUpdateState = .idle
    @Published private(set) var releaseVersion: String?
    @Published private(set) var lastCheckedAt: Date?
    @Published private(set) var automaticChecksEnabled: Bool
    var onChange: (() -> Void)?
    let hasInstallCapability: Bool
    private let channel: String?
    private let installedVersion: String?
    private let defaults: UserDefaults?
    private let now: () -> Date
    private let mayCheck: @MainActor () -> Bool
    private let makeDriver: @MainActor () -> any NativeUpdateDriving
    private var driver: (any NativeUpdateDriving)?
    private var lastAttemptAt: Date?
    private let architecture: String
    private struct Record: Codable {
        let channel: String
        let attemptedAt: Date?
        let checkedAt: Date?
        let version: String?
    }
    init(configuration: UpdateConfiguration?, architecture: String, mayCheck: @escaping @MainActor () -> Bool, makeDriver: @escaping @MainActor () -> any NativeUpdateDriving, defaults: UserDefaults? = nil, installedVersion: String? = AppBuildInfo().version, now: @escaping () -> Date = Date.init) {
        self.architecture=architecture;self.mayCheck=mayCheck;self.makeDriver=makeDriver
        self.defaults=defaults;self.installedVersion=installedVersion;self.now=now
        channel=configuration.map { $0.feedURL.absoluteString+"|"+$0.publicKey.base64EncodedString() }
        hasInstallCapability=configuration != nil && architecture=="arm64"
        automaticChecksEnabled=defaults?.object(forKey:"usageAutomaticUpdateChecksEnabled") as? Bool ?? true
        if let data=defaults?.data(forKey:"usageUpdateCheckRecord"),
           let saved=try? JSONDecoder().decode(Record.self,from:data),saved.channel==channel {
            lastAttemptAt=saved.attemptedAt
            if let checked=saved.checkedAt,checked.timeIntervalSince1970.isFinite,checked<=now().addingTimeInterval(300),
               let version=saved.version,SemanticVersion(version) != nil {
                lastCheckedAt=checked;releaseVersion=version
            }
        }
    }
    var canCheck: Bool { hasInstallCapability && mayCheck() && !state.isBusy && (driver?.canCheck ?? true) }
    func setAutomaticChecksEnabled(_ value: Bool) {
        guard automaticChecksEnabled != value else { return }
        automaticChecksEnabled=value;defaults?.set(value,forKey:"usageAutomaticUpdateChecksEnabled");onChange?()
    }
    func checkIfDue() {
        guard automaticChecksEnabled,canCheck else { return }
        if let last=lastAttemptAt,last.timeIntervalSince1970.isFinite {
            let elapsed=now().timeIntervalSince(last)
            if elapsed >= -300 && elapsed < 86_400 { return }
        }
        begin(informationOnly:true)
    }
    func check() {
        guard hasInstallCapability else { update(.failed(architecture=="arm64" ? .notConfigured : .unsupportedArchitecture));return }
        guard canCheck else { return }
        begin(informationOnly:false)
    }
    private func begin(informationOnly: Bool) {
        if driver == nil {
            let d=makeDriver();d.onState={ [weak self] state in self?.update(state) };driver=d
        }
        lastAttemptAt=now();persist();update(.checking)
        do {
            if informationOnly { try driver?.checkForUpdateInformation() }
            else { try driver?.checkForUpdates() }
        } catch { update(.failed((error as? NativeUpdateFailure) ?? .unexpected)) }
    }
    private func update(_ value: NativeUpdateState) {
        if case .available(let version)=value,SemanticVersion(version) != nil {
            releaseVersion=version;lastCheckedAt=now();persist()
        } else if value == .current {
            releaseVersion=installedVersion;lastCheckedAt=now();persist()
        }
        state=value;onChange?()
    }
    private func persist() {
        guard let channel,let data=try? JSONEncoder().encode(Record(channel:channel,attemptedAt:lastAttemptAt,checkedAt:lastCheckedAt,version:releaseVersion)) else { return }
        defaults?.set(data,forKey:"usageUpdateCheckRecord")
    }
}
