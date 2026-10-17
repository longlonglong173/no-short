import Foundation
import CoreServices
import Darwin
import UsageCore

@MainActor final class ActivityMonitor {
    private let store:ActivityStore
    private let roots:[String]
    private let onActivity:([SessionActivity]) -> Void
    private let onLogChange:() -> Void
    private var directorySource:DispatchSourceFileSystemObject?
    private var timer:Task<Void,Never>?
    private var refresh:Task<Void,Never>?
    private var stream:FSEventStreamRef?
    private var lastEvents:[SessionActivity] = []
    init(store:ActivityStore = ActivityStore(),roots:[String],onActivity:@escaping ([SessionActivity]) -> Void,onLogChange:@escaping () -> Void) {
        self.store=store; self.roots=roots; self.onActivity=onActivity; self.onLogChange=onLogChange
    }
    func start() {
        stop(); try? store.prepare()
        let fd = open(store.directory.path,O_EVTONLY)
        if fd >= 0 {
            let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor:fd,eventMask:[.write,.rename,.delete],queue:.main)
            source.setEventHandler { [weak self] in self?.reconcile() }
            source.setCancelHandler { close(fd) }; source.resume(); directorySource=source
        }
        let existing = roots.filter { FileManager.default.fileExists(atPath:$0) }
        if !existing.isEmpty {
            var context = FSEventStreamContext(version:0,info:Unmanaged.passUnretained(self).toOpaque(),retain:nil,release:nil,copyDescription:nil)
            let callback:FSEventStreamCallback = { _, info, _, paths, _, _ in
                guard let info else { return }
                let changed = unsafeBitCast(paths,to:NSArray.self) as? [String] ?? []
                MainActor.assumeIsolated {
                    let monitor = Unmanaged<ActivityMonitor>.fromOpaque(info).takeUnretainedValue()
                    if changed.contains(where: { $0.hasSuffix(".jsonl") && ($0.contains("/sessions/") || $0.contains("/projects/")) }) { monitor.scheduleRefresh() }
                }
            }
            stream = FSEventStreamCreate(nil,callback,&context,existing as CFArray,FSEventStreamEventId(kFSEventStreamEventIdSinceNow),0.3,FSEventStreamCreateFlags(kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagWatchRoot))
            if let stream { FSEventStreamSetDispatchQueue(stream,.main); FSEventStreamStart(stream) }
        }
        reconcile()
        timer = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for:.seconds(1)) } catch { return }
                self?.reconcile()
            }
        }
    }
    private func reconcile() {
        let events = store.events()
        if events != lastEvents { lastEvents=events; onActivity(events); scheduleRefresh() }
    }
    private func scheduleRefresh() {
        guard refresh == nil else { return }
        refresh = Task { [weak self] in
            do { try await Task.sleep(for:.seconds(2)) } catch { return }
            guard let self else { return }; self.refresh=nil; self.onLogChange()
        }
    }
    func stop() {
        timer?.cancel(); timer=nil; refresh?.cancel(); refresh=nil
        directorySource?.cancel(); directorySource=nil
        if let stream { FSEventStreamStop(stream); FSEventStreamInvalidate(stream); FSEventStreamRelease(stream); self.stream=nil }
    }
}
