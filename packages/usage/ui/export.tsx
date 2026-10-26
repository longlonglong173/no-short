import { useState } from 'react';
import { createUsageExport, serializeUsageExport } from '../src/export';
import type { UsageSnapshot } from '../src/types';
import type { DateRange } from '../src/history';
import type { ProviderFilter } from './model';
import { useTranslation } from './language';
export type DownloadFile = (filename: string, mimeType: string, text: string) => Promise<void>;
export function ExportControls({ groupBy = 'none', snapshot, provider, range, available, downloadFile }: { groupBy?: 'none'|'project'|'work'; snapshot: UsageSnapshot; provider: ProviderFilter; range: DateRange; available: boolean; downloadFile: DownloadFile }) {
  const { l } = useTranslation();
  const [identifiers, setIdentifiers] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  async function save(format: 'csv' | 'json') {
    const document = createUsageExport(snapshot, provider, range.start, range.end, { includeSessionIdentifiers: identifiers, groupBy });
    if (!document) { setError(true); return; }
    const payload = serializeUsageExport(document, format);
    setBusy(true); setError(false);
    try { await downloadFile(`no-short-usage-${range.start}-${range.end}-${provider}.${format}`, format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json', payload); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <section className="export-controls" aria-label={l('Xuất thống kê')}>
    <p className="history-scope">{l('Xuất toàn khoảng đã chọn, không chỉ ngày đang xem model.')}</p>
    <label className="export-identifiers"><input type="checkbox" checked={identifiers} onChange={e => setIdentifiers(e.target.checked)}/>{l('Kèm tên/ID phiên (hoạt động cuối trong khoảng)')}</label>
    <p className="history-scope">{l('Tham chiếu phiên không phải phân bổ chi phí theo phiên; có thể không đủ các phiên đã đóng góp.')}</p>
    <div className="export-buttons"><button disabled={!available || busy} onClick={() => void save('csv')}>{l('Xuất CSV')}</button><button disabled={!available || busy} onClick={() => void save('json')}>{l('Xuất JSON')}</button></div>
    {error ? <p role="alert" className="notice">{l('Không tải được file hoặc host đã từ chối. Thử lại hoặc xuất từ cửa sổ native.')}</p> : null}
  </section>;
}
