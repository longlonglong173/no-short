import { test, expect } from '@playwright/test';
import { buildSnapshot } from '../../src/adapter';
import raw from '../fixtures/unified.json' with { type: 'json' };
const now = new Date('2026-10-17T05:00:00Z');
function dashboard() {
  const metadata = new Map([[raw.session[0].period, { title: 'Báo cáo tuần', kind: 'main' as const }], [raw.session[1].period, { title: 'Thiết kế panel', kind: 'main' as const }]]);
  return { snapshot: buildSnapshot(structuredClone(raw), { now, timeZone: 'Asia/Ho_Chi_Minh', metadata }), selectedSession: null, requestedSessionId: null };
}

test('shows real model costs, switches periods, and pins a chosen session', async ({ page }) => {
  const value = dashboard();
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: value }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No Short Usage' })).toBeVisible();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await page.getByRole('tab', { name: 'Hôm nay' }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.47');
  await page.getByRole('tab', { name: 'Tháng này' }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.57');
  await page.getByRole('tab', { name: 'Phiên', exact: true }).click();
  await page.getByLabel('Chọn phiên').click();
  await page.getByRole('searchbox', { name: 'Tìm phiên' }).fill('Báo cáo');
  await page.getByRole('button', { name: 'Báo cáo tuần' }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.42');
  await expect(page.getByRole('button', { name: 'Bỏ ghim phiên' })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.42');
  await page.getByRole('button', { name: 'Bỏ ghim phiên' }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await expect(page.getByText('Ước tính — không phải hóa đơn hoặc credit ChatGPT đã trừ')).toBeVisible();
  await page.screenshot({ path: '../../.artifacts/usage/panel-light-fixture.png', fullPage: true });
});

test('unknown pricing stays unknown and a missing pinned session is not silently replaced', async ({ page }) => {
  const value = dashboard();
  value.snapshot.sessions[0].cost = { amountUSD: null, knownCostUSD: 0, status: 'unknown' };
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: value }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('Chưa xác định');
  await page.getByRole('button', { name: 'Ghim phiên' }).click();
  value.snapshot.sessions = value.snapshot.sessions.slice(1);
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await expect(page.getByText('Phiên đã ghim không còn dữ liệu.')).toBeVisible();
});

test('mobile and dark mode remain readable without horizontal overflow', async ({ page }) => {
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: dashboard() }));
  await page.setViewportSize({ width: 375, height: 900 }); await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/'); await expect(page.getByTestId('main-cost')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../../.artifacts/usage/panel-dark-mobile.png', fullPage: true });
});

test('does not poll while document is hidden', async ({ page }) => {
  await page.clock.install(); let calls = 0;
  await page.route('**/__usage/snapshot', route => { calls++; return route.fulfill({ json: dashboard() }); });
  await page.goto('/'); await expect(page.getByTestId('main-cost')).toBeVisible();
  await page.clock.runFor(15_100); await expect.poll(() => calls).toBe(2);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(45_000); expect(calls).toBe(2);
});

test('shows the exact session requested by a tool result, even when it is not the latest', async ({ page }) => {
  const value: any = dashboard(); value.requestedSessionId = raw.session[0].period;
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: value }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('$0.42');
});

test('keyboard can switch periods and choose a session', async ({ page }) => {
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: dashboard() }));
  await page.goto('/'); await expect(page.getByTestId('main-cost')).toBeVisible();
  await page.getByRole('tab', { name: 'Phiên', exact: true }).focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Hôm nay' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Phiên', exact: true }).press('Enter');
  await page.getByLabel('Chọn phiên').press('Enter');
  await page.keyboard.press('Tab'); await page.keyboard.type('Báo cáo');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.getByTestId('main-cost')).toHaveText('$0.42');
});

test('a failed refresh retains the last successful amount with a visible warning', async ({ page }) => {
  let fail = false;
  await page.route('**/__usage/snapshot', route => route.fulfill(fail ? { status: 500, json: { error: 'unavailable' } } : { json: dashboard() }));
  await page.goto('/'); await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  fail = true; await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await expect(page.getByRole('alert')).toContainText('Không cập nhật được thống kê');
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
});
