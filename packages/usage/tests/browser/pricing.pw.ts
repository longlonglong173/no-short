import { test, expect } from '@playwright/test';
import { buildSnapshot } from '../../src/adapter';
import raw from '../fixtures/unified.json' with { type: 'json' };

test('custom pricing provenance, rates and repriced history remain visible across languages', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-17T05:00:00Z') });
  const snapshot = buildSnapshot(structuredClone(raw), { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map(),
    pricing: { version: 1, updatedAt: '2026-10-17T04:00:00Z', overrides: [{ provider: 'codex', model: 'gpt-6.1-sol', input: 2, output: 8, cacheRead: .5, cacheWrite: 3 }] } });
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: { snapshot, selectedSession: null, requestedSessionId: null } }));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Hôm nay', exact: true }).click();
  await expect(page.getByText('Giá tùy chỉnh', { exact: true })).toBeVisible();
  await expect(page.getByText('2026-10-17T04:00:00Z', { exact: false })).toBeVisible();
  await expect(page.getByTestId('pricing-basis')).toContainText('lịch sử được tính lại');
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(page.getByTestId('history-models')).toContainText('Giá tùy chỉnh');
  await expect(page.getByTestId('history-models')).toContainText('USD/1M');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByTestId('pricing-basis')).toContainText('repriced');
  await expect(page.getByTestId('history-models')).toContainText('Custom price');
  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByTestId('history-models').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '../../.artifacts/usage/ns16-panel-en-compact.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.getByTestId('history-models')).toContainText('自定义价格');
});
