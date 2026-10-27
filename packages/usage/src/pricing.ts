import { z } from 'zod';
import type { Cost, Tokens, UsageProvider } from './types.ts';

export interface PriceRates { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface PriceOverride extends PriceRates { provider: UsageProvider; model: string }
export interface PricingConfig { version: 1; updatedAt?: string; overrides: PriceOverride[] }
export interface ModelPricing {
  source: 'ccusage' | 'custom' | 'fallback' | 'unpriced' | 'mixed';
  provider?: UsageProvider;
  updatedAt?: string;
  rates?: PriceRates;
}
export interface SnapshotPricing {
  basis: 'ccusage-report' | 'current-custom-rates';
  configurationRevision: string;
  updatedAt?: string;
}
const rate = z.number().finite().nonnegative();
export const priceRatesSchema = z.object({ input: rate, output: rate, cacheRead: rate, cacheWrite: rate });
export const modelPricingSchema = z.object({
  source: z.enum(['ccusage', 'custom', 'fallback', 'unpriced', 'mixed']),
  provider: z.enum(['codex', 'claude']).optional(), updatedAt: z.string().datetime({ offset: true }).optional(), rates: priceRatesSchema.optional(),
});
export const snapshotPricingSchema = z.object({ basis: z.enum(['ccusage-report', 'current-custom-rates']), configurationRevision: z.string().min(1), updatedAt: z.string().datetime({ offset: true }).optional() });
const configSchema = z.object({ version: z.literal(1), updatedAt: z.string().datetime({ offset: true }).optional(),
  overrides: z.array(priceRatesSchema.extend({ provider: z.enum(['codex', 'claude']),
    model: z.string().min(1).max(200).refine(s => s.trim() === s && !/[\u0000-\u001f\u007f]/.test(s)) })).max(512),
}).superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const row of value.overrides) {
    const key = JSON.stringify([row.provider, row.model]);
    if (seen.has(key)) ctx.addIssue({ code: 'custom', message: 'Duplicate provider/model' });
    seen.add(key);
  }
});
export function decodePricingConfig(value: unknown): PricingConfig {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) throw new Error('PRICING_CONFIG_INVALID');
  return parsed.data;
}
export function customCost(tokens: Tokens, rates: PriceRates): Cost {
  const amountUSD = (tokens.input * rates.input + tokens.output * rates.output + tokens.cacheRead * rates.cacheRead + tokens.cacheWrite * rates.cacheWrite) / 1_000_000;
  if (!Number.isFinite(amountUSD)) throw new Error('PRICING_COST_OVERFLOW');
  return { amountUSD, knownCostUSD: amountUSD, status: 'estimated' };
}
export function mergedPricing(a?: ModelPricing, b?: ModelPricing): ModelPricing | undefined {
  return JSON.stringify(a) === JSON.stringify(b) ? a : { source: 'mixed' };
}
