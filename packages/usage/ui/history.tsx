import { useEffect, useMemo, useState } from 'react';
import { ExportControls, type DownloadFile } from './export';
import { historyRange, historyView, type HistoryPreset, type DateRange } from '../src/history';
import type { UsageSnapshot, Aggregate } from '../src/types';
import { useTranslation } from './language';
import { costText, tokenText, type ProviderFilter } from './model';
const presets: [HistoryPreset, string][] = [['7d', '7 ngày'], ['30d', '30 ngày'], ['month', 'Tháng này'], ['previous', 'Tháng trước'], ['custom', 'Tùy chọn']];
export function HistoryPanel({ snapshot, initialProvider, downloadFile }: { snapshot: UsageSnapshot; initialProvider: ProviderFilter; downloadFile: DownloadFile }) {
  const { l, language } = useTranslation();
  const [provider, setProvider] = useState<ProviderFilter>(initialProvider);
  const [preset, setPreset] = useState<HistoryPreset>('30d');
  const now = new Date();
  const initial = historyRange('30d', now, snapshot.timeZone)!;
  const [custom, setCustom] = useState<DateRange>(initial);
  const [lastValid, setLastValid] = useState({ range: initial, timeZone: snapshot.timeZone });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const range = historyRange(preset, now, snapshot.timeZone, custom);
  const active = range ?? lastValid.range;
  useEffect(() => { if (range && (range.start !== lastValid.range.start || range.end !== lastValid.range.end || snapshot.timeZone !== lastValid.timeZone)) setLastValid({ range, timeZone: snapshot.timeZone }); }, [range?.start, range?.end, snapshot.timeZone]);
  useEffect(() => { setSelectedDay(null); }, [provider, active.start, active.end]);
  const view = useMemo(() => !range && lastValid.timeZone !== snapshot.timeZone ? null : historyView(snapshot, provider, active.start, active.end), [snapshot, provider, active.start, active.end, !!range, lastValid.timeZone]);
  useEffect(() => { if (selectedDay && !view?.days.some(day => day.date === selectedDay)) setSelectedDay(null); }, [view, selectedDay]);
  const detail: Aggregate | undefined = selectedDay ? view?.days.find(d => d.date === selectedDay)?.aggregate : view?.aggregate;
  const money = (a: Aggregate) => costText(a.cost, language);
  const max = (view?.days ?? []).reduce((max, day) => Math.max(max, day.aggregate.cost.knownCostUSD), .01);
  const hasClaude = Array.isArray(snapshot.history?.providers) && snapshot.history.providers.includes('claude');
  return <div className="history-panel">
    <h2>{l('Chi tiết sử dụng')}</h2>
    <div className="history-filters">
      <label>{l('Công cụ lịch sử')}<select aria-label={l('Công cụ lịch sử')} value={provider} onChange={e => setProvider(e.target.value as ProviderFilter)}>
        <option value="all">{l('Tất cả')}</option><option value="codex">Codex</option>{hasClaude ? <option value="claude">Claude Code</option> : null}
      </select></label>
      <label>{l('Khoảng lịch sử')}<select aria-label={l('Khoảng lịch sử')} value={preset} onChange={e => { const value = e.target.value as HistoryPreset; if (value === 'custom') setCustom(active); setPreset(value); }}>
        {presets.map(([value, title]) => <option key={value} value={value}>{l(title)}</option>)}
      </select></label>
    </div>
    {preset === 'custom' ? <div className="history-filters">
      <label>{l('Từ ngày')}<input aria-label={l('Từ ngày')} type="date" value={custom.start} onChange={e => setCustom({ ...custom, start: e.target.value })}/></label>
      <label>{l('Đến ngày')}<input aria-label={l('Đến ngày')} type="date" value={custom.end} onChange={e => setCustom({ ...custom, end: e.target.value })}/></label>
    </div> : null}
    {!range ? <p role="alert" className="notice">{l('Khoảng ngày không hợp lệ. Chọn ngày bắt đầu không sau ngày kết thúc và không chọn tương lai.')}</p> : null}
    <p className="history-scope">{active.start} — {active.end} · {snapshot.timeZone}</p>
    {snapshot.status === 'stale' || snapshot.status === 'error' ? <p className="notice" role="alert">{l('Dữ liệu cũ · đang chờ cập nhật')}</p> : null}
    {!view ? <p data-testid="history-unavailable" className="notice">{l('Chưa có lịch sử tương thích. Cập nhật dữ liệu hoặc runtime; không suy ra lịch sử từ toàn phiên.')}</p> : <>
      <div className="history-summary"><strong data-testid="history-cost">{money(view.aggregate)}</strong><span>{l('Tổng trong khoảng đã chọn')}</span><span>{tokenText(view.aggregate.tokens.total)} {l('Token')}</span></div>
      {view.aggregate.cost.status !== 'estimated' ? <p className="history-price-note">{l('Phần đã biết: $%@ · Giá chưa đầy đủ, không phải $0.', view.aggregate.cost.knownCostUSD.toFixed(2))}</p> : null}
      <div className="history-chart" role="group" aria-label={l('Chi phí theo ngày')}>
        {view.days.map(day => <button type="button" key={day.date} aria-pressed={selectedDay === day.date} aria-label={`${day.date}: ${money(day.aggregate)}`}
          title={`${day.date}: ${money(day.aggregate)}`} onClick={() => setSelectedDay(selectedDay === day.date ? null : day.date)}>
          <span className={`history-bar ${day.aggregate.cost.status !== 'estimated' ? 'unpriced' : ''}`} style={{ height: `${Math.max(day.aggregate.cost.status !== 'estimated' ? 24 : 3, day.aggregate.cost.knownCostUSD / max * 92)}px` }}/>
          <span>{day.date.slice(5)}</span>
        </button>)}
      </div>
      {!view.days.length ? <p className="muted">{l('Chưa có usage trong khoảng thời gian này.')}</p> : null}
      <div className="section-heading"><h2>{selectedDay ?? l('Toàn khoảng')}</h2>{selectedDay ? <button className="text-button" onClick={() => setSelectedDay(null)}>{l('Toàn khoảng')}</button> : null}</div>
      <p className="history-scope">{l('Ngày thiếu giá: cột gạch chéo, không phải chi phí bằng 0.')}</p>
      {detail ? <div className="history-table" data-testid="history-models" tabIndex={0} role="region" aria-label={l('Bảng model lịch sử')}>
        <table><thead><tr>{['Model', 'Input', 'Output', 'Cache read', 'Cache write', 'Tổng', 'Chi phí'].map(label => <th key={label}>{l(label)}</th>)}</tr></thead>
          <tbody>{detail.models.map((model, index) => <tr key={`${model.name}:${index}`}><td>{model.name}</td>{[model.tokens.input, model.tokens.output, model.tokens.cacheRead, model.tokens.cacheWrite, model.tokens.total].map((n, i) => <td key={i}>{n.toLocaleString(language)}</td>)}<td>{costText(model.cost, language)}{model.cost.status === 'partial' ? ` ≥$${model.cost.knownCostUSD.toFixed(2)}` : ''}</td></tr>)}</tbody>
        </table>
      </div> : null}
    </>}
    <ExportControls snapshot={snapshot} provider={provider} range={active} available={!!view} downloadFile={downloadFile}/>
    <p className="history-scope">{l('Chỉ thống kê log còn trên máy; không phải toàn bộ lịch sử tài khoản.')} · {l('Nhận gần nhất')}: {new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short', timeZone: snapshot.timeZone }).format(new Date(snapshot.generatedAt))}</p>
  </div>;
}
