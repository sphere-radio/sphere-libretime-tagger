import { describe, expect, it, vi } from "vitest";
import { ConversionError } from "../src/convert/errors";
import { MAX_INPUT_BYTES, processAudio, type MediaRunner, type ProcessingOptions } from "../src/convert/processAudio";
import { plannedPasses, progressOf, type ProcessingProgress } from "../src/convert/progress";
import { targetById } from "../src/domain/loudness";

const broadcast = targetById("ebu-r128");
const wav = new File([new Uint8Array([1, 2, 3])], "show.wav");

const INPUT = "Input #0, wav, from 'source':\n  Duration: 00:01:40.00, bitrate: 1411 kb/s\n  Stream #0:0: Audio: pcm_s16le, 48000 Hz, stereo, s16, 1411 kb/s\n";
const SILENCE = `${INPUT}[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 10 | silence_duration: 10\n[silencedetect @ 0x1] silence_start: 90\n[silencedetect @ 0x1] silence_end: 100 | silence_duration: 10`;
const NO_SILENCE = `${INPUT}no silence here`;
const measured = (lufs: string, peak = "-6.0") => `${INPUT}{"input_i":"${lufs}","input_tp":"${peak}","input_lra":"3.0","input_thresh":"-40.0","target_offset":"1.0"}`;
const APPLIED = `{"input_i":"-30.0","output_i":"-23.1","normalization_type":"linear","target_offset":"1.0"}`;

const options = (overrides: Partial<ProcessingOptions> = {}): ProcessingOptions => ({ target: null, trimSilence: false, canKeepOriginal: false, ...overrides });

function fakeRunner(logs: string[]): MediaRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    mount: vi.fn(async () => {}),
    run: vi.fn(async (args: string[], onProgress: (ratio: number) => void) => {
      calls.push(args);
      onProgress(0.5);
      return logs[calls.length - 1] ?? "";
    }),
    readOutput: vi.fn(async () => new Uint8Array([9, 9])),
    terminate: vi.fn(),
  };
}

const filterOf = (args: string[]) => (args.includes("-af") ? (args[args.indexOf("-af") + 1] ?? "") : "");

