import { useEffect, useRef, useState } from 'react';
import { useUsage } from './use-usage';
import { costText, tokenText } from './model';
import type { Aggregate, SessionUsage, UsageSnapshot } from '../src/types';

type Period = 'session' | 'day' | 'month';
function Icon({ name }: { name: 'refresh' | 'pin' | 'chevron' | 'chart' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'refresh' ? <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></>
      : name === 'pin' ? <><path d="m8 3 8 0-1 7 4 4H5l4-4-1-7Z"/><path d="M12 14v7"/></>
      : name === 'chevron' ? <path d="m6 9 6 6 6-6"/> : <><path d="M4 20h16M7 16v-5m5 5V5m5 11V8"/></>}
  </svg>;
}
function defaultSession(sessions: SessionUsage[]): SessionUsage | null { return sessions.find(s => s.kind === 'main') ?? sessions.find(s => s.kind !== 'subagent') ?? null; }
function Chart({ snapshot }: { snapshot: UsageSnapshot }) {
  const max = Math.max(...snapshot.chart.map(p => p.cost.knownCostUSD), 0.01);
  return <section className="chart-section" aria-labelledby="chart-title">
    <div className="section-heading"><h2 id="chart-title">Chi phí 7 ngày qua</h2><span>USD</span></div>
    <div className="chart" role="img" aria-label="Biểu đồ chi phí API quy đổi 7 ngày qua">
      <div className="chart-grid"><span>{costText({ amountUSD: max, knownCostUSD: max, status: 'estimated' })}</span><span>$0</span></div>
      <div className="chart-bars">{snapshot.chart.map(point => <div className="chart-column" key={point.date} title={`${point.date}: ${costText(point.cost)}`}>
        <div className="bar-track"><div className={`bar ${point.cost.amountUSD === null ? 'unpriced' : ''}`} style={{ height: `${Math.max(point.cost.knownCostUSD / max * 100, point.cost.amountUSD === null ? 25 : 2)}%` }}/></div>
        <span>{point.date.slice(8)}/{point.date.slice(5, 7)}</span>
      </div>)}</div>
    </div>
  </section>;
}
function Stats({ value }: { value: Aggregate }) {
  return <>
    <section className="token-grid" aria-label="Token sử dụng">{[
      ['Input', value.tokens.input, 'Token đầu vào chưa cache'], ['Cache', value.tokens.cacheRead, 'Token đầu vào đọc từ cache'], ['Output', value.tokens.output, 'Token đầu ra, đã gồm reasoning'],
    ].map(([label, n, hint]) => <div key={label} title={String(hint)}><span>{label}</span><strong>{tokenText(Number(n))}</strong></div>)}</section>
    <section className="models" aria-label="Chi phí theo model"><div className="model-head"><h2>Model</h2><span>Chi phí</span></div>
      {value.models.length ? value.models.map(model => <div className="model-row" key={model.name}><span>{model.name}</span><span className={model.cost.amountUSD === null ? 'unknown' : ''}>{costText(model.cost)}</span></div>) : <p className="muted no-model">Chưa có usage trong khoảng thời gian này.</p>}
      <div className="model-total"><strong>Tổng</strong><strong>{costText(value.cost)}</strong></div>
    </section>
  </>;
}
function readPin(): string | null {
  try {
    const hostState = window.openai?.widgetState as { noShortUsageSelection?: { sessionId: string | null } } | undefined;
    const stored = hostState?.noShortUsageSelection ?? JSON.parse(localStorage.getItem('no-short-usage-selection-v1') ?? 'null');
    return typeof stored?.sessionId === 'string' ? stored.sessionId : null;
  } catch { return null; }
}
export function UsagePanel() {
  const { data, busy, error, preview, refresh } = useUsage();
  const [period, setPeriod] = useState<Period>('session');
  const [pin, setPin] = useState<string | null>(readPin);
  const [search, setSearch] = useState('');
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (data?.requestedSessionId) setPin(data.requestedSessionId); }, [data]);
  const snapshot = data?.snapshot;
  const selected = snapshot ? pin ? snapshot.sessions.find(s => s.id === pin) ?? null : defaultSession(snapshot.sessions) : null;
  const value = snapshot ? period === 'day' ? snapshot.today : period === 'month' ? snapshot.month : selected : null;
  function choose(id: string | null) {
    setPin(id); setSearch(''); if (picker.current) picker.current.open = false;
    try { localStorage.setItem('no-short-usage-selection-v1', JSON.stringify({ sessionId: id })); } catch { /* Storage may be disabled by the host. */ }
    try { window.openai?.setWidgetState?.({ noShortUsageSelection: { sessionId: id } }); } catch { /* Local storage remains a fallback. */ }
  }
  const filtered = snapshot?.sessions.filter(s => `${s.title} ${s.id}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).slice(0, 100) ?? [];
  const unavailable = snapshot?.status === 'error';
  return <main className="usage-panel">
    {preview ? <div className="preview-label">Xem trước local · Chưa phải panel trong Codex</div> : null}
    <header className="panel-header"><div className="identity"><div className="brand-icon"><Icon name="chart"/></div><div><span className="eyebrow">no-short</span><h1>No Short Usage</h1></div></div>
      <button className={`icon-button ${busy ? 'is-loading' : ''}`} aria-label="Cập nhật thống kê" onClick={() => void refresh()} disabled={busy}><Icon name="refresh"/></button>
    </header>
    <div className={`source-status ${error || snapshot?.status === 'stale' || unavailable ? 'warning' : ''}`} role="status"><span className="status-dot"/>
      {busy && !data ? 'Đang đọc log trên máy…' : !snapshot ? 'Chưa kết nối dữ liệu' : `Log trên máy · ${snapshot.status === 'stale' || unavailable ? 'Chưa cập nhật' : 'Đã cập nhật'}`}
    </div>
    <div className="tabs" role="tablist" aria-label="Khoảng thống kê">{([['session', 'Phiên'], ['day', 'Hôm nay'], ['month', 'Tháng này']] as const).map(([key, label]) =>
      <button key={key} role="tab" id={`tab-${key}`} aria-selected={period === key} aria-controls="usage-content" onClick={() => setPeriod(key)}>{label}</button>)}</div>
    <section id="usage-content" role="tabpanel" aria-labelledby={`tab-${period}`}>
      {period === 'session' && snapshot?.sessions.length ? <div className="session-controls">
        <div className="picker-row"><details className="session-picker" ref={picker}><summary aria-label="Chọn phiên"><span>{selected?.title ?? 'Phiên không còn dữ liệu'}</span><Icon name="chevron"/></summary>
          <div className="picker-popup"><label htmlFor="session-search">Tìm phiên</label><input id="session-search" type="search" value={search} placeholder="Tên hoặc ID phiên…" onChange={e => setSearch(e.target.value)}/>
            <button className="follow-latest" onClick={() => choose(null)}>Tự theo phiên gần nhất</button><div className="session-results">{filtered.map(s => <button key={s.id} onClick={() => choose(s.id)}>
              <span>{s.title}</span><small>{s.kind === 'subagent' ? 'Tác vụ con · ' : ''}{costText(s.cost)}</small></button>)}{!filtered.length ? <p className="muted">Không tìm thấy phiên.</p> : null}</div>
          </div></details>
          <button className={`icon-button pin-button ${pin ? 'pinned' : ''}`} aria-label={pin ? 'Bỏ ghim phiên' : 'Ghim phiên'} aria-pressed={!!pin} disabled={!selected && !pin} onClick={() => choose(pin ? null : selected?.id ?? null)}><Icon name="pin"/></button>
        </div><p className="selection-hint">{pin ? 'Đã ghim phiên · Không tự chuyển' : 'Theo phiên gần nhất · Không xác định tab đang mở'}</p>
      </div> : null}
      {error || snapshot?.notice ? <div className="notice" role="alert">{error ?? snapshot?.notice}</div> : null}
      {snapshot?.status === 'empty' ? <div className="empty-state"><Icon name="chart"/><h2>Chưa có dữ liệu Codex</h2><p>Chạy một phiên Codex trên máy rồi cập nhật lại. Panel đọc các log còn lưu trong thư mục Codex.</p></div>
        : period === 'session' && pin && !selected && snapshot && !unavailable ? <div className="empty-state"><h2>Phiên đã ghim không còn dữ liệu.</h2><p>Bỏ ghim hoặc chọn phiên khác để tiếp tục theo dõi.</p><button className="text-button" onClick={() => choose(null)}>Bỏ ghim và theo phiên gần nhất</button></div>
        : value && !unavailable ? <>
          <div className="cost-block"><div className="cost-line"><strong className={`main-cost ${value.cost.amountUSD === null ? 'cost-unknown' : ''}`} data-testid="main-cost">{costText(value.cost)}</strong><span className="estimate-badge">Ước tính</span></div><p>Chi phí API quy đổi{period === 'day' ? ' hôm nay' : period === 'month' ? ' tháng này' : ''}</p>
            {value.cost.status === 'partial' ? <p className="partial-note">Phần đã có giá: ${value.cost.knownCostUSD.toFixed(2)} · Còn model chưa định giá</p> : null}
          </div><Stats value={value}/><Chart snapshot={snapshot!}/>
          <div className="period-totals"><button onClick={() => setPeriod('day')}><span>Hôm nay</span><strong>{costText(snapshot!.today.cost)}</strong></button><button onClick={() => setPeriod('month')}><span>Tháng này</span><strong>{costText(snapshot!.month.cost)}</strong></button></div>
        </> : !error && !unavailable ? <div className="skeleton" aria-label="Đang tải thống kê"><div/><div/><div/></div> : null}
    </section>
    <footer><p className="disclaimer">Ước tính — không phải hóa đơn hoặc credit ChatGPT đã trừ</p>
      <div className="footer-meta"><span>Nguồn: ccusage · Dữ liệu cục bộ</span>{snapshot ? <time dateTime={snapshot.generatedAt}>{new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: snapshot.timeZone }).format(new Date(snapshot.generatedAt))}</time> : null}</div>
      {snapshot ? <p className="footer-detail">{snapshot.timeZone} · {snapshot.pricingSource === 'cached' ? 'Dùng bảng giá cache' : 'Giá theo ccusage'} · {snapshot.sessions.length} phiên</p> : null}
    </footer>
  </main>;
}
