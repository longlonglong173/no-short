import { readFile, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { decodePricingConfig, type PricingConfig } from './pricing.ts';

export const defaultPricingFile = () => process.env.NO_SHORT_USAGE_PRICING_FILE ?? join(homedir(), 'Library/Application Support/no-short/usage/pricing.json');
export async function readPricingConfig(file = defaultPricingFile()): Promise<{ config: PricingConfig; revision: string }> {
  let data: string;
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1_048_576) throw new Error('PRICING_CONFIG_INVALID');
    data = await readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { config: { version: 1, overrides: [] }, revision: 'default-v1' };
    throw new Error('PRICING_CONFIG_INVALID');
  }
  let config: PricingConfig;
  try { config = decodePricingConfig(JSON.parse(data)); } catch { throw new Error('PRICING_CONFIG_INVALID'); }
  return { config, revision: createHash('sha256').update(JSON.stringify(config)).digest('hex') };
}
