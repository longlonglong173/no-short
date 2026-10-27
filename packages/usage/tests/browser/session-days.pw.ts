import { test, expect } from '@playwright/test';
import snapshot from '../fixtures/session-days-snapshot.json' with {type:'json'};
test('day contributing sessions open exact model detail without changing pin or scanning; capability notice and mismatch', async ({page})=>{
  const value:any={snapshot:structuredClone(snapshot),selectedSession:snapshot.sessions[0],requestedSessionId:null}; let calls=0;
  await page.clock.install({time:new Date('2026-10-01T12:00:00Z')});
  await page.route('**/__usage/snapshot',r=>{calls++;return r.fulfill({json:value});});
  await page.goto('/'); await page.getByRole('button',{name:'Ghim phiên',exact:true}).click();
  await page.getByRole('tab',{name:'Lịch sử',exact:true}).click(); await page.getByLabel('Công cụ lịch sử').selectOption('all');
  await page.getByRole('button',{name:'2026-10-01:',exact:false}).click();
  await expect(page.getByTestId('history-sessions')).toContainText('codex across two days');
  await page.getByTestId('history-sessions').getByRole('button',{name:/codex across/}).click();
  await expect(page.getByTestId('history-session-detail')).toContainText('gpt-fixture');
  await expect(page.getByTestId('history-models')).toContainText('gpt-fixture');
  await expect(page.getByTestId('history-models')).not.toContainText('claude-fixture');
  expect(calls).toBe(1);
  await page.getByRole('tab',{name:'Phiên',exact:true}).click();
  await expect(page.getByRole('button',{name:'Bỏ ghim phiên',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Lịch sử',exact:true}).click();
  for(const language of ['EN','VI','中文']) { await page.getByRole('button',{name:language,exact:true}).click(); await page.setViewportSize({width:360,height:1100}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); }
  await page.screenshot({path:'/tmp/no-short-20261027-wave1/ns18-browser-detail.png',fullPage:true});
  delete value.snapshot.history.sessionDays; await page.getByRole('button',{name:/刷新用量|Cập nhật thống kê|Refresh usage/}).click();
  await expect(page.getByTestId('history-sessions-unavailable')).toBeVisible();
  value.snapshot.history.sessionDays=[]; await page.getByRole('button',{name:/刷新用量|Cập nhật thống kê|Refresh usage/}).click();
  await expect(page.getByTestId('history-sessions-mismatch')).toBeVisible();
});
