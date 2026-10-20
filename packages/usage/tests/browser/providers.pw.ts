import { test, expect } from '@playwright/test';
import { mixedDashboard } from '../fixtures/mixed';
import { buildSnapshot } from '../../src/adapter';
import raw from '../fixtures/unified.json' with { type: 'json' };

test('provider filters scope periods, models, chart, sessions and persisted pins without extra requests', async ({ page }) => {
  let calls = 0;
  await page.route('**/__usage/snapshot', route => { calls++; return route.fulfill({ json: mixedDashboard() }); });
  await page.goto('/');
  const filter = page.getByRole('group', { name: 'Công cụ', exact: true });
  await expect(filter).toBeVisible();
  await filter.getByRole('button', { name: 'Claude Code', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  await expect(page.getByLabel('Chi phí theo model')).toContainText('claude-fixture');
  await expect(page.getByLabel('Chi phí theo model')).not.toContainText('gpt-');
  await expect(page.locator('.scope-label')).toContainText('Claude Code');
  await page.getByLabel('Chọn phiên').click();
  await expect(page.locator('.session-results button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Claude fixture' }).click();
  await page.getByRole('tab', { name: 'Hôm nay', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$1.25');
  await expect(page.locator('.period-totals')).toContainText('$3.75');
  await expect(page.locator('.chart-column').last()).toHaveAttribute('title', '2026-10-17: $1.25');
  await page.getByRole('tab', { name: 'Tháng này', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$3.75');
  await page.reload();
  await expect(filter.getByRole('button', { name: 'Claude Code', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  await expect(page.getByRole('button', { name: 'Bỏ ghim phiên', exact: true })).toBeVisible();
  await filter.getByRole('button', { name: 'Tất cả', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ghim phiên', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Hôm nay', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$1.72');
  await expect(page.getByLabel('Chi phí theo model')).toContainText('gpt-');
  await expect(page.getByLabel('Chi phí theo model')).toContainText('claude-fixture');
  await expect(page.locator('.chart-column').last()).toHaveAttribute('title', '2026-10-17: $1.72');
  expect(calls).toBe(2);
});

test('provider keyboard controls preserve partial pricing and localize at narrow widths', async ({ page }) => {
  const data = mixedDashboard();
  const breakdown = data.snapshot.providerBreakdowns!.find(p => p.provider === 'claude')!;
  breakdown.today.cost = { amountUSD: null, knownCostUSD: 1.25, status: 'partial' };
  breakdown.today.models.push({ name: 'claude-unpriced', tokens: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, total: 10 },
    cost: { amountUSD: null, knownCostUSD: 0, status: 'unknown' } });
  breakdown.today.tokens.input += 10; breakdown.today.tokens.total += 10;
  breakdown.chart.at(-1)!.cost = breakdown.today.cost;
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await page.getByRole('group', { name: 'Công cụ', exact: true }).getByRole('button', { name: 'Claude Code' }).press('Enter');
  await page.getByRole('tab', { name: 'Hôm nay', exact: true }).click();
  for (const [language, incomplete, unknown, scope] of [
    ['VI', 'Chưa đầy đủ', 'Chưa xác định', 'Tất cả phiên'],
    ['EN', 'Incomplete', 'Unknown', 'All sessions'],
    ['中文', '不完整', '未知', '所有会话'],
  ]) {
    await page.getByRole('button', { name: language, exact: true }).click();
    await expect(page.getByTestId('main-cost')).toHaveText(incomplete);
    await expect(page.locator('.model-row').filter({ hasText: 'claude-unpriced' })).toContainText(unknown);
    await expect(page.locator('.partial-note')).toContainText('$1.25');
    await expect(page.locator('.scope-label')).toContainText(scope);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 320, height: 1000 });
      await page.emulateMedia({ colorScheme });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `../../.artifacts/usage/ns06-${language === '中文' ? 'zh' : language}-${colorScheme}.png`, fullPage: true });
    }
  }
});

test('an explicitly requested Claude session sets its provider once, not after every refresh', async ({ page }) => {
  const data = mixedDashboard();
  data.requestedSessionId = data.snapshot.sessions.find(s => s.provider === 'claude')!.id;
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  const filter = page.getByRole('group', { name: 'Công cụ', exact: true });
  await expect(filter.getByRole('button', { name: 'Claude Code' })).toHaveAttribute('aria-pressed', 'true');
  await filter.getByRole('button', { name: 'Codex', exact: true }).click();
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await expect(filter.getByRole('button', { name: 'Codex', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a configured but empty Claude source displays zero period usage, not Codex totals or a loading skeleton', async ({ page }) => {
  const data = mixedDashboard();
  data.snapshot.sessions = data.snapshot.sessions.filter(s => s.provider !== 'claude');
  const breakdown = data.snapshot.providerBreakdowns!.find(p => p.provider === 'claude')!;
  const empty = { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: { amountUSD: 0, knownCostUSD: 0, status: 'estimated' as const }, models: [] };
  breakdown.today = empty; breakdown.month = empty;
  breakdown.chart = breakdown.chart.map(p => ({ date: p.date, cost: empty.cost }));
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await page.getByRole('group', { name: 'Công cụ', exact: true }).getByRole('button', { name: 'Claude Code' }).click();
  await expect(page.getByText('Chưa có phiên cho công cụ này.')).toBeVisible();
  await page.getByRole('tab', { name: 'Hôm nay', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.00');
  await expect(page.getByLabel('Chi phí theo model')).not.toContainText('gpt-');
});

test('old Codex-only schema v1 renders without provider controls even with an obsolete saved filter', async ({ page }) => {
  const snapshot = buildSnapshot(raw, { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map() });
  delete snapshot.providerBreakdowns;
  snapshot.sessions.forEach(s => { delete s.provider; });
  await page.addInitScript(() => localStorage.setItem('no-short-usage-selection-v1', JSON.stringify({ sessionId: null, providerFilter: 'claude' })));
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: { snapshot, selectedSession: null, requestedSessionId: null } }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await expect(page.getByRole('group', { name: 'Công cụ', exact: true })).toHaveCount(0);
  await expect(page.locator('.scope-label')).toHaveText('Toàn phiên · Codex');
  await page.getByRole('tab', { name: 'Hôm nay', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.47');
  await expect(page.locator('.chart-column').last()).toHaveAttribute('title', '2026-10-17: $0.47');
});

test('mixed snapshots without provider breakdowns never show combined daily costs as provider costs', async ({ page }) => {
  const data = mixedDashboard(); delete data.snapshot.providerBreakdowns;
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await page.getByRole('group', { name: 'Công cụ', exact: true }).getByRole('button', { name: 'Claude Code' }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  await page.getByRole('tab', { name: 'Hôm nay', exact: true }).click();
  await expect(page.getByText('Chưa có tổng theo công cụ cho khoảng thời gian này.')).toBeVisible();
  await expect(page.getByTestId('main-cost')).toHaveCount(0);
  await page.getByRole('group', { name: 'Công cụ', exact: true }).getByRole('button', { name: 'Tất cả', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$1.72');
});

test('blocked browser storage restores provider and pin from host state and preserves unrelated host preferences', async ({ page }) => {
  const data = mixedDashboard(); const sessionId = data.snapshot.sessions.find(s => s.provider === 'claude')!.id;
  await page.addInitScript(id => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    window.openai = { widgetState: { noShortUsageSelection: { sessionId: id, providerFilter: 'claude' }, unrelated: 'keep' },
      setWidgetState: state => { (window as any).lastWidgetState = state; } };
  }, sessionId);
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  await page.getByRole('group', { name: 'Công cụ', exact: true }).getByRole('button', { name: 'Codex', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  const state = await page.evaluate(() => (window as any).lastWidgetState);
  expect(state.noShortUsageSelection).toEqual({ sessionId: null, providerFilter: 'codex' });
  expect(state.unrelated).toBe('keep');
});

test('late host selection restoration works with blocked storage but cannot override manual choices', async ({ page }) => {
  const data = mixedDashboard();
  const sessionId = data.snapshot.sessions.find(s => s.provider === 'claude')!.id;
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }));
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await page.evaluate(id => {
    window.openai = { widgetState: { noShortUsageSelection: { sessionId: id, providerFilter: 'claude' } } };
    window.dispatchEvent(new Event('openai:set_globals'));
  }, sessionId);
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  await expect(page.getByRole('button', { name: 'Bỏ ghim phiên', exact: true })).toBeVisible();
  const filter = page.getByRole('group', { name: 'Công cụ', exact: true });
  await expect(filter.getByRole('button', { name: 'Claude Code' })).toHaveAttribute('aria-pressed', 'true');
  await filter.getByRole('button', { name: 'Codex', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('openai:set_globals')));
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await expect(filter.getByRole('button', { name: 'Codex', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('explicit tool requests outrank later host restoration even after a normal dashboard refresh', async ({ page }) => {
  const data = mixedDashboard();
  const requestedId = data.snapshot.sessions.find(s => s.provider === 'codex')!.id;
  const hostId = data.snapshot.sessions.find(s => s.provider === 'claude')!.id;
  data.requestedSessionId = requestedId;
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await expect(page.getByRole('button', { name: 'Bỏ ghim phiên', exact: true })).toBeVisible();
  data.requestedSessionId = null;
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await page.evaluate(id => {
    window.openai = { widgetState: { noShortUsageSelection: { sessionId: id, providerFilter: 'claude' } } };
    window.dispatchEvent(new Event('openai:set_globals'));
  }, hostId);
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  await expect(page.getByRole('button', { name: 'Bỏ ghim phiên', exact: true })).toBeVisible();
});

test('clicking the active provider does not clear a pinned session', async ({ page }) => {
  const data = mixedDashboard();
  data.snapshot.sessions.find(s => s.provider === 'codex' && s.cost.amountUSD === 0.42)!.title = 'Pinned Codex fixture';
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await page.getByLabel('Chọn phiên').click();
  await page.getByRole('button', { name: 'Pinned Codex fixture' }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.42');
  await page.getByRole('group', { name: 'Công cụ', exact: true }).getByRole('button', { name: 'Codex', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.42');
  await expect(page.getByRole('button', { name: 'Bỏ ghim phiên', exact: true })).toBeVisible();
});

test('pre-filter saved Claude pins migrate without being mislabeled as missing Codex sessions', async ({ page }) => {
  const data = mixedDashboard(); const sessionId = data.snapshot.sessions.find(s => s.provider === 'claude')!.id;
  await page.addInitScript(id => localStorage.setItem('no-short-usage-selection-v1', JSON.stringify({ sessionId: id })), sessionId);
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  await expect(page.getByRole('group', { name: 'Công cụ', exact: true }).getByRole('button', { name: 'Claude Code' })).toHaveAttribute('aria-pressed', 'true');
});

test('retained legacy tool metadata is not replayed after polling, while fresh explicit requests still select that session', async ({ page }) => {
  const data = mixedDashboard();
  data.requestedSessionId = data.snapshot.sessions.find(s => s.provider === 'claude')!.id;
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
  await page.evaluate(usage => {
    window.openai = { toolResponseMetadata: { _meta: { usage } } };
    window.dispatchEvent(new Event('openai:set_globals'));
  }, data);
  const filter = page.getByRole('group', { name: 'Công cụ', exact: true });
  await filter.getByRole('button', { name: 'Codex', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  data.requestedSessionId = null;
  data.snapshot.notice = 'poll completed';
  await page.getByRole('button', { name: 'Cập nhật thống kê' }).click();
  await expect(page.getByRole('alert')).toHaveText('poll completed');
  await page.evaluate(() => window.dispatchEvent(new Event('openai:set_globals')));
  await expect(page.getByRole('alert')).toHaveText('poll completed');
  await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  // An actual new tool response can intentionally request the same session,
  // including twice without an intervening dashboard poll.
  for (let request = 0; request < 2; request++) {
    await page.evaluate(() => {
      window.openai!.toolResponseMetadata = structuredClone(window.openai!.toolResponseMetadata);
      window.dispatchEvent(new Event('openai:set_globals'));
    });
    await expect(page.getByTestId('main-cost')).toHaveText('$4.00');
    await filter.getByRole('button', { name: 'Codex', exact: true }).click();
    await expect(page.getByTestId('main-cost')).toHaveText('$0.05');
  }
});
