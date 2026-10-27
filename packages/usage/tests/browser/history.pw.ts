import { test, expect } from '@playwright/test';
import { mixedDashboard } from '../fixtures/mixed';
const now = new Date('2026-10-17T12:00:00Z');
function data() {
  const value: any = mixedDashboard();
  const row = (date: string, provider: string, amount: number) => ({ date, provider, aggregate: {
    tokens: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, total: 10 },
    cost: { amountUSD: amount, knownCostUSD: amount, status: 'estimated' },
    models: [{ name: provider + '-history', tokens: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, total: 10 }, cost: { amountUSD: amount, knownCostUSD: amount, status: 'estimated' } }],
  } });
  value.snapshot.history = { version: 1, providers: ['codex', 'claude'], days: [row('2026-09-30', 'claude', 8), row('2026-10-16', 'codex', .1), row('2026-10-17', 'codex', .47), row('2026-10-17', 'claude', 1.25)] };
  return value;
}
test('history filters and day drilldown preserve pinned session and do not request more data', async ({ page }) => {
  let calls = 0; await page.clock.install({ time: now });
  await page.route('**/__usage/snapshot', route => { calls++; return route.fulfill({ json: data() }); });
  await page.goto('/'); await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await page.getByRole('button', { name: 'Ghim phiên', exact: true }).click();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByLabel('Khoảng lịch sử').selectOption('7d');
  await expect(page.getByTestId('history-cost')).toHaveText('$1.82');
  await page.getByRole('button', { name: '2026-10-17:', exact: false }).click();
  await expect(page.getByTestId('history-models')).toContainText('claude-history');
  await page.getByLabel('Công cụ lịch sử').selectOption('claude');
  await expect(page.getByTestId('history-cost')).toHaveText('$1.25');
  await page.getByLabel('Khoảng lịch sử').selectOption('previous');
  await expect(page.getByTestId('history-cost')).toHaveText('$8.00');
  await page.getByLabel('Khoảng lịch sử').selectOption('custom');
  await page.getByLabel('Từ ngày').fill('2026-10-17'); await page.getByLabel('Đến ngày').fill('2026-10-16');
  await expect(page.getByRole('alert').filter({ hasText: 'Khoảng ngày không hợp lệ' })).toBeVisible();
  await expect(page.getByTestId('history-cost')).toHaveText('$8.00');
  await page.getByRole('tab', { name: 'Phiên', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await expect(page.getByRole('button', { name: 'Bỏ ghim phiên', exact: true })).toBeVisible();
  expect(calls).toBe(1);
});
test('missing history does not invent totals and history remains readable in all languages at320px', async ({ page }) => {
  const value = data(); delete value.snapshot.history;
  await page.clock.install({ time: now }); await page.route('**/__usage/snapshot', route => route.fulfill({ json: value }));
  await page.goto('/'); await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(page.getByTestId('history-unavailable')).toBeVisible();
  value.snapshot.history = data().snapshot.history;
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  for (const language of ['EN', 'VI', '中文']) {
    await page.getByRole('button', { name: language, exact: true }).click();
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.setViewportSize({ width: 320, height: 1000 }); await page.emulateMedia({ colorScheme });
      await expect(page.getByTestId('history-cost')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('unknown day/model pricing stays explicit and a new tool request leaves history to show its session', async ({ page }) => {
  const value = data();
  const row = value.snapshot.history.days.at(-1)!;
  row.aggregate.cost = { amountUSD: null, knownCostUSD: 0, status: 'unknown' };
  row.aggregate.models[0].cost = row.aggregate.cost;
  await page.clock.install({ time: now });
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: value }));
  await page.goto('/'); await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByLabel('Công cụ lịch sử').selectOption('claude');
  await page.getByLabel('Khoảng lịch sử').selectOption('7d');
  await expect(page.getByTestId('history-cost')).toHaveText('—');
  await expect(page.getByTestId('history-models')).toContainText('—');
  value.requestedSessionId = value.snapshot.sessions.find((s: any) => s.provider === 'claude').id;
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await expect(page.getByRole('tab', { name: 'Phiên', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
});
test('first history opening copies current provider once, then keeps independent filters across tabs', async ({ page }) => {
  await page.clock.install({ time: now }); await page.route('**/__usage/snapshot', route => route.fulfill({ json: data() }));
  await page.goto('/');
  await page.getByRole('group', { name: 'Công cụ', exact: true }).getByRole('button', { name: 'Claude Code', exact: true }).click();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(page.getByLabel('Công cụ lịch sử')).toHaveValue('claude');
  await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByLabel('Khoảng lịch sử').selectOption('previous');
  await page.getByRole('tab', { name: 'Phiên', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(page.getByLabel('Công cụ lịch sử')).toHaveValue('all');
  await expect(page.getByLabel('Khoảng lịch sử')).toHaveValue('previous');
});
test('custom dates survive a timezone change that temporarily makes the end date future', async ({ page }) => {
  const value = data(); value.snapshot.timeZone = 'UTC'; value.snapshot.generatedAt = '2026-10-01T00:30:00Z';
  value.snapshot.history.days = [value.snapshot.history.days[2]];
  value.snapshot.history.days[0].date = '2026-10-01';
  await page.clock.install({ time: new Date('2026-10-01T00:30:00Z') });
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: value }));
  await page.goto('/'); await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByLabel('Khoảng lịch sử').selectOption('custom');
  await page.getByLabel('Từ ngày').fill('2026-10-01'); await page.getByLabel('Đến ngày').fill('2026-10-01');
  await expect(page.getByTestId('history-cost')).toHaveText('$0.47');
  value.snapshot.timeZone = 'America/Los_Angeles';
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await expect(page.getByTestId('history-unavailable')).toBeVisible();
  value.snapshot.timeZone = 'UTC';
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await expect(page.getByTestId('history-cost')).toHaveText('$0.47');
  await expect(page.getByLabel('Từ ngày')).toHaveValue('2026-10-01');
});
