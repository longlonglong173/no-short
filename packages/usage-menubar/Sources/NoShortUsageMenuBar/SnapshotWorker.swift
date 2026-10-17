import Foundation
import Darwin

// Internal process mode, before AppKit starts. It creates an isolated group so
// the GUI can cancel the helper and ccusage together without touching Codex.
func runSnapshotWorker(helper: String) -> Never {
    guard helper.hasPrefix("/"), getppid() > 1,
          getpgrp() == getpid() || setpgid(0, 0) == 0 else { exit(70) }
    let marker = "NO_SHORT_WORKER_READY\n"
    let count = marker.withCString { Darwin.write(STDOUT_FILENO, $0, strlen($0)) }
    guard count == marker.utf8.count, getppid() > 1 else { exit(70) }
    let a = strdup(helper), b = strdup("--snapshot")
    var args = [a, b, nil]
    helper.withCString { path in args.withUnsafeMutableBufferPointer { _ = execv(path, $0.baseAddress!) } }
    free(a); free(b); exit(71)
}
