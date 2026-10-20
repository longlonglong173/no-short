import { useEffect, useRef, useState } from 'react';
import { HistoryPanel } from './history';
import { useUsage } from './use-usage';
import { costText as formatCost, tokenText, providerView, hasClaudeSource, type ProviderFilter } from './model';
import { LanguageProvider, useTranslation, persistWidgetState } from './language';
import { languages } from './localization';
import type { Cost, Aggregate, SessionUsage, UsageSnapshot } from '../src/types';

type Period = 'session' | 'day' | 'month' | 'history';
function Icon({ name }: { name: 'refresh' | 'pin' | 'chevron' | 'chart' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'refresh' ? <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/></>
      : name === 'pin' ? <><path d="m8 3 8 0-1 7 4 4H5l4-4-1-7Z"/><path d="M12 14v7"/></>
      : name === 'chevron' ? <path d="m6 9 6 6 6-6"/> : <><path d="M4 20h16M7 16v-5m5 5V5m5 11V8"/></>}
  </svg>;
}
function defaultSession(sessions: SessionUsage[]): SessionUsage | null { return sessions.find(s => s.kind === 'main') ?? sessions.find(s => s.kind !== 'subagent') ?? null; }
function Chart({ points }: { points: UsageSnapshot['chart'] }) {
  const { l, language } = useTranslation();
  const costText = (cost: Cost) => formatCost(cost, language);
  const max = Math.max(...points.map(p => p.cost.knownCostUSD), 0.01);
  return <section className="chart-section" aria-labelledby="chart-title">
    <div className="section-heading"><h2 id="chart-title">{l("Chi phí 7 ngày qua")}</h2><span>USD</span></div>
    <div className="chart" role="img" aria-label={l("Biểu đồ chi phí API quy đổi 7 ngày qua")}>
      <div className="chart-grid"><span>{costText({ amountUSD: max, knownCostUSD: max, status: 'estimated' })}</span><span>$0</span></div>
      <div className="chart-bars">{points.map(point => <div className="chart-column" key={point.date} title={`${point.date}: ${costText(point.cost)}`}>
        <div className="bar-track"><div className={`bar ${point.cost.amountUSD === null ? 'unpriced' : ''}`} style={{ height: `${Math.max(point.cost.knownCostUSD / max * 100, point.cost.amountUSD === null ? 25 : 2)}%` }}/></div>
        <span>{language === 'vi' ? `${point.date.slice(8)}/${point.date.slice(5, 7)}` : `${point.date.slice(5, 7)}/${point.date.slice(8)}`}</span>
      </div>)}</div>
    </div>
  </section>;
}
function Stats({ value }: { value: Aggregate }) {
  const { l, language } = useTranslation();
  const costText = (cost: Cost) => formatCost(cost, language);
  return <>
    <section className="token-grid" aria-label={l("Token sử dụng")}>{[
      [l('Input'), value.tokens.input, l("Token đầu vào chưa cache")], [l('Cache'), value.tokens.cacheRead, l("Token đầu vào đọc từ cache")], [l('Output'), value.tokens.output, l("Token đầu ra, đã gồm reasoning")],
    ].map(([label, n, hint]) => <div key={label} title={String(hint)}><span>{label}</span><strong>{tokenText(Number(n))}</strong></div>)}</section>
    <section className="models" aria-label={l("Chi phí theo model")}><div className="model-head"><h2>{l('Model')}</h2><span>{l("Chi phí")}</span></div>
      {value.models.length ? value.models.map(model => <div className="model-row" key={model.name}><span>{model.name}</span><span className={model.cost.amountUSD === null ? 'unknown' : ''}>{costText(model.cost)}</span></div>) : <p className="muted no-model">{l("Chưa có usage trong khoảng thời gian này.")}</p>}
      <div className="model-total"><strong>{l("Tổng")}</strong><strong>{costText(value.cost)}</strong></div>
    </section>
  </>;
}
interface Selection { sessionId: string | null; providerFilter: ProviderFilter }
function readSelection(): Selection {
  try {
    const hostState = window.openai?.widgetState as { noShortUsageSelection?: Partial<Selection> } | undefined;
    const stored = hostState?.noShortUsageSelection ?? JSON.parse(localStorage.getItem('no-short-usage-selection-v1') ?? 'null');
    const sessionId = typeof stored?.sessionId === 'string' ? stored.sessionId : null;
    // Before provider controls existed, saved pins had only sessionId. Claude
    // report IDs already use the provider prefix, so preserve those selections.
    return { sessionId, providerFilter: ['all', 'codex', 'claude'].includes(stored?.providerFilter)
      ? stored.providerFilter : sessionId?.startsWith('claude:') ? 'claude' : 'codex' };
  } catch { return { sessionId: null, providerFilter: 'codex' }; }
}
export function UsagePanel() { return <LanguageProvider><UsagePanelContent /></LanguageProvider>; }
function UsagePanelContent() {
  const { l, language, setLanguage } = useTranslation();
  const costText = (cost: Cost) => formatCost(cost, language);
  const { data, busy, error, preview, requestVersion, refresh, downloadFile } = useUsage();
  const [period, setPeriod] = useState<Period>('session');
  const [historyOpened, setHistoryOpened] = useState(false);
  const [selection, setSelection] = useState<Selection>(readSelection);
  const [search, setSearch] = useState('');
  const picker = useRef<HTMLDetailsElement>(null);
  const requested = useRef({ id: null as string | null, version: 0 });
  const selectionChosen = useRef(false);
  const snapshot = data?.snapshot;
  useEffect(() => {
    // Legacy hosts can restore widget state after mount. Host restoration must
    // never undo a manual choice or an explicit tool-selected conversation.
    const restore = () => {
      const host = window.openai?.widgetState as { noShortUsageSelection?: unknown } | undefined;
      if (!selectionChosen.current && host?.noShortUsageSelection) setSelection(readSelection());
    };
    window.addEventListener('openai:set_globals', restore);
    return () => window.removeEventListener('openai:set_globals', restore);
  }, []);
  useEffect(() => {
    const id = data?.requestedSessionId ?? null;
    if (id && (requested.current.id !== id || requested.current.version !== requestVersion)) {
      selectionChosen.current = true;
      setPeriod('session');
      const session = data?.snapshot.sessions.find(s => s.id === id);
      setSelection({ sessionId: id, providerFilter: session?.provider ?? 'codex' });
    }
    requested.current = { id, version: requestVersion };
  }, [data, requestVersion]);
  const hasClaude = snapshot ? hasClaudeSource(snapshot) : false;
  const filter = hasClaude ? selection.providerFilter : 'codex';
  const pin = selection.sessionId;
  const view = snapshot ? providerView(snapshot, filter) : null;
  const selected = view ? pin ? view.sessions.find(s => s.id === pin) ?? null : defaultSession(view.sessions) : null;
  const value = period === 'day' ? view?.today : period === 'month' ? view?.month : selected;
  const providerName = (provider: ProviderFilter) => provider === 'all' ? l('Codex và Claude Code') : provider === 'claude' ? 'Claude Code' : 'Codex';
  const scope = period === 'session'
    ? l('Toàn phiên · %@', providerName(selected ? selected.provider ?? 'codex' : filter))
    : l('Tất cả phiên · %@ · %@', providerName(filter), l(period === 'day' ? 'Hôm nay' : 'Tháng này'));
  function choose(id: string | null, provider: ProviderFilter = filter) {
    selectionChosen.current = true;
    const next = { sessionId: id, providerFilter: provider };
    setSelection(next); setSearch(''); if (picker.current) picker.current.open = false;
    try { localStorage.setItem('no-short-usage-selection-v1', JSON.stringify(next)); } catch { /* Storage may be disabled by the host. */ }
    persistWidgetState({ noShortUsageSelection: next, noShortUsageLanguage: language });
  }
  const filtered = view?.sessions.filter(s => `${s.title} ${s.id}`.toLocaleLowerCase(language).includes(search.toLocaleLowerCase(language))).slice(0, 100) ?? [];
  const unavailable = snapshot?.status === 'error';
  return <main className="usage-panel">
    {preview ? <div className="preview-label">{l("Xem trước local · Chưa phải panel trong Codex")}</div> : null}
    <div className="language-switch" role="group" aria-label={l('Ngôn ngữ')}>{languages.map(option => <button key={option.code} lang={option.code} aria-pressed={language === option.code} onClick={() => setLanguage(option.code)}>{option.title}</button>)}</div>
    <header className="panel-header"><div className="identity"><div className="brand-icon"><Icon name="chart"/></div><div><span className="eyebrow">no-short</span><h1>No Short Usage</h1></div></div>
      <button className={`icon-button ${busy ? 'is-loading' : ''}`} aria-label={l("Cập nhật thống kê")} onClick={() => void refresh()} disabled={busy}><Icon name="refresh"/></button>
    </header>
    <div className={`source-status ${error || snapshot?.status === 'stale' || unavailable ? 'warning' : ''}`} role="status"><span className="status-dot"/>
      {busy && !data ? l("Đang đọc log trên máy…") : !snapshot ? l("Chưa kết nối dữ liệu") : l('Log trên máy · %@', snapshot.status === 'stale' || unavailable ? l("Chưa cập nhật") : l("Đã cập nhật"))}
    </div>
    {hasClaude && period !== 'history' ? <div className="provider-filter" role="group" aria-label={l('Công cụ')}>
      {(['all', 'codex', 'claude'] as const).map(provider => <button key={provider} aria-pressed={filter === provider} onClick={() => { if (provider !== filter) choose(null, provider); }}>{provider === 'all' ? l('Tất cả') : providerName(provider)}</button>)}
    </div> : null}
    <div className="tabs" role="tablist" aria-label={l("Khoảng thống kê")}>{([['session', l("Phiên")], ['day', l("Hôm nay")], ['month', l("Tháng này")], ['history', l('Lịch sử')]] as const).map(([key, label]) =>
      <button key={key} role="tab" id={`tab-${key}`} aria-selected={period === key} aria-controls="usage-content" onClick={() => { if (key === 'history') setHistoryOpened(true); setPeriod(key); }}>{label}</button>)}</div>
    <section id="usage-content" role="tabpanel" aria-labelledby={`tab-${period}`}>
      <div hidden={period !== 'history'}>{period === 'history' && error ? <p className="notice" role="alert">{l(error)}</p> : null}{snapshot && historyOpened ? <HistoryPanel snapshot={error ? { ...snapshot, status: 'stale' } : snapshot} initialProvider={filter} downloadFile={downloadFile}/> : null}</div>
      <div hidden={period === 'history'}>
      {period === 'session' && view?.sessions.length ? <div className="session-controls">
        <div className="picker-row"><details className="session-picker" ref={picker}><summary aria-label={l("Chọn phiên")}><span>{selected?.title ?? l("Phiên không còn dữ liệu")}</span><Icon name="chevron"/></summary>
          <div className="picker-popup"><label htmlFor="session-search">{l("Tìm phiên")}</label><input id="session-search" type="search" value={search} placeholder={l("Tên hoặc ID phiên…")} onChange={e => setSearch(e.target.value)}/>
            <button className="follow-latest" onClick={() => choose(null)}>{l("Tự theo phiên gần nhất")}</button><div className="session-results">{filtered.map(s => <button key={s.id} onClick={() => choose(s.id)}>
              <span>{s.title}</span><small>{providerName(s.provider ?? 'codex')} · {s.kind === 'subagent' ? l("Tác vụ con · ") : ''}{costText(s.cost)}</small></button>)}{!filtered.length ? <p className="muted">{l("Không tìm thấy phiên.")}</p> : null}</div>
          </div></details>
          <button className={`icon-button pin-button ${pin ? 'pinned' : ''}`} aria-label={pin ? l("Bỏ ghim phiên") : l("Ghim phiên")} aria-pressed={!!pin} disabled={!selected && !pin} onClick={() => choose(pin ? null : selected?.id ?? null)}><Icon name="pin"/></button>
        </div><p className="selection-hint">{pin ? l("Đã ghim phiên · Không tự chuyển") : l("Theo phiên gần nhất · Không xác định tab đang mở")}</p>
      </div> : null}
      {error || snapshot?.notice ? <div className="notice" role="alert">{l(error ?? snapshot?.notice ?? '')}</div> : null}
      {snapshot?.status === 'empty' ? <div className="empty-state"><Icon name="chart"/><h2>{l('Chưa có dữ liệu cho %@', providerName(filter))}</h2><p>{l('Chạy một phiên của công cụ đã chọn trên máy rồi cập nhật lại. Panel đọc log đã cấu hình.')}</p></div>
        : period === 'session' && pin && !selected && snapshot && !unavailable ? <div className="empty-state"><h2>{l("Phiên đã ghim không còn dữ liệu.")}</h2><p>{l("Bỏ ghim hoặc chọn phiên khác để tiếp tục theo dõi.")}</p><button className="text-button" onClick={() => choose(null)}>{l("Bỏ ghim và theo phiên gần nhất")}</button></div>
        : period === 'session' && snapshot && !selected && !unavailable ? <div className="empty-state"><h2>{l('Chưa có phiên cho công cụ này.')}</h2></div>
        : value && !unavailable ? <>
          <div className="cost-block"><div className="cost-line"><strong className={`main-cost ${value.cost.amountUSD === null ? 'cost-unknown' : ''}`} data-testid="main-cost">{costText(value.cost)}</strong><span className="estimate-badge">{l("Ước tính")}</span></div><p>{l(period === 'day' ? 'Chi phí API quy đổi hôm nay' : period === 'month' ? 'Chi phí API quy đổi tháng này' : 'Chi phí API quy đổi')}</p>
            {value.cost.status === 'partial' ? <p className="partial-note">{l('Phần đã có giá: $%@ · Còn model chưa định giá', value.cost.knownCostUSD.toFixed(2))}</p> : null}
            <p className="scope-label">{scope}</p>
          </div><Stats value={value}/><p className="chart-scope">{l('7 ngày · Tất cả phiên · %@', providerName(filter))}</p><Chart points={view!.chart}/>
          {view!.chart.some(p => p.cost.status !== 'estimated') ? <p className="chart-note">{l('Ngày thiếu giá: cột gạch chéo, không phải chi phí bằng 0.')}</p> : null}
          <div className="period-totals"><button onClick={() => setPeriod('day')}><span>{l("Hôm nay")}</span><strong>{view?.today ? costText(view.today.cost) : '—'}</strong></button><button onClick={() => setPeriod('month')}><span>{l("Tháng này")}</span><strong>{view?.month ? costText(view.month.cost) : '—'}</strong></button></div>
        </> : snapshot && !unavailable ? <div className="empty-state"><p>{l('Chưa có tổng theo công cụ cho khoảng thời gian này.')}</p></div>
        : !error && !unavailable ? <div className="skeleton" aria-label={l("Đang tải thống kê")}><div/><div/><div/></div> : null}
      </div>
    </section>
    <footer><p className="disclaimer">{l("Ước tính — không phải hóa đơn hoặc credit ChatGPT đã trừ")}</p>
      <div className="footer-meta"><span>{l("Nguồn: ccusage · Dữ liệu cục bộ")}</span>{snapshot ? <time dateTime={snapshot.generatedAt}>{new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: snapshot.timeZone }).format(new Date(snapshot.generatedAt))}</time> : null}</div>
      {snapshot && period !== 'history' ? <p className="footer-detail">{providerName(filter)} · {snapshot.timeZone} · {snapshot.pricingSource === 'cached' ? l("Dùng bảng giá cache") : l("Giá theo ccusage")} · {l('%@ phiên', String(view?.sessions.length ?? 0))}</p> : null}
    </footer>
  </main>;
}
