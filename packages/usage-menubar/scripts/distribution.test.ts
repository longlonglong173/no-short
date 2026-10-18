import { test, expect } from 'bun:test';
import { assertDistributionSignature } from './distribution.ts';

const valid = `Executable=/fixture/No Short Usage
flags=0x10000(runtime)
Authority=Developer ID Application: Fixture Publisher (ABCDEFGHIJ)
Authority=Developer ID Certification Authority
TeamIdentifier=ABCDEFGHIJ
Timestamp=Oct 18, 2026 at 12:00:00
`;

test('public distribution requires Developer ID, the expected team, hardened runtime and a timestamp', () => {
  expect(() => assertDistributionSignature(valid, 'ABCDEFGHIJ')).not.toThrow();
  for (const invalid of [
    valid.replace('Developer ID Application:', 'Apple Development:'),
    valid.replace('TeamIdentifier=ABCDEFGHIJ', 'TeamIdentifier=OTHERTEAM1'),
    valid.replace('flags=0x10000(runtime)', 'flags=0x0(none)'),
    valid.replace(/^Timestamp=.*$/m, ''),
    valid.replace(/^Timestamp=.*$/m, 'Timestamp=none'),
    `${valid}Signature=adhoc\n`,
  ]) expect(() => assertDistributionSignature(invalid, 'ABCDEFGHIJ')).toThrow();
  expect(() => assertDistributionSignature(valid, '')).toThrow();
});
