import type { LoudnessResult } from "./loudness";
import type { TrimOutcome } from "./trim";

export interface AudioInfo {
  codec: string;
  durationSeconds: number | null;
  sampleRateHz: number | null;
  channels: number | null;
  bitrateKbps: number | null;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export function describeAudioInfo(info: AudioInfo): string {
  const parts = [
    info.codec.toUpperCase(),
    info.durationSeconds === null ? "" : formatDuration(info.durationSeconds),
    info.sampleRateHz === null ? "" : `${Number((info.sampleRateHz / 1000).toFixed(1))} kHz`,
    info.channels === null ? "" : describeChannels(info.channels),
    info.bitrateKbps === null ? "" : `${info.bitrateKbps} kb/s`,
  ];
  return parts.filter((part) => part !== "").join(" · ");
}

export function describeLoudness(loudness: LoudnessResult): string {
  const measured = `${formatLufs(loudness.measuredLufs)} LUFS (true peak ${formatLufs(loudness.measuredTruePeak)} dBTP)`;
  if (loudness.type === "unchanged") return `${measured}, already at the target.`;
  return `${measured} → about ${formatLufs(loudness.expectedLufs)} LUFS.`;
}

export function describeTrim(outcome: TrimOutcome): string {
  switch (outcome.kind) {
    case "trimmed": {
      const cuts: string[] = [];
      if (outcome.startSeconds > 0) cuts.push(`${formatSeconds(outcome.startSeconds)} at the start`);
      if (outcome.endSeconds > 0) cuts.push(`${formatSeconds(outcome.endSeconds)} at the end`);
      return `Trimmed ${cuts.join(" and ")}. A short fade was added at the cut${cuts.length > 1 ? "s" : ""}.`;
    }
    case "none":
      return "No silence found at the start or end.";
    case "skipped":
      return outcome.reason === "too-quiet"
        ? "Silence trimming skipped: the audio is too quiet to tell silence from content."
        : "Silence trimming skipped: it would have removed more than half of the recording.";
  }
}

export function formatLufs(value: number): string {
  return value.toFixed(1);
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}

function formatDuration(totalSeconds: number): string {
  const whole = Math.round(totalSeconds);
  const hours = Math.floor(whole / SECONDS_PER_HOUR);
  const minutes = Math.floor((whole % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = String(whole % SECONDS_PER_MINUTE).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function describeChannels(channels: number): string {
  if (channels === 1) return "mono";
  return channels === 2 ? "stereo" : `${channels} channels`;
}
