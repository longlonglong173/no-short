import XCTest
import CryptoKit
@testable import UsageCore
@testable import NoShortUsageMenuBar

@MainActor final class DailyUpdateTests: XCTestCase {
    private func config() throws -> UpdateConfiguration {try .init(feedURL:UpdateConfiguration.productionFeed,publicKey:Curve25519.Signing.PrivateKey().publicKey.rawRepresentation.base64EncodedString())}
    func testAutomaticProbeIsLimitedTo24HoursAcrossRelaunchAndDoesNotUseInstallCheck() throws {
        let name=UUID().uuidString,defaults=UserDefaults(suiteName:name)!;defer{defaults.removePersistentDomain(forName:name)}
        var now=Date(timeIntervalSince1970:1_000_000);let key=try config(),driver=DailyDriver()
        let make={UpdateCoordinator(configuration:key,architecture:"arm64",mayCheck:{true},makeDriver:{driver},defaults:defaults,installedVersion:"0.6.1",now:{now})}
        let first=make();first.checkIfDue();first.checkIfDue();XCTAssertEqual(driver.probes,1);XCTAssertEqual(driver.installs,0)
        driver.onState?(.idle);now=now.addingTimeInterval(3600);let relaunched=make();relaunched.checkIfDue();XCTAssertEqual(driver.probes,1)
        now=now.addingTimeInterval(82800);relaunched.checkIfDue();XCTAssertEqual(driver.probes,2)
    }
    func testOffManualRetryAndMaintenanceRemainIndependent() throws {
        let driver=DailyDriver();var safe=false
        let c=UpdateCoordinator(configuration:try config(),architecture:"arm64",mayCheck:{safe},makeDriver:{driver},installedVersion:"0.6.1")
        c.checkIfDue();XCTAssertEqual(driver.probes,0);safe=true;c.setAutomaticChecksEnabled(false);c.checkIfDue();XCTAssertEqual(driver.probes,0)
        c.check();XCTAssertEqual(driver.installs,1);driver.onState?(.failed(.network));c.check();XCTAssertEqual(driver.installs,2)
        driver.onState?(.idle);c.setAutomaticChecksEnabled(true);c.checkIfDue();XCTAssertEqual(driver.probes,0,"Manual check also spaces automatic attempts")
    }
    func testVerifiedAvailabilitySurvivesProbeCompletionCancelAndRelaunchButNotChannelChange() throws {
        let name=UUID().uuidString,defaults=UserDefaults(suiteName:name)!;defer{defaults.removePersistentDomain(forName:name)}
        let key=try config(),driver=DailyDriver(),now=Date(timeIntervalSince1970:1_000_000)
        let c=UpdateCoordinator(configuration:key,architecture:"arm64",mayCheck:{true},makeDriver:{driver},defaults:defaults,installedVersion:"0.6.1",now:{now})
        c.checkIfDue();driver.onState?(.available(version:"0.6.2"));driver.onState?(.idle)
        XCTAssertEqual(c.releaseVersion,"0.6.2");XCTAssertEqual(c.lastCheckedAt,now);XCTAssertTrue(c.canCheck)
        c.check();driver.onState?(.idle);XCTAssertEqual(c.releaseVersion,"0.6.2");XCTAssertTrue(c.canCheck)
        let restored=UpdateCoordinator(configuration:key,architecture:"arm64",mayCheck:{true},makeDriver:{driver},defaults:defaults,installedVersion:"0.6.1",now:{now})
        XCTAssertEqual(restored.releaseVersion,"0.6.2");XCTAssertEqual(restored.lastCheckedAt,now)
        let changed=UpdateCoordinator(configuration:try config(),architecture:"arm64",mayCheck:{true},makeDriver:{driver},defaults:defaults,installedVersion:"0.6.1",now:{now})
        XCTAssertNil(changed.releaseVersion);XCTAssertNil(changed.lastCheckedAt)
    }
    func testFailureNeverClaimsSuccessfulCheckAndFutureClockRecoversWithoutRequestLoop() throws {
        var now=Date(timeIntervalSince1970:1_000_000);let driver=DailyDriver()
        let c=UpdateCoordinator(configuration:try config(),architecture:"arm64",mayCheck:{true},makeDriver:{driver},installedVersion:"0.6.1",now:{now})
        c.checkIfDue();driver.onState?(.failed(.network));XCTAssertNil(c.lastCheckedAt);XCTAssertNil(c.releaseVersion)
        c.checkIfDue();XCTAssertEqual(driver.probes,1);now=now.addingTimeInterval(-600);c.checkIfDue();XCTAssertEqual(driver.probes,2)
        driver.onState?(.idle);c.checkIfDue();XCTAssertEqual(driver.probes,2)
        driver.onState?(.current);XCTAssertEqual(c.releaseVersion,"0.6.1");XCTAssertEqual(c.lastCheckedAt,now)
    }
}
@MainActor private final class DailyDriver:NativeUpdateDriving {
    var canCheck=true,probes=0,installs=0
    var onState:(@MainActor (NativeUpdateState)->Void)?
    func checkForUpdates() throws {installs+=1}
    func checkForUpdateInformation() throws {probes+=1}
}
