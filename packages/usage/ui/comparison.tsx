import type { ComparisonDelta, ComparisonRow, HistoryComparison } from '../src/history';
import { useTranslation } from './language';
import { costText } from './model';
export function ComparisonPanel({ value }: { value: HistoryComparison | null }) {
  const { l, language } = useTranslation();
  if (!value) return <p className="notice">{l('Chưa có khoảng so sánh hợp lệ.')}</p>;
  const signed = (n: number, digits = 0) => (n > 0 ? '+' : '') + n.toLocaleString(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const percent = (d: ComparisonDelta) => d.percent === null ? l('Không áp dụng') : signed(d.percent, 1) + '%';
  const cost = (r: ComparisonRow) => r.cost ? `${r.cost.absolute < 0 ? '−' : r.cost.absolute > 0 ? '+' : ''}$${Math.abs(r.cost.absolute).toFixed(2)} · ${percent(r.cost)}` : l('Chưa đủ dữ liệu giá hoặc dữ liệu đã cũ.');
  const ratio = (n: number | null) => n === null ? l('Không áp dụng') : (n * 100).toLocaleString(language, { maximumFractionDigits: 1 }) + '%';
  const row = (r: ComparisonRow, summary = false) => <div className="comparison-row" key={r.name}>
    {!summary ? <strong>{r.name === 'claude' ? 'Claude Code' : r.name === 'codex' ? 'Codex' : r.name}</strong> : null}
    <p>{l('Hiện tại %@ · Trước %@', costText(r.current.cost, language), costText(r.previous.cost, language))}</p>
    <dl><div><dt>{l('Thay đổi chi phí')}</dt><dd data-testid={summary ? 'comparison-cost-delta' : undefined}>{cost(r)}</dd></div>
      <div><dt>{l('Thay đổi token')}</dt><dd>{signed(r.tokens.absolute)} · {percent(r.tokens)}</dd></div>
      <div><dt>{l('Tỷ lệ cache read')}</dt><dd>{ratio(r.cache.previous)} → {ratio(r.cache.current)}</dd></div>
      <div><dt>{l('Thay đổi cache')}</dt><dd>{r.cache.percentagePoints === null ? l('Không áp dụng') : l('%@ điểm phần trăm', signed(r.cache.percentagePoints, 1))}</dd></div>
    </dl>
  </div>;
  return <section className="history-comparison" data-testid="history-comparison" aria-label={l('So sánh hai khoảng thời gian')}>
    <h2>{l('So sánh hai khoảng thời gian')}</h2>
    <p>{l('Kỳ đã chọn: %@ → %@', value.currentRange.start, value.currentRange.end)}</p>
    <p>{l('Kỳ trước: %@ → %@', value.previousRange.start, value.previousRange.end)}</p>
    {row(value.summary, true)}
    <h3>{l('Theo công cụ')}</h3>{value.providers.map(r => row(r))}
    {value.models.length ? <><h3>{l('Theo model')}</h3>{value.models.map(r => row(r))}</> : null}
    <p className="history-scope">{l('Cache read / (Input + Cache read + Cache write); không gồm Output.')}</p>
    <p className="history-scope">{l('Chỉ thống kê log còn trên máy; không phải toàn bộ lịch sử tài khoản.')}</p>
    <p className="history-scope">{l('Tệp xuất chỉ gồm khoảng đã chọn, không gồm kỳ so sánh.')}</p>
  </section>;
}
