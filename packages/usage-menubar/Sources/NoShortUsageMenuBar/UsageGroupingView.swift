import SwiftUI
import UsageCore

struct UsageGroupingView: View {
    let value: UsageGroupingProjection?
    let mode: String
    let language: AppLanguage
    private func l(_ key:String)->String { AppLocalization(language:language).text(key) }
    var body: some View {
        VStack(alignment:.leading,spacing:12) {
            Text(l(mode == "project" ? "Theo dự án" : "Công việc cha–con")).font(.headline)
            Text(l("Chỉ cộng đóng góp log duy nhất trong khoảng; dòng phiên là usage trực tiếp, tổng công việc gồm các tác vụ con."))
                .font(.system(size:11)).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
            if let value {
                if !value.reconciled {
                    Text(l(value.reconciliationIssue == "pricing" ? "Cơ sở giá theo phiên và theo ngày chưa khớp; chi phí nhóm còn bất định." : "Chưa phân bổ hết usage nguồn; tổng nhóm chưa đối chiếu khớp.") + " \(UsagePresentation.number(value.aggregate.tokens.total)) / \(UsagePresentation.number(value.sourceAggregate.tokens.total))")
                        .font(.system(size:12)).foregroundStyle(.orange).fixedSize(horizontal:false,vertical:true)
                } else { Text(l("Tổng nhóm khớp dữ liệu nguồn trong cùng bộ lọc.")).font(.system(size:11)).foregroundStyle(.secondary) }
                if mode == "project" {
                    ForEach(value.projects) { group in
                        DisclosureGroup {
                            Text(l(group.source == "git-common-dir" ? "Git hiện tại đã xác minh" : group.source == "recorded-directory" ? "Thư mục ghi nhận · độ tin cậy thấp hơn" : "Chưa đủ metadata dự án"))
                                .font(.system(size:11)).foregroundStyle(.secondary)
                            members(group.sessions)
                        } label: { groupLabel(l(group.label),group.aggregate) }
                    }
                } else {
                    ForEach(value.works) { group in
                        DisclosureGroup {
                            Text(l(group.issues.isEmpty ? "Quan hệ cha–con chỉ từ metadata tường minh." : "Quan hệ chưa xác minh; giữ phiên riêng."))
                                .font(.system(size:11)).foregroundStyle(group.issues.isEmpty ? Color.secondary : Color.orange)
                            members(group.sessions)
                        } label: { groupLabel(group.title == "Phiên chưa xác định" ? l(group.title) : group.title,group.aggregate) }
                    }
                }
            } else { Text(l("Chưa có phân bổ phiên/ngày tương thích; không dùng chi phí toàn phiên.")).font(.system(size:12)).foregroundStyle(.secondary) }
        }.textSelection(.enabled)
    }
    private func groupLabel(_ title:String,_ aggregate:UsageAggregate)->some View {
        HStack(alignment:.firstTextBaseline) {
            Text(UsagePresentation.cleanTitle(title)).fixedSize(horizontal:false,vertical:true)
            Spacer(minLength:10)
            Text(UsagePresentation.money(aggregate.cost)).monospacedDigit()
            Text(UsagePresentation.number(aggregate.tokens.total) + " " + l("Token")).font(.system(size:11)).foregroundStyle(.secondary)
        }.padding(.vertical,5)
    }
    private func members(_ rows:[UsageGroupMember])->some View {
        UsageGroupingMembers(rows:rows,language:language)
    }
}

struct UsageGroupingMembers: View {
    let rows: [UsageGroupMember]
    let language: AppLanguage

    var body: some View {
        VStack(alignment:.leading,spacing:10) {
            Text(AppLocalization(language:language).text("Phân bổ trực tiếp theo phiên"))
                .font(.system(size:11,weight:.medium))
            ForEach(rows,id:\.id) { row in
                UsageGroupingMemberRow(row:row,language:language)
            }
        }.padding(.vertical,8)
    }
}

private struct UsageGroupingMemberRow: View {
    let row: UsageGroupMember
    let language: AppLanguage

    private func l(_ key:String)->String { AppLocalization(language:language).text(key) }

    var body: some View {
        VStack(alignment:.leading,spacing:4) {
            header
            models
        }.font(.system(size:12))
    }

    private var header: some View {
        let title: String = memberTitle
        let indent: CGFloat = CGFloat(min(row.depth,8)*12)
        let amount: String = UsagePresentation.money(row.aggregate.cost)
        let tokens: String = UsagePresentation.number(row.aggregate.tokens.total)
        return HStack(alignment:.firstTextBaseline) {
            Text(title).padding(.leading,indent).fixedSize(horizontal:false,vertical:true)
            Spacer(minLength:8)
            Text(amount).monospacedDigit()
            Text(tokens).monospacedDigit()
        }
    }

    private var models: some View {
        Text(modelSummary).font(.system(size:10)).foregroundStyle(.secondary)
            .fixedSize(horizontal:false,vertical:true)
    }

    private var memberTitle: String {
        let title: String = row.title == "Phiên chưa xác định" ? l(row.title) : row.title
        let cleanTitle: String = UsagePresentation.cleanTitle(title)
        let prefix: String = row.depth > 0 ? "↳ " : ""
        return prefix + cleanTitle
    }

    private var modelSummary: String {
        let kindKey: String
        switch row.kind {
        case "main": kindKey = "Phiên chính"
        case "subagent": kindKey = "Tác vụ con"
        default: kindKey = "Loại phiên chưa xác định"
        }
        let kind: String = l(kindKey)
        let summaries: [String] = row.aggregate.models.map { model in
            let amount: String = UsagePresentation.money(model.cost)
            let tokens: String = UsagePresentation.number(model.tokens.total)
            return model.name + ": " + amount + " · " + tokens
        }
        let models: String = summaries.joined(separator:" · ")
        return row.provider.rawValue + " · " + kind + " · " + models
    }
}
