import { type GroupedUsage, type GroupMember } from '../src/grouping';
import { costText, tokenText } from './model';
import { useTranslation } from './language';
export type GroupBy = 'none'|'project'|'work';
export function GroupingPanel({value,mode}:{value:GroupedUsage|null;mode:GroupBy}) {
  const {l,language}=useTranslation();
  if(mode==='none')return null;
  const members=(rows:GroupMember[])=> <div className="history-table" tabIndex={0} role="region" aria-label={l('Phân bổ trực tiếp theo phiên')}><table><thead><tr><th>{l('Phiên')}</th><th>{l('Token trực tiếp')}</th><th>{l('Chi phí trực tiếp')}</th></tr></thead><tbody>{rows.map(row=><tr key={row.provider+':'+row.id}><td><span style={{paddingInlineStart:Math.min(row.depth,8)*12}}>{row.depth?'↳ ':''}{row.title=== 'Phiên chưa xác định'?l(row.title):row.title}</span><small className="history-scope">{row.provider} · {row.kind==='subagent'?l('Tác vụ con'):row.kind==='main'?l('Phiên chính'):l('Loại phiên chưa xác định')} · {row.aggregate.models.map(m=>`${m.name}: ${costText(m.cost,language)} · ${tokenText(m.tokens.total)} ${l('Token')}`).join(' · ')}</small></td><td>{tokenText(row.aggregate.tokens.total)}</td><td>{costText(row.aggregate.cost,language)}</td></tr>)}</tbody></table></div>;
  return <section className="history-grouping" data-testid="history-grouping">
    <h2>{l(mode==='project'?'Theo dự án':'Công việc cha–con')}</h2>
    <p className="history-scope">{l('Chỉ cộng đóng góp log duy nhất trong khoảng; dòng phiên là usage trực tiếp, tổng công việc gồm các tác vụ con.')}</p>
    {!value?<p className="notice">{l('Chưa có phân bổ phiên/ngày tương thích; không dùng chi phí toàn phiên.')}</p>:<>
      {!value.reconciled?<p className="notice" role="alert">{l(value.reconciliationIssue==='pricing'?'Cơ sở giá theo phiên và theo ngày chưa khớp; chi phí nhóm còn bất định.':'Chưa phân bổ hết usage nguồn; tổng nhóm chưa đối chiếu khớp.')} {tokenText(value.aggregate.tokens.total)} / {tokenText(value.sourceAggregate.tokens.total)} {l('Token')}</p>:<p className="history-scope">{l('Tổng nhóm khớp dữ liệu nguồn trong cùng bộ lọc.')}</p>}
      {mode==='project'?value.projects.map(group=><details key={group.id}><summary>{l(group.label==='Dự án chưa xác định'?group.label:group.label)} · {costText(group.aggregate.cost,language)} · {tokenText(group.aggregate.tokens.total)} {l('Token')}</summary><p className="history-scope">{l(group.source==='git-common-dir'?'Git hiện tại đã xác minh':group.source==='recorded-directory'?'Thư mục ghi nhận · độ tin cậy thấp hơn':'Chưa đủ metadata dự án')}</p>{members(group.sessions)}</details>):value.works.map(group=><details key={group.provider+':'+group.id}><summary>{group.title==='Phiên chưa xác định'?l(group.title):group.title} · {costText(group.aggregate.cost,language)} · {tokenText(group.aggregate.tokens.total)} {l('Token')}</summary>{group.issues.length?<p className="notice">{l('Quan hệ chưa xác minh; giữ phiên riêng.')}</p>:<p className="history-scope">{l('Quan hệ cha–con chỉ từ metadata tường minh.')}</p>}{members(group.sessions)}</details>)}
    </>}
  </section>;
}
