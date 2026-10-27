import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import snapshot from '../fixtures/ns21-mixed-snapshot.json' with { type: 'json' };

test('shared real-reader lower bound reaches panel history and downloaded JSON/CSV', async ({ page }) => {
  await page.clock.install({ time: new Date(snapshot.generatedAt) });
  await page.route('**/__usage/snapshot', route => route.fulfill({ json: { snapshot, selectedSession: null, requestedSessionId: null } }));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Hôm nay', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('≥$1.69');
  await expect(page.locator('.partial-note')).toHaveText('Còn model chưa định giá');
  await page.getByRole('tab', { name: 'Tháng này', exact: true }).click();
  await expect(page.getByTestId('main-cost')).toHaveText('≥$1.69');
  await expect(page.locator('.partial-note')).toHaveText('Còn model chưa định giá');
  await page.getByRole('tab', { name: 'Lịch sử', exact: true }).click();
  await expect(page.getByTestId('history-cost')).toHaveText('≥$1.69');
  await expect(page.locator('.history-price-note')).toHaveText('Giá chưa đầy đủ, không phải $0.');
  await expect(page.getByTestId('history-models')).toContainText('gpt-5');
  let waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  const document = JSON.parse(await readFile((await (await waiting).path())!, 'utf8'));
  expect(document.aggregate.cost).toEqual({ amountUSD: null, knownCostUSD: 1.6875, status: 'partial' });
  expect(document.aggregate.models).toHaveLength(1);
  waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất CSV', exact: true }).click();
  const csv = await readFile((await (await waiting).path())!, 'utf8');
  expect(csv.split('\n').find(row => row.startsWith('"aggregate"'))).toContain(',,1.6875,"partial"');
});
