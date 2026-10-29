#if NO_SHORT_UPDATER_E2E
import AppKit
import UsageCore
import Darwin
import ObjectiveC

/// Compiled only for owned, isolated test copies. Never present in a normal build.
@MainActor enum UpdaterE2ESupport {
    static var root: URL {
        guard let raw=Bundle.main.object(forInfoDictionaryKey:"NS14HarnessRoot") as? String,
              raw.contains("/.artifacts/ns14-e2e/"),
              let id=Bundle.main.bundleIdentifier,id.hasPrefix("dev.noshort.usage.updater-test."),
              let path=Bundle.main.bundleURL.resolvingSymlinksInPath().path.removingPercentEncoding,
              path.hasPrefix(raw+"/install/") || path.hasPrefix(raw+"/payload/"),
              URL(fileURLWithPath:raw).resolvingSymlinksInPath().path==raw else {
            fputs("Refusing non-isolated updater test bundle\n",stderr);exit(74)
        }
        return URL(fileURLWithPath:raw)
    }
    static func bootstrap() {
        let r=root.path
        let worker = CommandLine.arguments.contains("--snapshot-worker")
        for (key,value) in ["HOME":r+"/home","CFFIXED_USER_HOME":r+"/home","CODEX_HOME":r+"/codex","CLAUDE_CONFIG_DIR":r+"/claude","XDG_CACHE_HOME":r+"/xdg","NO_SHORT_USAGE_CCUSAGE":Bundle.main.resourceURL!.appendingPathComponent("runtime/ccusage").path,"NO_SHORT_USAGE_PRICING_FILE":r+"/pricing.json","NO_SHORT_USAGE_CLAUDE_ROOTS":r+"/claude","NO_SHORT_USAGE_CACHE_DIR":r+"/cache","NO_SHORT_USAGE_ACTIVITY_DIR":r+"/activity","NO_SHORT_USAGE_CONTEXT_DIR":r+"/context","NO_SHORT_USAGE_OFFLINE":"1"] {
            if worker && ["CODEX_HOME","NO_SHORT_USAGE_CLAUDE_ROOTS"].contains(key), let requested=ProcessInfo.processInfo.environment[key] {
                guard (key != "CODEX_HOME" || !requested.isEmpty), requested.split(separator:",").allSatisfy({ isolatedSource(String($0)) }) else { fputs("Refusing non-private worker source\n",stderr);exit(74) }
            } else { setenv(key,value,1) }
        }
        try? Data("E2E-private-bootstrap".utf8).write(to:root.appendingPathComponent("private-bootstrap"),options:.atomic)
        let preferences=root.appendingPathComponent("test-preferences.plist")
        let initial = Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String == Bundle.main.object(forInfoDictionaryKey:"NS14InitialVersion") as? String
        let firstLaunch = !FileManager.default.fileExists(atPath:preferences.path)
        NS14PrivateDefaults.install(file:preferences)
        // B must expose what survived replacement BEFORE anything can seed it.
        if !initial {
            let preserved = preservedPreferences()
            try? PropertyListSerialization.data(fromPropertyList:preserved,format:.xml,options:0).write(to:root.appendingPathComponent("preservation-before-bootstrap.plist"),options:.atomic)
        }
        if initial && firstLaunch {
            UserDefaults.standard.set([r+(Bundle.main.object(forInfoDictionaryKey:"NS14CustomSources") as? Bool == true ? "/alternate" : "/codex")],forKey:"selectedCodexHomes")
            UserDefaults.standard.set([r+"/claude"],forKey:"selectedClaudeHomes")
            UserDefaults.standard.set(Bundle.main.object(forInfoDictionaryKey:"NS14Language") as? String ?? "en",forKey:"usageLanguage")
            UserDefaults.standard.set("NS14-KEEP",forKey:"NS14Sentinel")
            UserDefaults.standard.set("http://127.0.0.1:9/forbidden-legacy-feed.xml",forKey:"SUFeedURL")
            let budget = Data(#"{"rules":[{"provider":"all","period":"month","limitUSD":23.5}],"notificationsEnabled":false}"#.utf8)
            UserDefaults.standard.set(budget,forKey:"usageBudgetConfigurationV1")
            UserDefaults.standard.set(Bundle.main.object(forInfoDictionaryKey:"NS14AutomaticChecks") as? Bool ?? true,forKey:"usageAutomaticUpdateChecksEnabled")
            UserDefaults.standard.set(false,forKey:"usageContextNotificationsEnabled")
            UserDefaults.standard.set(false,forKey:"usageInsightNotificationsEnabled")
            UserDefaults.standard.synchronize()
            try? PropertyListSerialization.data(fromPropertyList:preservedPreferences(),format:.binary,options:0).write(to:root.appendingPathComponent("expected-preferences.plist"),options:.atomic)
        }
    }
    private static func isolatedSource(_ path:String) -> Bool {
        let url=URL(fileURLWithPath:path).standardizedFileURL
        guard url.path==path,url.resolvingSymlinksInPath().path==path else { return false }
        var owned=root.path
        if !path.hasPrefix(owned+"/") {
            let prefix=root.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("release-recovery").path+"/task5-performance-"
            guard path.hasPrefix(prefix),let slash=path.dropFirst(prefix.count).firstIndex(of:"/") else { return false }
            owned=String(path[..<slash])
        }
        guard let attributes=try? FileManager.default.attributesOfItem(atPath:owned),
              (attributes[.ownerAccountID] as? NSNumber)?.uint32Value==getuid(),
              let permissions=attributes[.posixPermissions] as? NSNumber,permissions.intValue & 0o077 == 0,
              (try? FileManager.default.attributesOfItem(atPath:path)[.type] as? FileAttributeType) == .typeDirectory else { return false }
        return true
    }
    static func preservedPreferences() -> [String:Any] {
        let keys=["selectedCodexHomes","selectedClaudeHomes","usageLanguage","NS14Sentinel","usageBudgetConfigurationV1","usageAutomaticUpdateChecksEnabled"]
        return Dictionary(uniqueKeysWithValues:keys.compactMap { key in UserDefaults.standard.object(forKey:key).map { (key,$0) } })
    }
    static var feedURL: String {
        _ = root
        guard let value=Bundle.main.object(forInfoDictionaryKey:"SUFeedURL") as? String,
              let url=URL(string:value), url.scheme=="http", url.host=="127.0.0.1",
              let port=url.port, port>=1024, url.path=="/feed.xml", url.query==nil, url.fragment==nil, url.user==nil else { exit(77) }
        return value
    }
    static var configuration: UpdateConfiguration? {
        try? UpdateConfiguration(feedURL:UpdateConfiguration.productionFeed,publicKey:Bundle.main.object(forInfoDictionaryKey:"SUPublicEDKey") as? String ?? "")
    }
    private static var heldMaintenance=false
    static func holdMaintenanceIfRequested(_ controller:RefreshController) {
        guard !heldMaintenance,Bundle.main.object(forInfoDictionaryKey:"NS14HoldMaintenance") as? Bool == true else{return}
        heldMaintenance=true
        Task {
            _ = try? await controller.withMaintenance {
                try Data(String(Date().timeIntervalSince1970).utf8).write(to:root.appendingPathComponent("maintenance-start"))
                try await Task.sleep(for:.seconds(3))
                try Data(String(Date().timeIntervalSince1970).utf8).write(to:root.appendingPathComponent("maintenance-end"))
            }
        }
    }
    private static var probeRecorded=false
    static func recordProbeIfComplete(_ model: AboutModel) {
        guard !probeRecorded,Bundle.main.object(forInfoDictionaryKey:"NS14ProbeOnly") as? Bool == true,
              let native=model.native,!native.state.isBusy else { return }
        let failed:Bool
        if case .failed = native.state { failed=true } else { failed=false }
        guard native.lastCheckedAt != nil || failed else { return }
        probeRecorded=true
        let summary=model.updatePresentation
        let json:[String:Any] = ["version":model.info.version ?? "", "latestVersion":native.releaseVersion ?? "", "canCheck":native.canCheck,"failed":failed,"checked":native.lastCheckedAt != nil,"outdated":summary.isOutdated,"status":summary.statusText(language:model.language)]
        do {try JSONSerialization.data(withJSONObject:json).write(to:root.appendingPathComponent("probe-result.json"),options:.atomic)}catch{exit(78)}
        native.checkIfDue();native.checkIfDue()
    }
    static func recordSnapshot(_ snapshot:UsageSnapshot?,source:LogSource) {
        guard let snapshot else { return }
        let codex=snapshot.sessions.filter { $0.usageProvider == .codex }
        let value:[String:Any]=["version":Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String ?? "", "status":snapshot.status,"roots":source.rootsEnvironment,"codexSessions":codex.count,"codexTokens":codex.reduce(0) { $0+$1.tokens.total }]
        try? JSONSerialization.data(withJSONObject:value,options:.prettyPrinted).write(to:root.appendingPathComponent("snapshot-observed.json"),options:.atomic)
    }
    private static var states:[String]=[]
    static func recordUpdateState(_ state:NativeUpdateState?) {
        guard let state else { return }
        states.append(String(describing:state))
        try? JSONSerialization.data(withJSONObject:states,options:.prettyPrinted).write(to:root.appendingPathComponent("sdk-states.json"),options:.atomic)
    }
    static func recordLaunch() {
        let expected=(try? Data(contentsOf:root.appendingPathComponent("expected-preferences.plist"))).flatMap { try? PropertyListSerialization.propertyList(from:$0,format:nil) as? [String:Any] }
        let preserved=expected.map { NSDictionary(dictionary:$0).isEqual(to:preservedPreferences()) } ?? false
        let json:[String:Any] = ["version":Bundle.main.object(forInfoDictionaryKey:"CFBundleVersion") as? String ?? "", "bundleID":Bundle.main.bundleIdentifier ?? "", "pid":getpid(), "path":Bundle.main.bundleURL.path,"prefsPreserved":preserved,"prefsPath":root.appendingPathComponent("test-preferences.plist").path,"time":Date().timeIntervalSince1970]
        do {try JSONSerialization.data(withJSONObject:json).write(to:root.appendingPathComponent("ready.json"),options:.atomic)}catch{exit(75)}
    }
}
/// Test-process-only preferences router: CFFIXED_USER_HOME alone is ignored by cfprefsd
/// on current macOS. SDK and native app use this private property-list store instead.
private final class NS14PrivateDefaults: UserDefaults, @unchecked Sendable {
    nonisolated(unsafe) private static var active: NS14PrivateDefaults?
    private let file:URL
    private let lock=NSRecursiveLock()
    private var values:[String:Any]
    private var registered:[String:Any]=[:]
    private init(file:URL) {
        self.file=file
        values=(try? Data(contentsOf:file)).flatMap { try? PropertyListSerialization.propertyList(from:$0,format:nil) as? [String:Any] } ?? [:]
        super.init(suiteName:"NS14-in-memory-only")!
    }
    static func install(file:URL) {
        guard active==nil else{return}
        active=NS14PrivateDefaults(file:file)
        guard let original=class_getClassMethod(UserDefaults.self,NSSelectorFromString("standardUserDefaults")),
              let replacement=class_getClassMethod(NS14PrivateDefaults.self,#selector(redirectedStandard)) else { exit(76) }
        method_exchangeImplementations(original,replacement)
    }
    @objc private class func redirectedStandard()->UserDefaults { active! }
    override func object(forKey key:String)->Any? { lock.lock();defer{lock.unlock()};return values[key] ?? registered[key] }
    override func set(_ value:Any?,forKey key:String) {
        lock.lock();defer{lock.unlock()};willChangeValue(forKey:key);values[key]=value;_ = synchronize();didChangeValue(forKey:key)
    }
    override func removeObject(forKey key:String) { set(nil,forKey:key) }
    override func register(defaults:[String:Any]) { lock.lock();defer{lock.unlock()};registered.merge(defaults){old,_ in old} }
    override func dictionaryRepresentation()->[String:Any] { lock.lock();defer{lock.unlock()};return registered.merging(values){_,new in new} }
    override func synchronize()->Bool {
        lock.lock();defer{lock.unlock()}
        do {try PropertyListSerialization.data(fromPropertyList:values,format:.binary,options:0).write(to:file,options:.atomic);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path);return true}catch{return false}
    }
}
#endif
