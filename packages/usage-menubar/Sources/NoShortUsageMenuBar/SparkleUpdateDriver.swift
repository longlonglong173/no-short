import AppKit
import Sparkle
import UsageCore

@MainActor final class SparkleUpdateDriver: NSObject, NativeUpdateDriving, SPUUpdaterDelegate {
    var onState: (@MainActor (NativeUpdateState) -> Void)?
    private var requested=false, started=false
    private var requestedCheck: SPUUpdateCheck = .updates
    private lazy var controller=SPUStandardUpdaterController(startingUpdater:false,updaterDelegate:self,userDriverDelegate:nil)
    var canCheck: Bool { !requested }
    // Delegate precedence prevents deprecated SUFeedURL defaults overriding the pinned endpoint.
    func feedURLString(for updater: SPUUpdater) -> String? {
        #if NO_SHORT_UPDATER_E2E
        return UpdaterE2ESupport.feedURL
        #else
        return UpdateConfiguration.productionFeed
        #endif
    }
    func checkForUpdates() throws { try begin(.updates) }
    func checkForUpdateInformation() throws { try begin(.updateInformation) }
    private func begin(_ check: SPUUpdateCheck) throws {
        guard !requested else { return }
        // The app owns quiet informational cadence; SDK scheduling and downloads stay off.
        controller.updater.automaticallyChecksForUpdates=false
        controller.updater.automaticallyDownloadsUpdates=false
        controller.updater.sendsSystemProfile=false
        requested=true;requestedCheck=check
        do {
            if !started { try controller.updater.start();started=true }
            if check == .updateInformation { controller.updater.checkForUpdateInformation() }
            else { controller.checkForUpdates(nil) }
        } catch { requested=false;throw error }
    }
    func updater(_ updater: SPUUpdater, mayPerform updateCheck: SPUUpdateCheck) throws {
        guard requested && updateCheck == requestedCheck else { throw NativeUpdateFailure.unexpected }
    }
    func updater(_ updater: SPUUpdater, shouldProceedWithUpdate item: SUAppcastItem, updateCheck: SPUUpdateCheck) throws {
        guard UpdatePolicy.permitsArtifact(hardwareRequirements: item.hardwareRequirements) else {
            throw NSError(domain: SUSparkleErrorDomain, code: Int(SUError.validationError.rawValue), userInfo: [NSLocalizedDescriptionKey: NativeUpdateState.failed(.verification).localizedDescription(language: AppLanguage.resolve(saved: UserDefaults.standard.string(forKey: "usageLanguage")))])
        }
    }
    func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) { onState?(.available(version:item.displayVersionString)) }
    func updater(_ updater: SPUUpdater, willDownloadUpdate item: SUAppcastItem, with request: NSMutableURLRequest) { onState?(.downloading) }
    func updater(_ updater: SPUUpdater, willInstallUpdate item: SUAppcastItem) { onState?(.installing) }
    func updater(_ updater: SPUUpdater, didAbortWithError error: Error) { finish(error as NSError) }
    func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: Error?) { finish(error as NSError?) }
    private func finish(_ error: NSError?) {
        guard requested else { return }
        requested=false
        guard let error else { onState?(.idle);return }
        if error.domain==SUSparkleErrorDomain {
            switch SUError(rawValue:Int32(error.code)) {
            case .noUpdateError: onState?(.current)
            case .installationCanceledError: onState?(.idle)
            case .signatureError, .validationError, .appcastParseError: onState?(.failed(.verification))
            case .downloadError, .appcastError: onState?(.failed(.network))
            default: onState?(.failed(.unexpected))
            }
        } else { onState?(.failed(.network)) }
    }
}
