import AppKit
import Sparkle
import UsageCore

@MainActor final class SparkleUpdateDriver: NSObject, NativeUpdateDriving, SPUUpdaterDelegate {
    var onState: (@MainActor (NativeUpdateState) -> Void)?
    private var requested=false, started=false
    private lazy var controller=SPUStandardUpdaterController(startingUpdater:false,updaterDelegate:self,userDriverDelegate:nil)
    var canCheck: Bool { !requested }
    func checkForUpdates() throws {
        guard !requested else { return }
        // Explicit user action; old Sparkle preferences cannot turn V1 into a scheduler.
        controller.updater.automaticallyChecksForUpdates=false
        controller.updater.automaticallyDownloadsUpdates=false
        controller.updater.sendsSystemProfile=false
        requested=true
        do {
            if !started { try controller.updater.start();started=true }
            controller.checkForUpdates(nil)
        } catch { requested=false;throw error }
    }
    func updater(_ updater: SPUUpdater, mayPerform updateCheck: SPUUpdateCheck) throws {
        guard requested && updateCheck == .updates else { throw NativeUpdateFailure.unexpected }
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
