import Foundation

@MainActor public final class RefreshController {
    public private(set) var snapshot: UsageSnapshot?
    public private(set) var isLoading = false
    public private(set) var notice: String?
    public private(set) var source: LogSource
    public var onChange: (@MainActor () -> Void)?
    public var isStale: Bool { failed || (snapshot?.isStale(at: now()) ?? false) }
    private let loader: any SnapshotLoading
    private let interval: Duration
    private let now: @MainActor () -> Date
    private var inFlight: Task<Void, Never>?
    private var draining: Task<Void, Never>?
    private var timer: Task<Void, Never>?
    private var generation = 0
    private var failed = false, suspended = false, stopped = false
    public init(loader: any SnapshotLoading, source: LogSource, interval: Duration = .seconds(15), now: @escaping @MainActor () -> Date = { Date() }) {
        self.loader = loader; self.source = source; self.interval = interval; self.now = now
    }
    public func refresh() {
        guard !stopped, !suspended, inFlight == nil else { return }
        isLoading = true; onChange?()
        let token = generation, source = source, loader = loader, previous = draining
        inFlight = Task { [weak self] in
            await previous?.value
            guard !Task.isCancelled else { return }
            do {
                let value = try await loader.load(source: source)
                guard let self, token == self.generation, !Task.isCancelled else { return }
                if value.status == "error" {
                    self.failed = true
                    self.notice = value.notice.map { String(UsagePresentation.cleanTitle($0).prefix(240)) } ?? SnapshotClientError.reportFailed.localizedDescription
                } else {
                    self.snapshot = value; self.failed = value.status == "stale"
                    self.notice = value.notice.map { String(UsagePresentation.cleanTitle($0).prefix(240)) }
                }
                self.complete()
            } catch {
                guard let self, token == self.generation, !Task.isCancelled else { return }
                self.failed = true
                self.notice = (error as? SnapshotClientError)?.localizedDescription ?? SnapshotClientError.reportFailed.localizedDescription
                self.complete()
            }
        }
    }
    private func complete() { isLoading = false; inFlight = nil; onChange?() }
    private func cancelRead() {
        generation += 1
        if let inFlight { inFlight.cancel(); draining = inFlight }
        inFlight = nil; isLoading = false
    }
    public func setSource(_ source: LogSource) {
        guard source != self.source else { return }
        cancelRead(); self.source = source; snapshot = nil; notice = nil; failed = false
        onChange?(); refresh()
    }
    public func suspend() { suspended = true; timer?.cancel(); timer = nil; cancelRead(); onChange?() }
    public func resume() {
        guard !stopped else { return }; suspended = false
        refresh()
        if timer == nil {
            let interval = interval
            timer = Task { [weak self] in
                while !Task.isCancelled {
                    do { try await Task.sleep(for: interval) } catch { return }
                    guard let self, !self.stopped, !self.suspended else { return }
                    self.onChange?(); self.refresh()
                }
            }
        }
    }
    public func stop() { stopped = true; suspend() }
    public func shutdown() async { stop(); await draining?.value }
}
