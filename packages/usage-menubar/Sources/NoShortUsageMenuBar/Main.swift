import Foundation
import UsageCore
@main struct Main {
    static func main() {
        let args = CommandLine.arguments
        if args.count == 3 && args[1] == "--snapshot-worker" { runSnapshotWorker(helper: args[2]) }
    }
}
