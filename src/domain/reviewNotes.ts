import { describeTrim, formatLufs } from "./audioDescription";
import type { AppliedLoudness } from "./loudness";
import type { TrimOutcome } from "./trim";

export interface SaveFacts {
  converted: boolean;
  reencoded: boolean;
  loudness: AppliedLoudness | null;
  trim: TrimOutcome | null;
  replacesOriginal: boolean;
  nameWasShortened: boolean;
}

const DYNAMIC_NOTE =
  "This recording was too dynamic for a plain volume change at this target, so its loudness was shaped dynamically. Listen to the result before publishing.";

export function buildReviewNotes(facts: SaveFacts): string[] {
  return [
    "All other tags in the file are removed.",
    ...describeEncoding(facts),
    ...describeLoudnessNotes(facts.loudness),
    ...(facts.trim ? [describeTrim(facts.trim)] : []),
    describeOriginal(facts),
    ...(facts.nameWasShortened
      ? ["The episode title is shortened in the file name to stay within 100 characters. The Title tag keeps it in full."]
      : []),
  ];
}

function describeEncoding({ converted, reencoded }: SaveFacts): string[] {
  if (converted) return ["The audio was converted to MP3 (320 kbps CBR)."];
  return reencoded ? ["The MP3 was re-encoded as 320 kbps CBR."] : [];
}

function describeLoudnessNotes(loudness: AppliedLoudness | null): string[] {
  if (!loudness) return [];
  const { target, measuredLufs, expectedLufs } = loudness;
  if (loudness.type === "unchanged") {
    return [`Loudness is ${formatLufs(measuredLufs)} LUFS, already at the ${target.integratedLufs} LUFS target, so it was left unchanged.`];
  }
  const notes = [
    `Loudness was normalized to ${target.integratedLufs} LUFS (${target.description}): measured ${formatLufs(measuredLufs)} LUFS before, about ${formatLufs(expectedLufs)} LUFS after.`,
  ];
  return loudness.type === "dynamic" ? [...notes, DYNAMIC_NOTE] : notes;
}

function describeOriginal({ converted, replacesOriginal }: SaveFacts): string {
  if (replacesOriginal) {
    return "Saving changes the original file and renames it. If a file with the new name is in the same folder, check it first.";
  }
  return converted
    ? "The original is not an MP3, so it stays unchanged and a tagged MP3 is downloaded."
    : "Your browser cannot rename the original. A tagged copy is downloaded and the original stays unchanged.";
}
