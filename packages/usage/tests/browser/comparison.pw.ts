import { test, expect } from '@playwright/test';
import { mixedDashboard } from '../fixtures/mixed';
import fixture from '../fixtures/comparison-snapshot.json' with { type: 'json' };
function data() {
  const value: any = mixedDashboard();
  value.snapshot = { ...structuredClone(fixture), sessions: value.snapshot.sessions };
  return value;
}
test('comparison is opt-in, uses current filters and keeps pin/export scope without extra reads', async ({ page }) => {
  let calls = 0; await page.clock.install({ time: new Date(fixture.generatedAt) });
  await page.route('**/__usage/snapshot', route => { calls++; return route.fulfill({ json: data() }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Ghim phiên', exact: true }).click();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(page.getByTestId('history-comparison')).toHaveCount(0);
  await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByLabel('Khoảng lịch sử').selectOption('custom');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2024-03-01');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2024-03-02');
  await page.getByLabel('So sánh với kỳ trước cùng độ dài', { exact: true }).check();
  const comparison = page.getByTestId('history-comparison');
  await expect(comparison).toContainText('2024-02-28 → 2024-02-29');
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('+$2.00 · +100,0%');
  await expect(comparison).toContainText('codex / model-a');
  await expect(comparison).toContainText('claude / model-b');
  await expect(comparison).toContainText('Tệp xuất chỉ gồm khoảng đã chọn, không gồm kỳ so sánh.');
  await page.getByLabel('Công cụ lịch sử').selectOption('claude');
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('+$1.00 · Không áp dụng');
  for (const language of ['EN', 'VI', '中文']) {
    await page.getByRole('button', { name: language, exact: true }).click();
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(comparison).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await page.getByRole('tab', { name: 'Phiên', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bỏ ghim phiên', exact: true })).toBeVisible();
  expect(calls).toBe(1);
});
test('incomplete and stale comparisons keep cost deltas unavailable', async ({ page }) => {
  const value = data();
  value.snapshot.history.days[0].aggregate.cost = { amountUSD: null, knownCostUSD: 0, status: 'unknown' };
  value.snapshot.history.days[0].aggregate.models[0].cost = value.snapshot.history.days[0].aggregate.cost;
  await page.clock.install({ time: new Date(fixture.generatedAt) });
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: value }));
  await page.goto('/'); await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByLabel('Khoảng lịch sử').selectOption('custom');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2024-03-01');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2024-03-02');
  await page.getByLabel('So sánh với kỳ trước cùng độ dài', { exact: true }).check();
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('Chưa đủ dữ liệu giá hoặc dữ liệu đã cũ.');
  value.snapshot.status = 'stale';
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('Chưa đủ dữ liệu giá hoặc dữ liệu đã cũ.');
});

test('comparison suppresses an aged ready payload immediately on background return', async ({ page }) => {
  let calls = 0; await page.clock.install({ time: new Date(fixture.generatedAt) });
  await page.route('**/__usage/snapshot', route => { calls++; return route.fulfill({ json: data() }); });
  await page.goto('/'); await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByLabel('Khoảng lịch sử').selectOption('custom');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2024-03-01');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2024-03-02');
  await page.getByLabel('So sánh với kỳ trước cùng độ dài', { exact: true }).check();
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('+$2.00 · +100,0%');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(60_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(calls).toBe(1);
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('Chưa đủ dữ liệu giá hoặc dữ liệu đã cũ.', { timeout: 500 });
  await expect(page.getByTestId('history-comparison')).toContainText('+160');
});
test('visible ready payload ages out even when polling returns the same generated timestamp', async ({ page }) => {
  await page.clock.install({ time: new Date(fixture.generatedAt) });
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data() }));
  await page.goto('/'); await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByLabel('Khoảng lịch sử').selectOption('custom');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2024-03-01');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2024-03-02');
  await page.getByLabel('So sánh với kỳ trước cùng độ dài', { exact: true }).check();
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('+$2.00 · +100,0%');
  await page.clock.fastForward(46_000);
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('Chưa đủ dữ liệu giá hoặc dữ liệu đã cũ.', { timeout: 500 });
});
