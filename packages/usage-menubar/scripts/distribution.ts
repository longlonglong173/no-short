export function assertDistributionSignature(details: string, teamID: string): void {
  if (!/^[A-Z0-9]{10}$/.test(teamID)) throw new Error('Expected Apple Developer Team ID is required');
  if (!/^Authority=Developer ID Application: .+$/m.test(details)
      || !details.split('\n').includes(`TeamIdentifier=${teamID}`)
      || !/^.*flags=.*\bruntime\b.*$/m.test(details)
      || !/^Timestamp=(?!none\s*$).+$/m.test(details)
      || /^Signature=adhoc$/m.test(details)) {
    throw new Error('Public distribution requires timestamped Developer ID Application signing with hardened runtime and the expected team');
  }
}
