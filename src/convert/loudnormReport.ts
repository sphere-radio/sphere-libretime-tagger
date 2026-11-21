import type { NormalizationType } from "../domain/loudness";
import { ConversionError } from "./errors";

export interface LoudnessMeasurement {
  integrated: number;
  truePeak: number;
  range: number;
  threshold: number;
  offset: number;
}

const REPORT_PATTERN = /\{[^{}]*"input_i"[^{}]*\}/;
const NORMALIZATION_TYPE_PATTERN = /"normalization_type"\s*:\s*"(\w+)"/;
const OUTPUT_LUFS_PATTERN = /"output_i"\s*:\s*"([^"]+)"/;

export function parseMeasurement(log: string): LoudnessMeasurement {
  const report = readReport(log);
  const measurement = {
    integrated: Number(report.input_i),
    truePeak: Number(report.input_tp),
    range: Number(report.input_lra),
    threshold: Number(report.input_thresh),
    offset: Number(report.target_offset),
  };
  if (!Object.values(measurement).every(Number.isFinite)) {
    throw new ConversionError("The loudness of this audio could not be measured. It may be silent.");
  }
  return measurement;
}

export function parseOutputLufs(log: string): number | undefined {
  const lufs = Number(OUTPUT_LUFS_PATTERN.exec(log)?.[1]);
  return Number.isFinite(lufs) ? lufs : undefined;
}

// Unknown counts as dynamic: the warning shown for it is the safe side of a wrong guess.
export function parseNormalizationType(log: string): Exclude<NormalizationType, "unchanged"> {
  return NORMALIZATION_TYPE_PATTERN.exec(log)?.[1] === "linear" ? "linear" : "dynamic";
}

function readReport(log: string): Record<string, string> {
  const match = REPORT_PATTERN.exec(log);
  if (!match) throw new ConversionError("The loudness of this audio could not be measured.");
  return JSON.parse(match[0]);
}
