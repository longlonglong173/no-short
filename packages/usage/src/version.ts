import usagePackage from '../package.json';
import ccusageLock from '../ccusage-lock.json';

// Build, CLI, MCP server and panel advertise the same package identity.
export const usageVersion = usagePackage.version;
export const ccusageVersion = ccusageLock.version;

// Reader fixes invalidate snapshots without changing the upstream/public schema identity.
export { patchRevision as ccusagePatchRevision } from '../ccusage-source-lock.json';
