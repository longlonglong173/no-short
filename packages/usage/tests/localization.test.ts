import { expect, test } from 'bun:test';
import { resolveLanguage, translate } from '../ui/localization';
import { costText } from '../ui/model';
test('explicit language wins, system locale matches, unsupported languages fall back', () => {
  expect(resolveLanguage('zh-CN', ['en'])).toBe('zh-CN');
  expect(resolveLanguage(null, ['vi-VN'])).toBe('vi');
  expect(resolveLanguage('bad', ['zh-Hans'])).toBe('zh-CN');
  expect(resolveLanguage(null, ['fr'])).toBe('en');
});
test('unknown prices remain unknown in every language and amounts remain USD', () => {
  const unknown = { amountUSD: null, knownCostUSD: 0, status: 'unknown' as const };
  expect(costText(unknown, 'en')).toBe('—');
  expect(costText(unknown, 'zh-CN')).toBe('—');
  expect(costText({amountUSD: 1.25, knownCostUSD: 1.25, status: 'estimated'}, 'zh-CN')).toBe('$1.25');
  expect(translate('zh-CN', '%@ phiên', '12')).toBe('12 个会话');
});
