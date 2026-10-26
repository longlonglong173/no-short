import { test, expect } from '@playwright/test';
import fixture from '../fixtures/insights-snapshot.json' with { type: 'json' };
import { mixedDashboard } from '../fixtures/mixed';
const data = () => ({ ...mixedDashboard(), snapshot: structuredClone(fixture) });
test('default off; local opt-ins persist; provider and stale changes recompute without extra reads', async ({ page }) => {
  let calls=0; await page.clock.install({time:new Date(fixture.generatedAt)});
  await page.route('**/__usage/snapshot',r=>{calls++; return r.fulfill({json:data()});});
  await page.goto('/'); await page.getByRole('tab',{name:'Lịch sử',exact:true}).click();
  await expect(page.getByTestId('usage-insights')).toHaveCount(0);
  await page.getByLabel('Công cụ lịch sử').selectOption('codex');
  await page.getByLabel('Bật cảnh báo mức dùng bất thường').check();
  await page.getByLabel('Bật kịch bản chi phí cuối tháng').check();
  const panel=page.getByTestId('usage-insights');
  await expect(panel).toContainText('2024-02-20 → 2024-03-01');
  await expect(panel).toContainText('$120.71'); await expect(panel).toContainText('2 × $4.00 = $8.00');
  await expect(panel).toContainText('29');
  for(const language of ['EN','VI','中文']) {
    await page.getByRole('button',{name:language,exact:true}).click(); await page.setViewportSize({width:320,height:900});
    await expect(panel).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'VI',exact:true}).click();
  await page.getByLabel('Công cụ lịch sử').selectOption('claude');
  await expect(panel).toContainText('Cần 7 ngày có quan sát trong 30 ngày trước hôm nay.');
  expect(calls).toBe(1);
  await page.reload(); await page.getByRole('tab',{name:'Lịch sử',exact:true}).click();
  await expect(page.getByLabel('Bật kịch bản chi phí cuối tháng')).toBeChecked();
  await page.clock.fastForward(46_000); await expect(page.getByTestId('usage-insights')).toContainText('Dữ liệu cũ hoặc lỗi; cần làm mới.');
});
test('recent incomplete observation blocks both outputs and reader errors remain visible',async({page})=>{
  const value:any=data(), a=value.snapshot.history.days[7].aggregate;
  a.cost={amountUSD:null,knownCostUSD:1,status:'partial'}; a.models[0].cost=a.cost;
  await page.clock.install({time:new Date(fixture.generatedAt)});
  await page.route('**/__usage/snapshot',r=>r.fulfill({json:value})); await page.goto('/');
  await page.getByRole('tab',{name:'Lịch sử',exact:true}).click(); await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByLabel('Bật cảnh báo mức dùng bất thường').check(); await page.getByLabel('Bật kịch bản chi phí cuối tháng').check();
  await expect(page.getByTestId('usage-insights')).toContainText('Thiếu cơ sở giá đầy đủ; không suy ra từ phần đã biết.');
  await expect(page.getByTestId('usage-insights')).not.toContainText('$120.71');
  value.snapshot.status='error'; await page.getByRole('button',{name:'Cập nhật thống kê'}).click();
  await expect(page.getByTestId('usage-insights')).toContainText('Dữ liệu cũ hoặc lỗi; cần làm mới.');
  await expect(page.getByRole('alert').first()).toBeVisible();
});
test('combined provider overflow shows insufficient basis without Infinity or a positive anomaly alert',async({page})=>{
  const value:any=data(), row=value.snapshot.history.days.at(-1);
  row.aggregate.cost={amountUSD:1e308,knownCostUSD:1e308,status:'estimated'};
  row.aggregate.models[0].cost={...row.aggregate.cost};
  value.snapshot.history.days.push({...structuredClone(row),provider:'claude'});
  await page.clock.install({time:new Date(fixture.generatedAt)});
  await page.route('**/__usage/snapshot',r=>r.fulfill({json:value})); await page.goto('/');
  await page.getByRole('tab',{name:'Lịch sử',exact:true}).click(); await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByLabel('Bật cảnh báo mức dùng bất thường').check(); await page.getByLabel('Bật kịch bản chi phí cuối tháng').check();
  const panel=page.getByTestId('usage-insights');
  await expect(panel).not.toContainText('Chi phí hôm nay vượt ngưỡng bất thường.');
  await expect(panel).not.toContainText('Infinity');
  await expect(panel.getByRole('status')).toHaveCount(0);
  await expect(panel).toContainText('Chi phí vượt giới hạn tính toán; chưa đủ căn cứ.');
});
