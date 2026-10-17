public enum LoginItemState: Sendable { case enabled, notRegistered, requiresApproval, notFound }
@MainActor public final class LoginItemController {
    private let readState: () -> LoginItemState
    private let register, unregister: () throws -> Void
    public var state: LoginItemState { readState() }
    public init(readState: @escaping () -> LoginItemState, register: @escaping () throws -> Void, unregister: @escaping () throws -> Void) {
        self.readState = readState; self.register = register; self.unregister = unregister
    }
    public func setEnabled(_ enabled: Bool) throws {
        if enabled { try register() } else { try unregister() }
    }
}
