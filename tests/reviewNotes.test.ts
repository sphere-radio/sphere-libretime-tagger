import { describe, expect, it } from "vitest";
import { targetById, type AppliedLoudness } from "../src/domain/loudness";
import { buildReviewNotes, type SaveFacts } from "../src/domain/reviewNotes";

const broadcast = targetById("ebu-r128");
const loudness = (overrides: Partial<AppliedLoudness> = {}): AppliedLoudness => ({
  target: broadcast,
  measuredLufs: -27.6,
  expectedLufs: -23,
  type: "linear",
  ...overrides,
});
const facts = (overrides: Partial<SaveFacts> = {}): SaveFacts => ({
  converted: false,
  reencoded: false,
  loudness: null,
  trim: null,
  replacesOriginal: true,
  nameWasShortened: false,
  ...overrides,
});

describe("buildReviewNotes", () => {
  it("keeps the plain MP3 notes unchanged", () => {
    expect(buildReviewNotes(facts())).toEqual([
      "All other tags in the file are removed.",
      "Saving changes the original file and renames it. If a file with the new name is in the same folder, check it first.",
    ]);
  });

  it("says a converted file leaves the original alone", () => {
    const notes = buildReviewNotes(facts({ converted: true, reencoded: true, replacesOriginal: false }));
    expect(notes).toContain("The audio was converted to MP3 (320 kbps CBR).");
    expect(notes.join(" ")).toContain("The original is not an MP3");
  });

  it("names the target and the measured and expected loudness", () => {
    const notes = buildReviewNotes(facts({ reencoded: true, loudness: loudness() }));
    expect(notes).toContain("The MP3 was re-encoded as 320 kbps CBR.");
    expect(notes).toContain("Loudness was normalized to -23 LUFS (EBU R128, broadcast): measured -27.6 LUFS before, about -23.0 LUFS after.");
  });

  it("does not claim a re-encode when the loudness was already right", () => {
    const notes = buildReviewNotes(facts({ loudness: loudness({ measuredLufs: -23.2, expectedLufs: -23.2, type: "unchanged" }) }));
    expect(notes.join(" ")).toContain("left unchanged");
    expect(notes.join(" ")).not.toContain("re-encoded");
  });

  it("warns when loudnorm had to work dynamically", () => {
    expect(buildReviewNotes(facts({ loudness: loudness({ type: "dynamic" }) })).join(" ")).toContain("too dynamic");
  });

  it("reports what silence trimming did", () => {
    const notes = buildReviewNotes(facts({ trim: { kind: "trimmed", startSeconds: 2, endSeconds: 3.5 } }));
    expect(notes).toContain("Trimmed 2.0 s at the start and 3.5 s at the end.");
  });

  it("keeps the shortened-title note", () => {
    expect(buildReviewNotes(facts({ nameWasShortened: true })).at(-1)).toContain("shortened");
  });
});
