import AppKit
import ServiceManagement
import UsageCore

@MainActor final class LoginItemManager {
    private let controller = LoginItemController(readState: {
        switch SMAppService.mainApp.status {
        case .enabled: .enabled
        case .notRegistered: .notRegistered
        case .requiresApproval: .requiresApproval
        case .notFound: .notFound
        @unknown default: .notFound
        }
    }, register: { try SMAppService.mainApp.register() }, unregister: { try SMAppService.mainApp.unregister() })
    var state: LoginItemState { controller.state }
    func setEnabled(_ enabled: Bool) throws { try controller.setEnabled(enabled) }
    func openSettings() { SMAppService.openSystemSettingsLoginItems() }
}
