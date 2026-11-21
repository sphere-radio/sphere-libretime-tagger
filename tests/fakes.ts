import { vi } from "vitest";
import { ConversionError } from "../src/convert/errors";
import type { MediaRunner } from "../src/convert/processAudio";
import { sourceFromFile, type AudioSource } from "../src/io/audioSource";

export const INPUT_LOG = "Input #0, wav, from 'source':\n  Duration: 00:00:10.00, bitrate: 1411 kb/s\n  Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 1411 kb/s\n";
export const MEASUREMENT_LOG = `${INPUT_LOG}{"input_i":"-30","input_tp":"-5","input_lra":"3","input_thresh":"-40","target_offset":"1"}`;
export const APPLIED_LOG = `${INPUT_LOG}{"output_i":"-23.1","normalization_type":"linear"}`;

export const source = (name: string): AudioSource => sourceFromFile(new File([new Uint8Array([1])], name));
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export type Behaviour = "succeeds" | "fails" | "hangs";

export function runnerThat(behaviour: Behaviour): MediaRunner {
  return {
    mount: async () => {},
    run: vi.fn(async (args: string[]) => {
      if (behaviour === "hangs") return new Promise<string>(() => {});
      if (behaviour === "fails") throw new ConversionError("Broken audio.");
      return args.includes("null") ? MEASUREMENT_LOG : APPLIED_LOG;
    }),
    readOutput: async () => new Uint8Array([7]),
    terminate: vi.fn(),
  };
}

export interface ManualRunner {
  runner: MediaRunner;
  finish(): void;
  fail(): void;
}

/** A runner whose single pass stays open until the test finishes or fails it. */
export function manualRunner(): ManualRunner {
  let resolve!: (log: string) => void;
  let reject!: (error: Error) => void;
  const pass = new Promise<string>((done, fail) => { resolve = done; reject = fail; });
  pass.catch(() => {});
  const runner: MediaRunner = {
    mount: async () => {},
    run: vi.fn(() => pass),
    readOutput: async () => new Uint8Array([7]),
    terminate: vi.fn(() => reject(new Error("terminated"))),
  };
  return { runner, finish: () => resolve(INPUT_LOG), fail: () => reject(new ConversionError("Broken audio.")) };
}
