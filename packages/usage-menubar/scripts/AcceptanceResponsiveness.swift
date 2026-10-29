import Foundation

// Explicit synthetic acceptance runner, compiled with the actual UsageCore sources.
@main @MainActor struct AcceptanceResponsiveness {
    static func main() async throws {
        let args=CommandLine.arguments
        guard args.count==6,args[1].contains("/.artifacts/release-recovery/task5-performance-") else { fatalError("Private performance fixture required") }
        let root=URL(fileURLWithPath:args[1]),worker=URL(fileURLWithPath:args[2]),helper=URL(fileURLWithPath:args[3])
        let expectedCount=Int(args[4])!,expectOverflow=args[5]=="expected-overflow"
        let source=LogSource(rootsEnvironment:root.appendingPathComponent("codex").path,claudeRootsEnvironment:root.appendingPathComponent("claude").path)
        let client=SnapshotClient(workerURL:worker,helperURL:helper)
        var measurements:[[String:Any]]=[]
        for n in 0..<3 {
            let task=Task { try await client.load(source:source) }
            try await Task.sleep(for:.milliseconds(20))
            let start=ContinuousClock.now;task.cancel()
            do { _ = try await task.value;fatalError("Cancellation finished as success") }
            catch is CancellationError {} // The real client must propagate cancellation after cleanup.
            let elapsed=ContinuousClock.now-start
            guard elapsed < .seconds(2) else { fatalError("Cancellation exceeded2seconds") }
            measurements.append(["kind":"actual-client-cancel","iteration":n,"duration":String(describing:elapsed)])
        }
        let controller=RefreshController(loader:client,source:source)
        var starts=0;controller.onChange={ if controller.isLoading { starts+=1 } }
        for _ in 0..<20 { controller.refresh() }
        while controller.isLoading { try await Task.sleep(for:.milliseconds(10)) }
        guard starts==1 else { fatalError("Repeated refresh did not coalesce") }
        if expectOverflow {
            guard controller.snapshot==nil,controller.notice==SnapshotClientError.outputTooLarge.localizedDescription else { fatalError("Oversized snapshot did not report its explicit bounded-output error") }
            measurements.append(["kind":"actual-controller-bounded-output-refusal","requests":20,"starts":starts,"notice":controller.notice!])
        } else {
            guard controller.snapshot?.sessions.count==expectedCount else { fatalError("Repeated refresh failed: sessions=\(controller.snapshot?.sessions.count ?? -1), notice=\(controller.notice ?? "none")") }
            measurements.append(["kind":"actual-controller-repeated-refresh","requests":20,"starts":starts,"sessions":expectedCount])
        }
        controller.refresh();try await Task.sleep(for:.milliseconds(20))
        let start=ContinuousClock.now;await controller.shutdown()
        let elapsed=ContinuousClock.now-start
        guard !controller.isLoading,elapsed < .seconds(2) else { fatalError("Controller shutdown did not drain") }
        measurements.append(["kind":"actual-controller-shutdown","duration":String(describing:elapsed)])
        let data=try JSONSerialization.data(withJSONObject:measurements,options:[.prettyPrinted,.sortedKeys])
        try data.write(to:root.appendingPathComponent("responsiveness.json"));print(String(decoding:data,as:UTF8.self))
    }
}
