import { describe, expect, it } from "vitest";
import { LOUDNESS_TARGETS } from "../src/domain/loudness";
import { buildDetectArgs, buildEncodeArgs, buildMeasureArgs, resolveOutputRate, type NormalizationPlan } from "../src/convert/ffmpegArgs";

const [broadcast] = LOUDNESS_TARGETS;
const normalization: NormalizationPlan = {
  target: broadcast!,
  measurement: { integrated: -27.6, truePeak: -3.1, range: 4.2, threshold: -38, offset: 0.5 },
  sampleRate: 44100,
};
const window = { start: 1.75, end: 5.25 };
const TRIM_FILTER = "atrim=start=1.750:end=5.250,asetpts=PTS-STARTPTS";

const valueAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("buildDetectArgs", () => {
  it("looks for silence without writing audio", () => {
    const args = buildDetectArgs();
    expect(valueAfter(args, "-af")).toBe("silencedetect=noise=-50dB:d=1");
    expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
  });
});

describe("buildMeasureArgs", () => {
  it("measures against the target without writing audio", () => {
    const args = buildMeasureArgs(broadcast!, null);
    expect(valueAfter(args, "-af")).toBe("loudnorm=I=-23:TP=-1.5:LRA=11:print_format=json");
    expect(args.slice(-3)).toEqual(["-f", "null", "-"]);
  });

  it("measures only the part that will be kept", () => {
    expect(valueAfter(buildMeasureArgs(broadcast!, window), "-af")).toBe(`${TRIM_FILTER},loudnorm=I=-23:TP=-1.5:LRA=11:print_format=json`);
  });
});

describe("buildEncodeArgs", () => {
  it("encodes 320 kbps CBR MP3 without source metadata", () => {
    const args = buildEncodeArgs({ trim: null, normalization: null });
    expect(valueAfter(args, "-c:a")).toBe("libmp3lame");
    expect(valueAfter(args, "-b:a")).toBe("320k");
    expect(valueAfter(args, "-map_metadata")).toBe("-1");
    expect(args).not.toContain("-af");
    expect(args.at(-1)).toBe("output.mp3");
  });

  it("only trims when there is nothing to normalize", () => {
    const args = buildEncodeArgs({ trim: window, normalization: null });
    expect(valueAfter(args, "-af")).toBe(TRIM_FILTER);
    expect(args).not.toContain("-ar");
  });

  it("applies the measured values in linear mode and pins the sample rate", () => {
    const args = buildEncodeArgs({ trim: null, normalization });
    expect(valueAfter(args, "-af")).toBe(
      "loudnorm=I=-23:TP=-1.5:LRA=11:measured_I=-27.6:measured_TP=-3.1:measured_LRA=4.2:measured_thresh=-38:offset=0.5:linear=true:print_format=json",
    );
    expect(valueAfter(args, "-ar")).toBe("44100");
  });

  it("trims before normalizing", () => {
    expect(valueAfter(buildEncodeArgs({ trim: window, normalization }), "-af")).toMatch(new RegExp(`^${TRIM_FILTER},loudnorm=`));
  });
});

describe("resolveOutputRate", () => {
  it.each([[44100, 44100], [48000, 48000], [32000, 32000], [96000, 48000], [88200, 44100], [22050, 44100], [null, 44100], [undefined, 44100]])(
    "%s Hz -> %s Hz",
    (source, expected) => expect(resolveOutputRate(source)).toBe(expected),
  );
});
