import { output, manifest } from './bundle';
import { join } from 'node:path';
import { packageNative } from './package-native';
const releases=join(output,'releases');
await packageNative({builds:output,releases,runtime:await manifest(),distribution:process.argv.includes('--distribution')});
console.log(`Verified local app ZIPs: ${releases}`);
