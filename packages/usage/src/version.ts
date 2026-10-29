import usagePackage from '../package.json' with { type: 'json' };
import ccusageLock from '../ccusage-lock.json' with { type: 'json' };
import ccusageSourceLock from '../ccusage-source-lock.json' with { type: 'json' };

// Build, CLI, MCP server and panel advertise the same package identity.
export const usageVersion = usagePackage.version;
export const ccusageVersion = ccusageLock.version;

// Reader fixes invalidate snapshots without changing the upstream/public schema identity.
export const ccusagePatchRevision = ccusageSourceLock.patchRevision;
