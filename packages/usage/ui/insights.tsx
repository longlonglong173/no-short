import type { UsageInsights, InsightReason } from '../src/insights';
import type { UsageSnapshot } from '../src/types';
import { useTranslation } from './language';
import { PricingBasis, PricingOrigin } from './pricing';
const reasonKeys: Record<InsightReason,string> = {
  stale:'Dữ liệu cũ hoặc lỗi; cần làm mới.', unavailable:'Lịch sử chưa khả dụng cho công cụ này.',
  history:'Cần 7 ngày có quan sát trong 30 ngày trước hôm nay.', baseline:'Trung vị bằng 0; chưa đủ cơ sở xác định bất thường.',
  today:'Chưa có ngày hiện tại được quan sát; không coi là $0.', pricing:'Thiếu cơ sở giá đầy đủ; không suy ra từ phần đã biết.', overflow:'Chi phí vượt giới hạn tính toán; chưa đủ căn cứ.'
};
export function InsightsPanel({value:v,snapshot,anomalyEnabled,scenarioEnabled}:{value:UsageInsights;snapshot:UsageSnapshot;anomalyEnabled:boolean;scenarioEnabled:boolean}) {
  const {l}=useTranslation(), money=(n:number|null)=>n===null?'—':'$'+n.toFixed(2);
  const origins = new Map((snapshot.history?.days ?? []).filter(d=>(v.provider==='all'||d.provider===v.provider)&&d.date<=v.today&&(d.date>=v.today.slice(0,7)+'-01'||v.sampleDates.includes(d.date)))
    .flatMap(d=>d.aggregate.models).filter(m=>m.pricing).map(m=>[m.name+JSON.stringify(m.pricing),m]));
  return <section className="history-comparison" data-testid="usage-insights" aria-label={l('Bất thường và kịch bản tháng')}>
    <h2>{l('Bất thường và kịch bản tháng')}</h2>
    <p>{v.provider==='all'?l('Tất cả'):v.provider==='codex'?'Codex':'Claude Code'} · {snapshot.timeZone} · {v.today}</p>
    <p>{l('Phân tích hôm nay %@ và tháng %@, độc lập khoảng lịch sử đã chọn.',v.today,v.today.slice(0,7))}</p>
    <p>{l('Mẫu %@/7 ngày quan sát: %@ → %@',String(v.sampleCount),v.sampleDates[0]??'—',v.sampleDates.at(-1)??'—')}</p>
    <p>{l('Trong 30 ngày trước hôm nay từ %@; %@ ngày quan sát thiếu giá.',v.windowStart,String(v.excludedUnpricedDays))}</p>
    {anomalyEnabled?<div><h3>{l('Mức dùng bất thường')}</h3><p role={v.anomaly?'status':undefined}>{v.anomalyReason?l(reasonKeys[v.anomalyReason]):l(v.anomaly?'Chi phí hôm nay vượt ngưỡng bất thường.':'Chi phí hôm nay chưa vượt ngưỡng bất thường.')}</p>
      {v.thresholdUSD!==null?<p>{l('Ngưỡng: 2 × %@ = %@; hôm nay %@.',money(v.medianUSD),money(v.thresholdUSD),money(v.todayUSD))}</p>:null}</div>:null}
    {scenarioEnabled?<div><h3>{l('Kịch bản chi phí API cuối tháng')}</h3>
      <strong>{v.scenarioReason?l(reasonKeys[v.scenarioReason]):money(v.scenarioUSD)+' USD'}</strong>
      {v.scenarioUSD!==null?<p>{l('Đã ghi nhận %@ + trung bình %@/ngày × %@ ngày sau hôm nay.',money(v.recordedMonthUSD),money(v.meanUSD),String(v.remainingDays))}</p>:null}
      <p>{l('Giả định usage mỗi ngày tới giống 7 ngày quan sát. Đây là kịch bản, không phải dự đoán hóa đơn.')}</p></div>:null}
    <p>{l('Dùng 7 ngày quan sát gần nhất; nếu một ngày thiếu giá thì chưa đủ căn cứ. Không chèn ngày trống thành $0.')}</p>
    <p>{l('Chỉ thống kê log còn trên máy; không phải toàn bộ lịch sử tài khoản.')}</p>
    <p>{l('Ước tính API · Không phải hóa đơn thuê bao')}</p>
    {snapshot.pricing?<><PricingBasis pricing={snapshot.pricing}/><p>{l('Phiên bản cơ sở giá: %@',snapshot.pricing.configurationRevision)}</p></>:<p>{l('Nguồn chưa cung cấp cơ sở giá chi tiết.')}</p>}
    {[...origins].map(([key,m])=><div key={key}>{m.name}<PricingOrigin pricing={m.pricing}/></div>)}
    <p>{l('Tệp xuất chỉ gồm khoảng đã chọn, không gồm kịch bản.')}</p>
  </section>;
}
