import Foundation

public struct SessionGrouping: Codable, Sendable {
    public struct Project: Codable, Sendable {
        public let id, label, source, confidence: String
        var valid: Bool {
            id.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil && !label.isEmpty && label.count <= 160 &&
            label.range(of:"[\\\\/\\x00-\\x1f\\x7f]",options:.regularExpression) == nil &&
            ["git-common-dir","recorded-directory"].contains(source) && ["verified","recorded"].contains(confidence) && ((source == "git-common-dir") == (confidence == "verified"))
        }
    }
    public struct Parent: Codable, Sendable {
        public let sessionKey, source: String
        var valid: Bool { sessionKey.count <= 200 && sessionKey.range(of:"^[A-Za-z0-9_-]+$",options:.regularExpression) != nil && source == "codex-session-meta" }
    }
    public var project: Project?
    public var parent: Parent?
    public var issues: [String]?
    var valid: Bool { (project?.valid ?? true) && (parent?.valid ?? true) && (issues?.count ?? 0) <= 2 && (issues ?? []).allSatisfy{["conflicting-project","conflicting-parent"].contains($0)} }
    static func merge(_ a: Self?, _ b: Self?) -> Self? {
        guard let a else { return b };guard let b else { return a }
        var flags=Set((a.issues ?? []) + (b.issues ?? []))
        if let x=a.project, let y=b.project, x.id != y.id { flags.insert("conflicting-project") }
        if let x=a.parent, let y=b.parent, x.sessionKey != y.sessionKey { flags.insert("conflicting-parent") }
        return Self(project:flags.contains("conflicting-project") ? nil : a.project ?? b.project,
            parent:flags.contains("conflicting-parent") ? nil : a.parent ?? b.parent,issues:flags.isEmpty ? nil : flags.sorted())
    }
}
public struct UsageGroupMember: Codable, Sendable, Identifiable {
    public let id, title: String
    public let provider: UsageProvider
    public let kind: String
    public let depth: Int
    public let aggregate: UsageAggregate
}
public struct UsageProjectGroup: Sendable, Identifiable {
    public let id, label, source, confidence: String
    public let aggregate: UsageAggregate
    public let sessions: [UsageGroupMember]
}
public struct UsageWorkGroup: Sendable, Identifiable {
    public let id, title: String
    public let provider: UsageProvider
    public let aggregate: UsageAggregate
    public let sessions: [UsageGroupMember]
    public let issues: [String]
}
public struct UsageGroupingProjection: Sendable {
    public let projects: [UsageProjectGroup]
    public let works: [UsageWorkGroup]
    public let aggregate, sourceAggregate: UsageAggregate
    public let reconciled: Bool
    public let reconciliationIssue: String?
}
public enum UsageGrouping {
    public static func project(_ snapshot: UsageSnapshot, provider: String, range: UsageHistoryRange) -> UsageGroupingProjection? {
        guard let exact=UsageHistory.sessionUsageForRange(snapshot,provider:provider,range:range),
              let source=UsageHistory.project(snapshot,provider:provider,range:range), let empty=UsageHistory.sum([]) else { return nil }
        if exact.reconciliationIssue == "tokens" { return UsageGroupingProjection(projects:[],works:[],aggregate:exact.aggregate,sourceAggregate:source.aggregate,reconciled:false,reconciliationIssue:"tokens") }
        func key(_ provider:UsageProvider,_ id:String)->String { provider.rawValue + "\0" + id }
        func canonicalKey(_ id:String)->String { id.range(of:"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$",options:.regularExpression) == nil ? id : id.lowercased() }
        var metadata:[String:SessionUsage]=[:], grouping:[String:SessionGrouping]=[:], keyIndex:[String:Set<String>]=[:]
        for session in snapshot.sessions {
            let id=key(session.usageProvider,session.id);metadata[id]=session
            if let merged=SessionGrouping.merge(grouping[id],session.grouping) { grouping[id]=merged }
            if let raw=session.sessionKey { keyIndex[key(session.usageProvider,canonicalKey(raw)),default:[]].insert(id) }
        }
        var direct:[String:UsageAggregate]=[:], unknown:[String:(String,UsageProvider)]=[:]
        for row in exact.sessions {
            let id=key(row.provider,row.sessionId)
            if direct[id] == nil { direct[id]=row.aggregate }
            if metadata[id] == nil { unknown[id]=(row.sessionId,row.provider) }
        }
        let ids=Set(metadata.keys).union(unknown.keys)
        var parents:[String:String]=[:],issues:[String:[String]]=[:]
        for id in ids {
            guard let session=metadata[id] else { issues[id]=[];continue }
            let data=grouping[id];var flags=data?.issues ?? []
            if let parent=data?.parent, !flags.contains("conflicting-parent") {
                let candidates=keyIndex[key(session.usageProvider,canonicalKey(parent.sessionKey))] ?? []
                if candidates.count == 1, let parent=candidates.first {
                    if parent == id { flags.append("self-parent") } else { parents[id]=parent }
                } else { flags.append(candidates.isEmpty ? "missing-parent" : "ambiguous-parent") }
            } else if session.kind != "main", !flags.contains("conflicting-parent") { flags.append("missing-lineage") }
            issues[id]=flags
        }
        var resolved:[String:(root:String,depth:Int)]=[:]
        for id in ids.sorted() {
            var chain:[String]=[], seen=Set<String>(), cursor=id, issue:String?
            while true {
                if !seen.insert(cursor).inserted { issue="cycle";break }
                chain.append(cursor)
                if !(issues[cursor] ?? []).isEmpty { issue=cursor == id ? nil : "unresolved-ancestor";break }
                guard let parent=parents[cursor] else { break };cursor=parent
            }
            if issue != nil || !(issues[cursor] ?? []).isEmpty {
                if let issue { issues[id,default:[]].append(issue) };resolved[id]=(id,0)
            } else { resolved[id]=(cursor,chain.count-1) }
        }
        func member(_ id:String,_ depth:Int=0)->UsageGroupMember {
            let s=metadata[id]
            return UsageGroupMember(id:s?.id ?? unknown[id]!.0,title:s?.title ?? "Phiên chưa xác định",provider:s?.usageProvider ?? unknown[id]!.1,
                kind:s?.kind ?? "unknown",depth:depth,aggregate:direct[id] ?? empty)
        }
        var projectMembers:[String:[String]]=[:],projectInfo:[String:SessionGrouping.Project]=[:],workMembers:[String:Set<String>]=[:]
        for id in direct.keys.sorted() {
            let data=grouping[id],p=data?.issues?.contains("conflicting-project") == true ? nil : data?.project
            let projectId=p?.id ?? "unknown";projectMembers[projectId,default:[]].append(id)
            if let p { projectInfo[projectId]=p }
            let root=resolved[id]!.root;workMembers[root,default:[]].insert(id)
            if root != id {
                var cursor=parents[id]
                while let ancestor=cursor { if workMembers[root,default:[]].contains(ancestor) { break };workMembers[root,default:[]].insert(ancestor);if ancestor == root { break };cursor=parents[ancestor] }
            }
        }
        var projects:[UsageProjectGroup]=[],works:[UsageWorkGroup]=[]
        for (id,members) in projectMembers {
            guard let sum=UsageHistory.sum(members.compactMap{direct[$0]}) else { return nil };let p=projectInfo[id]
            projects.append(.init(id:id,label:p?.label ?? "Dự án chưa xác định",source:p?.source ?? "unknown",confidence:p?.confidence ?? "unknown",aggregate:sum,sessions:members.map{member($0)}))
        }
        for (root,members) in workMembers {
            guard let sum=UsageHistory.sum(members.compactMap{direct[$0]}) else { return nil };let s=member(root)
            works.append(.init(id:s.id,title:s.title,provider:s.provider,aggregate:sum,
                sessions:members.map{member($0,resolved[$0]?.depth ?? 0)}.sorted{$0.depth == $1.depth ? $0.id < $1.id : $0.depth < $1.depth},issues:issues[root] ?? []))
        }
        projects.sort{$0.label == $1.label ? $0.id < $1.id : $0.label < $1.label};works.sort{$0.id < $1.id}
        return UsageGroupingProjection(projects:projects,works:works,aggregate:exact.aggregate,sourceAggregate:source.aggregate,reconciled:exact.reconciled,reconciliationIssue:exact.reconciliationIssue)
    }
}
public struct UsageGroupingExport: Encodable, Sendable {
    public struct Group: Encodable, Sendable {
        public let label: String
        public let provider: UsageProvider?
        public let source,confidence:String?
        public let aggregate: UsageAggregate
        public let sessions:[UsageGroupMember]?
    }
    public let by:String
    public let reconciled:Bool
    public let reconciliationIssue:String?
    public let allocated:UsageAggregate
    public let groups:[Group]
    public static func create(_ value:UsageGroupingProjection,by:String,includeIdentifiers:Bool)->Self {
        let groups:[Group]
        if by == "project" { groups=value.projects.map{.init(label:$0.label,provider:nil,source:$0.source,confidence:$0.confidence,aggregate:$0.aggregate,sessions:includeIdentifiers ? $0.sessions : nil)} }
        else { groups=value.works.enumerated().map{index,row in .init(label:includeIdentifiers ? row.title : "Work \(index+1)",provider:row.provider,source:nil,confidence:nil,aggregate:row.aggregate,sessions:includeIdentifiers ? row.sessions : nil)} }
        return Self(by:by,reconciled:value.reconciled,reconciliationIssue:value.reconciliationIssue,allocated:value.aggregate,groups:groups)
    }
}
