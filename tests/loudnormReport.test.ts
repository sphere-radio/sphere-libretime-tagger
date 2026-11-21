import { describe, expect, it } from "vitest";
import { ConversionError } from "../src/convert/errors";
import { parseMeasurement, parseNormalizationType, parseOutputLufs } from "../src/convert/loudnormReport";

const log = (report: string) => `Output #0, null\n[Parsed_loudnorm_0 @ 0x1] \n${report}`;

const report = (overrides: Record<string, string> = {}) =>
  JSON.stringify(
    {
      input_i: "-35.75",
      input_tp: "-32.04",
      input_lra: "2.10",
      input_thresh: "-45.75",
      output_i: "-23.03",
      output_tp: "-19.27",
      normalization_type: "linear",
      target_offset: "0.03",
      ...overrides,
    },
    null,
    "\t",
  );

describe("parseMeasurement", () => {
  it("reads the input values of the loudnorm report", () => {
    expect(parseMeasurement(log(report()))).toEqual({ integrated: -35.75, truePeak: -32.04, range: 2.1, threshold: -45.75, offset: 0.03 });
  });

  it("rejects silent audio, which loudnorm reports as -inf", () => {
    expect(() => parseMeasurement(log(report({ input_i: "-inf" })))).toThrow(ConversionError);
  });

  it("rejects a log without a report", () => {
    expect(() => parseMeasurement("nothing useful")).toThrow(ConversionError);
  });
});

describe("parseOutputLufs", () => {
  it("reads the loudness loudnorm expects after the change", () => {
    expect(parseOutputLufs(log(report()))).toBe(-23.03);
  });

  it("is undefined when the value is not a number", () => {
    expect(parseOutputLufs(log(report({ output_i: "-inf" })))).toBeUndefined();
  });
});

describe("parseNormalizationType", () => {
  it.each([["linear", "linear"], ["dynamic", "dynamic"]])("reads %s", (type, expected) => {
    expect(parseNormalizationType(log(report({ normalization_type: type })))).toBe(expected);
  });

  it("treats a missing value as dynamic", () => {
    expect(parseNormalizationType("no report")).toBe("dynamic");
  });
});