describe("processAudio", () => {
  it("converts in one pass when nothing else is asked for", async () => {
    const runner = fakeRunner([INPUT]);
    const result = await processAudio(runner, wav, options(), () => {});
    expect(runner.calls).toHaveLength(1);
    expect(result).toMatchObject({ bytes: new Uint8Array([9, 9]), loudness: null, trim: null });
    expect(result.info).toMatchObject({ codec: "pcm", sampleRateHz: 48000, durationSeconds: 100 });
  });

  it("measures first, then applies the measured values", async () => {
    const runner = fakeRunner([measured("-30.0"), APPLIED]);
    const result = await processAudio(runner, wav, options({ target: broadcast }), () => {});
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1]).toContain("48000");
    expect(filterOf(runner.calls[1]!)).toContain("measured_I=-30");
    expect(result.loudness).toEqual({ measuredLufs: -30, expectedLufs: -23.1, type: "linear" });
  });

  it("detects silence first and carries the trim through the later passes", async () => {
    const runner = fakeRunner([SILENCE, measured("-30.0"), APPLIED]);
    const result = await processAudio(runner, wav, options({ target: broadcast, trimSilence: true }), () => {});
    expect(runner.calls).toHaveLength(3);
    expect(filterOf(runner.calls[0]!)).toContain("silencedetect");
    expect(filterOf(runner.calls[1]!)).toMatch(/^atrim=start=9.750:end=90.250,asetpts=PTS-STARTPTS,loudnorm/);
    expect(filterOf(runner.calls[2]!)).toMatch(/^atrim=start=9.750:end=90.250,asetpts=PTS-STARTPTS,loudnorm/);
    expect(result.trim).toEqual({ kind: "trimmed", startSeconds: 9.75, endSeconds: 9.75 });
  });

  it("keeps a plain MP3 untouched when it is already at the target", async () => {
    const runner = fakeRunner([measured("-23.2", "-3.0")]);
    const result = await processAudio(runner, wav, options({ target: broadcast, canKeepOriginal: true }), () => {});
    expect(runner.calls).toHaveLength(1);
    expect(result.bytes).toBeNull();
    expect(result.loudness).toEqual({ measuredLufs: -23.2, expectedLufs: -23.2, type: "unchanged" });
  });

  it("encodes without loudnorm when a converted file is already at the target", async () => {
    const runner = fakeRunner([measured("-23.2", "-3.0"), ""]);
    const result = await processAudio(runner, wav, options({ target: broadcast }), () => {});
    expect(filterOf(runner.calls[1]!)).toBe("");
    expect(result.loudness?.type).toBe("unchanged");
    expect(result.bytes).not.toBeNull();
  });

  it("normalizes when the loudness is right but the peak is too high", async () => {
    const runner = fakeRunner([measured("-23.2", "-0.2"), APPLIED]);
    expect((await processAudio(runner, wav, options({ target: broadcast, canKeepOriginal: true }), () => {})).bytes).not.toBeNull();
  });

  it("re-encodes an MP3 whose edges were trimmed even if the loudness is fine", async () => {
    const runner = fakeRunner([SILENCE, measured("-23.2", "-3.0"), ""]);
    const result = await processAudio(runner, wav, options({ target: broadcast, trimSilence: true, canKeepOriginal: true }), () => {});
    expect(result.bytes).not.toBeNull();
    expect(filterOf(runner.calls[2]!)).toMatch(/^atrim=/);
  });

  it("reports when there was no silence to trim", async () => {
    const result = await processAudio(fakeRunner([NO_SILENCE]), wav, options({ trimSilence: true, canKeepOriginal: true }), () => {});
    expect(result.bytes).toBeNull();
    expect(result.trim).toEqual({ kind: "none" });
  });

  it("reports progress across all passes in order", async () => {
    const seen: ProcessingProgress[] = [];
    await processAudio(fakeRunner([SILENCE, measured("-30.0"), APPLIED]), wav, options({ target: broadcast, trimSilence: true }), (progress) => seen.push(progress));
    expect(seen.map((progress) => progress.phase)).toEqual(["detecting", "measuring", "normalizing"]);
    [0.075, 0.325, 0.75].forEach((fraction, index) => expect(seen[index]?.fraction).toBeCloseTo(fraction));
  });

  it("always releases the runner, even when a pass fails", async () => {
    const runner = fakeRunner([]);
    runner.run = vi.fn(async () => {
      throw new ConversionError("broken");
    });
    await expect(processAudio(runner, wav, options(), () => {})).rejects.toThrow("broken");
    expect(runner.terminate).toHaveBeenCalledOnce();
  });

  it("refuses files that are too large for the browser", async () => {
    const huge = { size: MAX_INPUT_BYTES + 1 } as File;
    await expect(processAudio(fakeRunner([]), huge, options(), () => {})).rejects.toThrow(ConversionError);
  });
});

describe("progressOf", () => {
  it.each([
    [["encoding"], "encoding", 0.4, 0.4],
    [["measuring", "encoding"], "measuring", 1, 0.35 / 0.85],
    [["measuring", "encoding"], "normalizing", 0, 0.35 / 0.85],
    [["encoding"], "encoding", 7, 1],
    [["encoding"], "encoding", -1, 0],
    [["measuring", "encoding"], "normalizing", Number.NaN, 0.35 / 0.85],
  ] as const)("%j %s %s -> %s", (planned, phase, ratio, fraction) => {
    expect(progressOf(phase, ratio, [...planned]).fraction).toBeCloseTo(fraction);
  });
});

describe("plannedPasses", () => {
  it("always ends with encoding and adds the optional passes in order", () => {
    expect(plannedPasses({ trimSilence: false, normalize: false })).toEqual(["encoding"]);
    expect(plannedPasses({ trimSilence: true, normalize: true })).toEqual(["detecting", "measuring", "encoding"]);
  });
});
