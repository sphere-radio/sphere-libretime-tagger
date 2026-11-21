import type { AudioInfo } from "../domain/audioDescription";
import type { Silence } from "../domain/trim";

const DURATION_PATTERN = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/;
const INPUT_BITRATE_PATTERN = /Duration:[^\n]*bitrate: (\d+) kb\/s/;
// The first audio stream line is the input; the output stream is listed after it.
const STREAM_LINE_PATTERN = /Stream #0:\d+[^\n]*Audio:[^\n]*/;
const SILENCE_PATTERN = /silence_(start|end): (-?[\d.]+)/g;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export function parseDuration(log: string): number | undefined {
  const match = DURATION_PATTERN.exec(log);
  if (!match) return undefined;
  const [, hours, minutes, seconds] = match;
  return Number(hours) * SECONDS_PER_HOUR + Number(minutes) * SECONDS_PER_MINUTE + Number(seconds);
}

export function parseAudioInfo(log: string): AudioInfo | null {
  const stream = STREAM_LINE_PATTERN.exec(log)?.[0];
  const codec = stream && /Audio: (\w+)/.exec(stream)?.[1];
  if (!stream || !codec) return null;
  return {
    codec: /^pcm_/.test(codec) ? "pcm" : codec,
    durationSeconds: parseDuration(log) ?? null,
    sampleRateHz: toNumber(/, (\d+) Hz/.exec(stream)?.[1]),
    channels: channelCount(/Hz, ([^,\n]+)/.exec(stream)?.[1]),
    bitrateKbps: toNumber(/(\d+) kb\/s/.exec(stream)?.[1] ?? INPUT_BITRATE_PATTERN.exec(log)?.[1]),
  };
}

export function parseSilences(log: string, durationSeconds: number): Silence[] {
  const silences: Silence[] = [];
  let openStart: number | null = null;
  for (const [, edge, time] of log.matchAll(SILENCE_PATTERN)) {
    if (edge === "start") {
      openStart = Number(time);
    } else if (openStart !== null) {
      silences.push({ start: openStart, end: Number(time) });
      openStart = null;
    }
  }
  // Some ffmpeg builds never close a silence that runs to the end of the file.
  return openStart === null ? silences : [...silences, { start: openStart, end: durationSeconds }];
}

function toNumber(text: string | undefined): number | null {
  return text === undefined ? null : Number(text);
}

function channelCount(layout: string | undefined): number | null {
  if (layout === "mono") return 1;
  if (layout === "stereo") return 2;
  return toNumber(/(\d+) channels/.exec(layout ?? "")?.[1]);
}
