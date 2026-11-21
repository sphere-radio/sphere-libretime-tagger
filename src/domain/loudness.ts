export type LoudnessTargetId = "ebu-r128" | "streaming";
export type NormalizationType = "linear" | "dynamic" | "unchanged";

export interface LoudnessTarget {
  id: LoudnessTargetId;
  integratedLufs: number;
  description: string;
}

export interface LoudnessResult {
  measuredLufs: number;
  measuredTruePeak: number;
  expectedLufs: number;
  type: NormalizationType;
}

export interface AppliedLoudness extends LoudnessResult {
  target: LoudnessTarget;
}

const EBU_R128: LoudnessTarget = { id: "ebu-r128", integratedLufs: -23, description: "EBU R128, broadcast" };
const STREAMING: LoudnessTarget = { id: "streaming", integratedLufs: -14, description: "streaming" };

export const LOUDNESS_TARGETS: readonly LoudnessTarget[] = [EBU_R128, STREAMING];

export function targetById(id: unknown): LoudnessTarget {
  return LOUDNESS_TARGETS.find((target) => target.id === id) ?? EBU_R128;
}

// Below -1 dBTP on purpose: MP3 encoding overshoots the peaks of the decoded signal.
export const TRUE_PEAK_CEILING_DBTP = -1.5;

// Wide enough that ordinary speech and music stay on loudnorm's gentler linear path.
export const LOUDNESS_RANGE_LU = 11;

const AT_TARGET_TOLERANCE_LU = 0.5;

// EBU R128 allows true peaks up to -1 dBTP, and masters are commonly delivered exactly there.
// The stricter ceiling above is only for what this tool writes, not for what it accepts.
const AT_TARGET_PEAK_LIMIT_DBTP = -1;

export function isAtTarget(target: LoudnessTarget, integratedLufs: number, truePeakDbtp: number): boolean {
  return Math.abs(integratedLufs - target.integratedLufs) <= AT_TARGET_TOLERANCE_LU && truePeakDbtp <= AT_TARGET_PEAK_LIMIT_DBTP;
}
