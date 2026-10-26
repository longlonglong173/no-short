import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import fixture from '../fixtures/grouping-snapshot.json' with {type:'json'};
test('project/work views use exact day/provider, expose unknowns and grouped exports respect opt-in',async({page})=>{
 let calls=0;const value={snapshot:structuredClone(fixture),selectedSession:null,requestedSessionId:null};
 await page.clock.install({time:new Date(fixture.generatedAt)});
 await page.route('**/__usage/snapshot',route=>{calls++;return route.fulfill({json:value});});
 await page.goto('/');await page.getByRole('tab',{name:'Lịch sử',exact:true}).click();
 await page.getByLabel('Công cụ lịch sử').selectOption('codex');await page.getByLabel('Khoảng lịch sử').selectOption('custom');
 await page.getByLabel('Từ ngày',{exact:true}).fill('2026-10-27');await page.getByLabel('Đến ngày',{exact:true}).fill('2026-10-27');
 await page.getByLabel('Nhóm usage',{exact:true}).selectOption('project');const groups=page.getByTestId('history-grouping');
 await expect(groups).toContainText('Dự án chưa xác định');await expect(groups).toContainText('Tổng nhóm khớp');
 await groups.locator('summary').filter({hasText:'App'}).click();await expect(groups).toContainText('Private child');
 await expect(groups).toContainText('Thư mục ghi nhận');
 let wait=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất JSON',exact:true}).click();
 let json=JSON.parse(await readFile((await(await wait).path())!,'utf8'));
 expect(json.grouping.by).toBe('project');expect(json.aggregate.tokens.total).toBe(12);expect(JSON.stringify(json)).not.toContain('Private');
 await page.getByLabel('Nhóm usage',{exact:true}).selectOption('work');await groups.locator('summary').filter({hasText:'Private root'}).click();
 await expect(groups).toContainText('Private grandchild');await expect(groups.locator('summary').filter({hasText:'Private root'})).toContainText('9');
 await page.getByLabel('Kèm tên/ID phiên (hoạt động cuối trong khoảng)').check();
 wait=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất JSON',exact:true}).click();
 json=JSON.parse(await readFile((await(await wait).path())!,'utf8'));expect(json.grouping.by).toBe('work');expect(JSON.stringify(json)).toContain('rollout-child');expect(JSON.stringify(json)).not.toContain('999');
 await page.getByLabel('Công cụ lịch sử').selectOption('claude');await expect(groups.locator('summary')).toHaveCount(1);
 for(const language of ['EN','VI','中文']) {await page.getByRole('button',{name:language,exact:true}).click();await page.setViewportSize({width:320,height:900});await expect(groups).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 expect(calls).toBe(1);
});
test('legacy ledger absence stays unavailable and disables only grouped export',async({page})=>{
 const value:any={snapshot:structuredClone(fixture),selectedSession:null,requestedSessionId:null};delete value.snapshot.history.sessionDays;
 await page.clock.install({time:new Date(fixture.generatedAt)});await page.route('**/__usage/snapshot',r=>r.fulfill({json:value}));
 await page.goto('/');await page.getByRole('tab',{name:'Lịch sử',exact:true}).click();await page.getByLabel('Nhóm usage',{exact:true}).selectOption('project');
 await expect(page.getByTestId('history-grouping')).toContainText('Chưa có phân bổ');
 await expect(page.getByRole('button',{name:'Xuất JSON',exact:true})).toBeDisabled();
 await page.getByLabel('Nhóm usage',{exact:true}).selectOption('none');await expect(page.getByRole('button',{name:'Xuất JSON',exact:true})).toBeEnabled();
});
