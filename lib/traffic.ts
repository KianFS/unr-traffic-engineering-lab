export type GapAcceptanceParameters = {
  criticalGap: number;
  followUpTime: number;
};

function requirePositive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive, finite number.`);
  }
}

export function vehiclesAcceptedInGap(
  headwaySeconds: number,
  criticalGapSeconds: number,
  followUpTimeSeconds: number,
) {
  requirePositive(criticalGapSeconds, "Critical gap");
  requirePositive(followUpTimeSeconds, "Follow-up time");
  if (!Number.isFinite(headwaySeconds) || headwaySeconds < criticalGapSeconds) return 0;

  // One vehicle uses the critical gap; each additional vehicle needs one follow-up time.
  return 1 + Math.floor((headwaySeconds - criticalGapSeconds) / followUpTimeSeconds + 1e-12);
}

export function hardersCapacity(
  conflictingVolumeVph: number,
  criticalGapSeconds: number,
  followUpTimeSeconds: number,
) {
  requirePositive(conflictingVolumeVph, "Conflicting volume");
  requirePositive(criticalGapSeconds, "Critical gap");
  requirePositive(followUpTimeSeconds, "Follow-up time");

  const arrivalRatePerSecond = conflictingVolumeVph / 3600;
  const numerator = Math.exp(-arrivalRatePerSecond * criticalGapSeconds);
  // expm1 keeps the denominator accurate when the exponent is close to zero.
  const denominator = -Math.expm1(-arrivalRatePerSecond * followUpTimeSeconds);
  return conflictingVolumeVph * (numerator / denominator);
}
