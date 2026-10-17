import Foundation
import Darwin

public protocol SnapshotLoading: Sendable {
    func load(source: LogSource) async throws -> UsageSnapshot
}
public enum SnapshotClientError: Error, Equatable, LocalizedError, Sendable {
    case missingRuntime, launchFailed, timeout, outputTooLarge, invalidSnapshot, reportFailed
    public var errorDescription: String? {
        switch self {
        case .missingRuntime: "Thiếu runtime. Hãy cài lại No Short Usage."
        case .launchFailed: "Không khởi động được bộ đọc Usage."
        case .timeout: "Đọc log quá lâu. Hãy thử lại hoặc chọn thư mục log khác."
        case .outputTooLarge: "Báo cáo quá lớn để hiển thị. Hãy chọn nguồn log nhỏ hơn."
        case .invalidSnapshot: "Dữ liệu Usage không tương thích. Hãy kiểm tra phiên bản runtime."
        case .reportFailed: "Không đọc được Usage. Hãy kiểm tra quyền truy cập log và thử lại."
        }
    }
}
public struct SnapshotClient: SnapshotLoading {
    let workerURL, helperURL: URL
    let timeout: Duration
    let maxOutputBytes: Int
    public init(workerURL: URL, helperURL: URL, timeout: Duration = .seconds(90), maxOutputBytes: Int = 16_777_216) {
        self.workerURL = workerURL; self.helperURL = helperURL; self.timeout = timeout; self.maxOutputBytes = maxOutputBytes
    }
    public func load(source: LogSource) async throws -> UsageSnapshot {
        try Task.checkCancellation()
        guard FileManager.default.isExecutableFile(atPath: helperURL.path) else { throw SnapshotClientError.missingRuntime }
        let run = SnapshotRun(client: self, source: source)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { run.start($0) }
        } onCancel: { run.cancel() }
    }
}

// All mutable state, including cancellation before start, is owned by this serial queue.
private final class SnapshotRun: @unchecked Sendable {
    let queue = DispatchQueue(label: "dev.noshort.usage.snapshot")
    let client: SnapshotClient
    let source: LogSource
    let process = Process()
    let output = Pipe(), errors = Pipe()
    var continuation: CheckedContinuation<UsageSnapshot, any Error>?
    var timer: DispatchSourceTimer?
    var data = Data()
    var errorBytes = Data()
    var outputEOF = false, errorsEOF = false, cancelled = false, finished = false, launched = false
    var handshake = false
    var started = ContinuousClock.now
    var cleanupAt: ContinuousClock.Instant?
    var exitAt: ContinuousClock.Instant?
    var failure: (any Error)?
    let marker = Data("NO_SHORT_WORKER_READY\n".utf8)
    init(client: SnapshotClient, source: LogSource) { self.client = client; self.source = source }
    func cancel() { queue.async { self.cancelled = true; if self.continuation != nil { self.beginCleanup(CancellationError()) } } }
    func start(_ continuation: CheckedContinuation<UsageSnapshot, any Error>) {
        queue.async {
            self.continuation = continuation
            guard !self.cancelled else { self.finish(.failure(CancellationError())); return }
            self.process.executableURL = self.client.workerURL
            self.process.arguments = ["--snapshot-worker", self.client.helperURL.path]
            var environment = ProcessInfo.processInfo.environment
            environment["CODEX_HOME"] = self.source.rootsEnvironment
            self.process.environment = environment
            self.process.standardOutput = self.output; self.process.standardError = self.errors
            self.process.standardInput = FileHandle.nullDevice
            do { try self.process.run(); self.launched = true }
            catch { self.finish(.failure(SnapshotClientError.launchFailed)); return }
            try? self.output.fileHandleForWriting.close(); try? self.errors.fileHandleForWriting.close()
            for pipe in [self.output, self.errors] {
                let fd = pipe.fileHandleForReading.fileDescriptor
                _ = fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK)
            }
            self.started = .now
            let timer = DispatchSource.makeTimerSource(queue: self.queue)
            self.timer = timer
            timer.schedule(deadline: .now(), repeating: .milliseconds(20))
            timer.setEventHandler { self.tick() }; timer.resume()
        }
    }
    func drain(_ pipe: Pipe, stdout: Bool) {
        var bytes = [UInt8](repeating: 0, count: 65_536)
        // Bound each turn even if a child floods stderr forever.
        for _ in 0..<8 {
            let n = Darwin.read(pipe.fileHandleForReading.fileDescriptor, &bytes, bytes.count)
            if n == 0 { if stdout { outputEOF = true } else { errorsEOF = true }; return }
            if n < 0 {
                if errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR { beginCleanup(SnapshotClientError.reportFailed) }
                return
            }
            if stdout {
                if data.count + n > client.maxOutputBytes + marker.count { beginCleanup(SnapshotClientError.outputTooLarge); return }
                data.append(contentsOf: bytes.prefix(n))
                if !handshake && data.count >= marker.count {
                    guard data.starts(with: marker) else { beginCleanup(SnapshotClientError.launchFailed); return }
                    handshake = true
                }
            } else if errorBytes.count < 65_536 {
                errorBytes.append(contentsOf: bytes.prefix(min(n, 65_536 - errorBytes.count)))
            }
        }
    }
    func signalGroup(_ signal: Int32) {
        guard launched else { return }
        let pid = process.processIdentifier
        // The worker establishes a private group before it can exec/spawn the report.
        if handshake || getpgid(pid) == pid { _ = kill(-pid, signal) }
        else if process.isRunning { _ = kill(pid, signal) }
    }
    func beginCleanup(_ error: any Error) {
        guard !finished, failure == nil else { return }
        failure = error; cleanupAt = .now; signalGroup(SIGTERM)
    }
    func tick() {
        guard !finished else { return }
        if !outputEOF { drain(output, stdout: true) }
        if !errorsEOF { drain(errors, stdout: false) }
        if let cleanupAt {
            if ContinuousClock.now - cleanupAt >= .milliseconds(500) {
                signalGroup(SIGKILL); finish(.failure(failure!))
            }
            return
        }
        if ContinuousClock.now - started >= client.timeout { beginCleanup(SnapshotClientError.timeout); return }
        guard !process.isRunning else { return }
        if outputEOF && errorsEOF {
            guard process.terminationStatus == 0 else { finish(.failure(SnapshotClientError.reportFailed)); return }
            guard handshake else { finish(.failure(SnapshotClientError.launchFailed)); return }
            do { finish(.success(try UsageSnapshot.decode(Data(data.dropFirst(marker.count))))) }
            catch { finish(.failure(SnapshotClientError.invalidSnapshot)) }
        } else {
            // A helper that exits while descendants hold pipes must not leave them behind.
            if exitAt == nil { exitAt = .now; signalGroup(SIGTERM) }
            if let exitAt, ContinuousClock.now - exitAt >= .milliseconds(500) { signalGroup(SIGKILL) }
        }
    }
    func finish(_ result: Result<UsageSnapshot, any Error>) {
        guard !finished else { return }; finished = true
        timer?.setEventHandler {}; timer?.cancel(); timer = nil
        for handle in [output.fileHandleForReading, output.fileHandleForWriting, errors.fileHandleForReading, errors.fileHandleForWriting] { try? handle.close() }
        let callback = continuation; continuation = nil
        callback?.resume(with: result)
    }
}
