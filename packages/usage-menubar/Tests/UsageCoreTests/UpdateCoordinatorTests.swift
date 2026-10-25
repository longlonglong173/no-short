import XCTest
import CryptoKit
import AppKit
import Sparkle
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class UpdateCoordinatorTests: XCTestCase {
    private func config() throws -> UpdateConfiguration { try .init(feedURL: UpdateConfiguration.productionFeed, publicKey: Curve25519.Signing.PrivateKey().publicKey.rawRepresentation.base64EncodedString()) }
    func testDriverPinsFeedInsteadOfUsingSavedSparklePreferences() {
        let driver=SparkleUpdateDriver()
        let controller=SPUStandardUpdaterController(startingUpdater:false,updaterDelegate:driver,userDriverDelegate:nil)
        XCTAssertEqual(driver.feedURLString(for:controller.updater),UpdateConfiguration.productionFeed)
        XCTAssertEqual(controller.updater.feedURL?.absoluteString,UpdateConfiguration.productionFeed)
        XCTAssertTrue(driver.responds(to:NSSelectorFromString("feedURLStringForUpdater:")))
    }
    func testLazySharedSessionAndRecovery() throws {
        let driver=FakeNativeDriver(); var creations=0
        let c=UpdateCoordinator(configuration:try config(),architecture:"arm64",mayCheck:{true},makeDriver:{creations+=1;return driver})
        XCTAssertEqual(creations,0); XCTAssertEqual(c.state,.idle)
        c.check(); c.check(); XCTAssertEqual(creations,1); XCTAssertEqual(driver.checks,1); XCTAssertEqual(c.state,.checking)
        driver.onState?(.available(version:"0.6.1")); c.check(); XCTAssertEqual(driver.checks,1)
        driver.onState?(.idle); c.check(); XCTAssertEqual(driver.checks,2)
        driver.onState?(.failed(.verification)); XCTAssertFalse(c.state.isBusy)
        c.check(); XCTAssertEqual(driver.checks,3)
    }
    func testMissingConfigurationArchitectureAndMaintenanceNeverCreateDriver() throws {
        for (configuration,arch) in [(nil as UpdateConfiguration?,"arm64"),(try config(),"x86_64")] {
            let c=UpdateCoordinator(configuration:configuration,architecture:arch,mayCheck:{true},makeDriver:{ XCTFail("Unexpected driver");return FakeNativeDriver() })
            c.check(); XCTAssertFalse(c.hasInstallCapability)
        }
        let driver=FakeNativeDriver();var maintenance=true
        let c=UpdateCoordinator(configuration:try config(),architecture:"arm64",mayCheck:{!maintenance},makeDriver:{driver})
        c.check();XCTAssertEqual(driver.checks,0); maintenance=false;c.check();XCTAssertEqual(driver.checks,1)
    }
    func testAboutUsesNativeWithoutGitHubAndRetainsUsageErrors() async throws {
        let driver=FakeNativeDriver()
        let c=UpdateCoordinator(configuration:try config(),architecture:"arm64",mayCheck:{true},makeDriver:{driver})
        let about=AboutModel(info:.init(version:"0.6.0",build:"0.6.0"),language:.english,native:c)
        XCTAssertEqual(driver.checks,0);about.language = .vietnamese;XCTAssertEqual(driver.checks,0)
        await about.check();XCTAssertEqual(driver.checks,1);XCTAssertEqual(about.nativeState,.checking)
        driver.onState?(.available(version:"0.6.1"))
        XCTAssertEqual(about.releaseNotesURL.absoluteString,"https://github.com/longlonglong173/no-short/releases/tag/v0.6.1")
        driver.onState?(.downloading)
        XCTAssertEqual(about.releaseNotesURL.absoluteString,"https://github.com/longlonglong173/no-short/releases/tag/v0.6.1")
        driver.onState?(.current);XCTAssertEqual(about.nativeState,.current)
        for lang in AppLanguage.allCases { XCTAssertFalse(NativeUpdateState.failed(.verification).localizedDescription(language:lang).isEmpty) }
    }
}
@MainActor private final class FakeNativeDriver: NativeUpdateDriving {
    var canCheck=true;var checks=0
    var onState:(@MainActor (NativeUpdateState)->Void)?
    func checkForUpdates() throws { checks+=1 }
    func checkForUpdateInformation() throws {}
}
