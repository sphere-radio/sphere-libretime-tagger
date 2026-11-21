export interface Silence {
  start: number;
  end: number;
}

export interface TrimWindow {
  start: number;
  end: number;
  fadeIn: boolean;
  fadeOut: boolean;
}

export type TrimOutcome =
  | { kind: "trimmed"; startSeconds: number; endSeconds: number }
  | { kind: "skipped"; reason: "too-quiet" | "too-much" }
  | { kind: "none" };

export interface TrimPlan {
  outcome: TrimOutcome;
  window: TrimWindow | null;
}

// Low on purpose: slow fade-ins start far below -50 dB and must not count as silence.
export const SILENCE_THRESHOLD_DB = -70;
export const MIN_SILENCE_SECONDS = 1;
// A cut is faded so it sounds deliberate. Only trimmed edges are faded, never the original start or end.
export const FADE_SECONDS = 1;
export const NO_TRIM: TrimPlan = { outcome: { kind: "none" }, window: null };

const PADDING_SECONDS = 0.5;
const EDGE_TOLERANCE_SECONDS = 0.1;
const MIN_KEPT_FRACTION = 0.5;

export function planTrim(durationSeconds: number, silences: Silence[]): TrimPlan {
  const leading = silences.find((silence) => silence.start <= EDGE_TOLERANCE_SECONDS);
  const trailing = silences.filter((silence) => silence.end >= durationSeconds - EDGE_TOLERANCE_SECONDS).at(-1);
  if (leading && leading === trailing) return skipped("too-quiet");

  const start = leading ? Math.max(0, leading.end - PADDING_SECONDS) : 0;
  const end = trailing ? Math.min(durationSeconds, trailing.start + PADDING_SECONDS) : durationSeconds;
  if (start === 0 && end === durationSeconds) return NO_TRIM;
  if (end - start < durationSeconds * MIN_KEPT_FRACTION) return skipped("too-much");

  return {
    outcome: { kind: "trimmed", startSeconds: start, endSeconds: durationSeconds - end },
    window: { start, end, fadeIn: start > 0, fadeOut: end < durationSeconds },
  };
}

function skipped(reason: "too-quiet" | "too-much"): TrimPlan {
  return { outcome: { kind: "skipped", reason }, window: null };
}
