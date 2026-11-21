export type ProcessingPass = "detecting" | "measuring" | "encoding";
export type ProcessingPhase = ProcessingPass | "normalizing";

export interface ProcessingProgress {
  phase: ProcessingPhase;
  fraction: number;
}

const PASS_ORDER: readonly ProcessingPass[] = ["detecting", "measuring", "encoding"];
// Rough share of the total time each pass takes on a long recording.
const PASS_WEIGHTS: Record<ProcessingPass, number> = { detecting: 0.15, measuring: 0.35, encoding: 0.5 };

export function plannedPasses(options: { trimSilence: boolean; normalize: boolean }): ProcessingPass[] {
  const wanted = { detecting: options.trimSilence, measuring: options.normalize, encoding: true };
  return PASS_ORDER.filter((pass) => wanted[pass]);
}

export function progressOf(phase: ProcessingPhase, ratio: number, planned: ProcessingPass[]): ProcessingProgress {
  const pass = phase === "normalizing" ? "encoding" : phase;
  const done = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
  const before = planned.slice(0, planned.indexOf(pass));
  const finished = before.reduce((sum, earlier) => sum + PASS_WEIGHTS[earlier], 0);
  const total = planned.reduce((sum, included) => sum + PASS_WEIGHTS[included], 0);
  return { phase, fraction: (finished + PASS_WEIGHTS[pass] * done) / total };
}
