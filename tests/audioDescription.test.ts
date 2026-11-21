import { describe, expect, it } from "vitest";
import { describeAudioInfo, describeLoudness, describeTrim } from "../src/domain/audioDescription";

describe("describeAudioInfo", () => {
  it("joins what is known", () => {
    expect(describeAudioInfo({ codec: "pcm", durationSeconds: 3723.4, sampleRateHz: 44100, channels: 2, bitrateKbps: 1411 })).toBe(
      "PCM · 1:02:03 · 44.1 kHz · stereo · 1411 kb/s",
    );
  });

  it("leaves out what is unknown", () => {
    expect(describeAudioInfo({ codec: "flac", durationSeconds: 65, sampleRateHz: 48000, channels: 1, bitrateKbps: null })).toBe("FLAC · 1:05 · 48 kHz · mono");
  });

  it("counts channels beyond stereo", () => {
    expect(describeAudioInfo({ codec: "aac", durationSeconds: null, sampleRateHz: null, channels: 6, bitrateKbps: null })).toBe("AAC · 6 channels");
  });
});

describe("describeLoudness", () => {
  it("shows the change", () => {
    expect(describeLoudness({ measuredLufs: -27.64, expectedLufs: -23.02, type: "linear" })).toBe("-27.6 LUFS → about -23.0 LUFS.");
  });

  it("says when nothing had to change", () => {
    expect(describeLoudness({ measuredLufs: -23.2, expectedLufs: -23.2, type: "unchanged" })).toBe("-23.2 LUFS, already at the target.");
  });
});

describe("describeTrim", () => {
  it("states how much was cut at each end", () => {
    expect(describeTrim({ kind: "trimmed", startSeconds: 1.75, endSeconds: 2.25 })).toBe("Trimmed 1.8 s at the start and 2.3 s at the end.");
  });

  it.each([
    [{ kind: "none" }, /No silence found/],
    [{ kind: "skipped", reason: "too-quiet" }, /too quiet/],
    [{ kind: "skipped", reason: "too-much" }, /more than half/],
  ] as const)("explains %j", (outcome, pattern) => {
    expect(describeTrim(outcome)).toMatch(pattern);
  });
});
