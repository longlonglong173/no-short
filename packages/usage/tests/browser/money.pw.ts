import { test, expect } from '@playwright/test';
import { moneyDashboard } from '../fixtures/money-dashboard';
for (const lang of ['VI', 'EN', '中文'] as const) test(`known money survives every consumer at360px ${lang}`, async ({ page }, info) => {
  const value = moneyDashboard();
  await page.clock.install({ time: new Date(value.snapshot.generatedAt) });
  await page.setViewportSize({ width: 360, height: 1000 });
  await page.route('**/__usage/snapshot', r => r.fulfill({ json: value }));
  await page.goto('/'); await page.getByRole('button', { name: lang, exact: true }).click();
  await page.screenshot({ path: info.outputPath('main.png'), fullPage: true });
  await expect(page.getByTestId('main-cost')).toHaveText('≥$12.34');
  await expect(page.getByTestId('main-cost')).toHaveAccessibleDescription(({VI: 'Chưa đầy đủ', EN: 'Incomplete', '中文': '不完整'} as const)[lang]);
  await expect(page.locator('.partial-note')).not.toContainText('$');
  await expect(page.locator('.money-legend')).toBeVisible();
  await expect(page.locator('.model-row').filter({ hasText: 'priced-model' })).toContainText('≥$12.34');
  await expect(page.locator('.model-row').filter({ hasText: 'missing-model' }).locator('span').last()).toHaveText('—');
  await expect(page.locator('.period-totals')).toContainText('≥$16.90');
  await page.locator('.session-picker summary').click();
  await expect(page.locator('.session-results button').first()).toContainText('≥$12.34');
  await page.locator('.session-picker summary').click();
  // Change language after selecting dates to keep selectors focused on behavior.
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByLabel('Khoảng lịch sử', { exact: true }).selectOption('custom');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-10-27');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2026-10-27');
  await expect(page.getByTestId('history-cost')).toHaveText('≥$12.34');
  await page.getByRole('button', { name: '2026-10-27: ≥$12.34 · Chưa đầy đủ', exact: true }).click();
  const line = page.locator('.history-session-list li span');
  await expect(line).toContainText('≥$12.34');
  expect((await line.innerText()).match(/≥\$12\.34/g)).toHaveLength(1);
  await page.getByTestId('history-sessions').getByRole('button', { name: 'money-current', exact: true }).click();
  await expect(page.getByTestId('history-session-detail')).toContainText('≥$12.34');
  await expect(page.getByTestId('history-models').locator('tbody tr').first().locator('td').last()).toHaveText('≥$12.34');
  await expect(page.getByTestId('history-models').locator('tbody tr').last().locator('td').last()).toHaveText('—');
  for (const mode of ['project', 'work']) {
    await page.getByLabel('Nhóm usage', { exact: true }).selectOption(mode);
    const groups = page.getByTestId('history-grouping');
    await expect(groups.locator('summary')).toContainText('≥$12.34');
    await groups.locator('summary').click();
    await expect(groups.locator('tbody tr td').last()).toHaveText('≥$12.34');
  }
  await page.getByLabel('So sánh với kỳ trước cùng độ dài', { exact: true }).check();
  await expect(page.getByTestId('comparison-cost-delta')).toHaveText('Chưa đủ dữ liệu giá hoặc dữ liệu đã cũ.');
  await page.getByRole('button', { name: lang, exact: true }).click();
  const comparison = page.getByTestId('history-comparison');
  await expect(comparison).toContainText('≥$12.34'); await expect(comparison).toContainText('≥$4.56');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    await page.screenshot({ path: info.outputPath(`history-${colorScheme}.png`), fullPage: true });
  }
});

test('partial zero, large money and legacy stale metadata remain distinct without clipping', async ({ page }, info) => {
  const value = moneyDashboard(0); value.snapshot.status = 'stale';
  for (const aggregate of [value.snapshot.today, value.snapshot.month, ...value.snapshot.sessions]) {
    for (const model of aggregate.models) delete model.pricing;
  }
  const raw = JSON.stringify(value);
  await page.clock.install({ time: new Date(value.snapshot.generatedAt) });
  await page.setViewportSize({ width: 360, height: 1000 });
  await page.route('**/__usage/snapshot', r => r.fulfill({ json: value }));
  await page.goto('/'); await page.getByRole('button', { name: 'VI', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('≥$0.00');
  await expect(page.locator('.partial-note')).toContainText('Còn model chưa định giá');
  await expect(page.getByRole('status')).toContainText('Chưa cập nhật');
  expect(JSON.stringify(value)).toBe(raw);
  value.snapshot = moneyDashboard(999999999.995).snapshot;
  await page.getByRole('button', { name: 'Cập nhật thống kê', exact: true }).click();
  for (const lang of ['VI', 'EN', '中文']) {
    await page.getByRole('button', { name: lang, exact: true }).click();
    await expect(page.getByTestId('main-cost')).toHaveText('≥$1,000,000,000.00');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    const box = await page.getByTestId('main-cost').boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    await page.screenshot({ path: info.outputPath(`large-${lang}.png`), fullPage: true });
  }
});

test('history money appears once in each contributing-session and model cell', async ({ page }, info) => {
  const value = moneyDashboard();
  await page.clock.install({ time: new Date(value.snapshot.generatedAt) });
  await page.route('**/__usage/snapshot', r => r.fulfill({ json: value }));
  await page.goto('/'); await page.getByRole('button', { name: 'VI', exact: true }).click();
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await page.getByRole('button', { name: '2026-10-27: ≥$12.34 · Chưa đầy đủ', exact: true }).click();
  await page.screenshot({ path: info.outputPath('history-single-money.png'), fullPage: true });
  expect((await page.locator('.history-session-list li span').innerText()).match(/≥\$12\.34/g)).toHaveLength(1);
  await expect(page.getByTestId('history-models').locator('tbody tr').first().locator('td').last()).toHaveText('≥$12.34');
});


test('all five money states and fully priced large totals keep every digit at360px', async ({ page }, info) => {
  const value = moneyDashboard();
  await page.clock.install({ time: new Date(value.snapshot.generatedAt) });
  await page.setViewportSize({ width: 360, height: 1000 });
  await page.route('**/__usage/snapshot', r => r.fulfill({ json: value }));
  await page.goto('/');
  const states = [
    { amountUSD: 12.34, knownCostUSD: 12.34, status: 'estimated', text: '$12.34' },
    { amountUSD: null, knownCostUSD: 12.34, status: 'partial', text: '≥$12.34' },
    { amountUSD: null, knownCostUSD: 0, status: 'unknown', text: '—' },
    { amountUSD: 0, knownCostUSD: 0, status: 'estimated', text: '$0.00' },
    { amountUSD: null, knownCostUSD: 0, status: 'partial', text: '≥$0.00' },
    { amountUSD: 999999999.995, knownCostUSD: 999999999.995, status: 'estimated', text: '$1,000,000,000.00' },
  ] as const;
  for (const { text, ...cost } of states) {
    value.snapshot.sessions[0].cost = { ...cost };
    await page.getByRole('button', { name: /刷新用量|Cập nhật thống kê|Refresh usage/ }).click();
    for (const lang of ['VI', 'EN', '中文']) {
      await page.getByRole('button', { name: lang, exact: true }).click();
      await expect(page.getByTestId('main-cost')).toHaveText(text);
      await page.screenshot({ path: info.outputPath(`${cost.status}-${cost.knownCostUSD}-${lang}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    }
  }
});
