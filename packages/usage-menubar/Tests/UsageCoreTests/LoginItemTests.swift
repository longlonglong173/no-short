import XCTest
@testable import UsageCore

@MainActor final class LoginItemTests: XCTestCase {
    func testReadsActualSystemStateAndDoesNotPretendFailedRegistrationSucceeded() throws {
        var actual: LoginItemState = .notRegistered
        let controller = LoginItemController(readState: { actual }, register: { throw SnapshotClientError.launchFailed }, unregister: { actual = .notRegistered })
        XCTAssertEqual(controller.state, .notRegistered)
        XCTAssertThrowsError(try controller.setEnabled(true))
        XCTAssertEqual(controller.state, .notRegistered)
        actual = .requiresApproval; XCTAssertEqual(controller.state, .requiresApproval)
        try controller.setEnabled(false); XCTAssertEqual(controller.state, .notRegistered)
        actual = .notFound; XCTAssertEqual(controller.state, .notFound)
        actual = .enabled; XCTAssertEqual(controller.state, .enabled)
    }
    func testRegistrationAndRemovalReflectExternalStatus() throws {
        var actual: LoginItemState = .notRegistered
        let c = LoginItemController(readState: { actual }, register: { actual = .requiresApproval }, unregister: { throw SnapshotClientError.reportFailed })
        try c.setEnabled(true); XCTAssertEqual(c.state, .requiresApproval)
        actual = .enabled
        XCTAssertThrowsError(try c.setEnabled(false)); XCTAssertEqual(c.state, .enabled)
    }
}
