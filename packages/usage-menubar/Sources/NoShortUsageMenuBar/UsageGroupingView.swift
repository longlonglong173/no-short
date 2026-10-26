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
        VStack(alignment:.leading,spacing:10) {
            Text(l("Phân bổ trực tiếp theo phiên")).font(.system(size:11,weight:.medium))
            ForEach(rows,id:\.id) { row in
                VStack(alignment:.leading,spacing:4) {
                    HStack(alignment:.firstTextBaseline) {
                        Text((row.depth > 0 ? "↳ " : "") + UsagePresentation.cleanTitle(row.title == "Phiên chưa xác định" ? l(row.title) : row.title))
                            .padding(.leading,CGFloat(min(row.depth,8)*12)).fixedSize(horizontal:false,vertical:true)
                        Spacer(minLength:8)
                        Text(UsagePresentation.money(row.aggregate.cost)).monospacedDigit()
                        Text(UsagePresentation.number(row.aggregate.tokens.total)).monospacedDigit()
                    }
                    Text(row.provider.rawValue + " · " + l(row.kind == "main" ? "Phiên chính" : row.kind == "subagent" ? "Tác vụ con" : "Loại phiên chưa xác định") + " · " + row.aggregate.models.map{$0.name + ": " + UsagePresentation.money($0.cost) + " · " + UsagePresentation.number($0.tokens.total)}.joined(separator:" · "))
                        .font(.system(size:10)).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)
                }.font(.system(size:12))
            }
        }.padding(.vertical,8)
    }
}
