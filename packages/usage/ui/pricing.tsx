import type { ModelPricing, SnapshotPricing } from '../src/pricing';
import { useTranslation } from './language';

export function PricingOrigin({ pricing }: { pricing?: ModelPricing }) {
  const { l } = useTranslation();
  if (!pricing) return null;
  const label = pricing.source === 'custom' ? 'Giá tùy chỉnh' : pricing.source === 'fallback' ? 'Giá fallback chưa được xác nhận'
    : pricing.source === 'unpriced' ? 'Chưa biết giá' : pricing.source === 'mixed' ? 'Nhiều nguồn giá' : 'Giá theo ccusage';
  return <small className="pricing-origin"><span>{l(label)}</span>
    {pricing.updatedAt ? <span>{l('Cấu hình cập nhật')}: {pricing.updatedAt}</span> : null}
    {pricing.rates ? <span>USD/1M · {l('Input')} {pricing.rates.input} · {l('Output')} {pricing.rates.output} · {l('Cache read')} {pricing.rates.cacheRead} · {l('Cache write')} {pricing.rates.cacheWrite}</span>
      : pricing.source === 'ccusage' ? <span>{l('Đơn giá và ngày hiệu lực chưa được nguồn cung cấp.')}</span> : null}
  </small>;
}
export function PricingBasis({ pricing }: { pricing?: SnapshotPricing }) {
  const { l } = useTranslation();
  return pricing ? <p className="history-scope" data-testid="pricing-basis">{l(pricing.basis === 'current-custom-rates'
    ? 'Có giá tùy chỉnh: lịch sử được tính lại theo cấu hình hiện tại, không phải giá tại thời điểm sử dụng.'
    : 'Giá theo báo cáo ccusage; chưa có ngày hiệu lực đơn giá.')}</p> : null;
}
