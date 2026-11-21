import type { AudioInfo } from "../domain/audioDescription";
import { isAtTarget, type LoudnessResult, type LoudnessTarget } from "../domain/loudness";
import { NO_TRIM, planTrim, type TrimOutcome, type TrimPlan } from "../domain/trim";
import { ConversionError } from "./errors";
import { buildDetectArgs, buildEncodeArgs, buildMeasureArgs, resolveOutputRate, type NormalizationPlan } from "./ffmpegArgs";
import { parseMeasurement, parseNormalizationType, parseOutputLufs } from "./loudnormReport";
import { parseAudioInfo, parseDuration, parseSilences } from "./mediaLog";
import { plannedPasses, progressOf, type ProcessingPass, type ProcessingPhase, type ProcessingProgress } from "./progress";

export interface MediaRunner {
  mount(file: File): Promise<void>;
  run(args: string[], onProgress: (ratio: number) => void): Promise<string>;
  readOutput(): Promise<Uint8Array>;
  terminate(): void;
}

export interface ProcessingOptions {
  target: LoudnessTarget | null;
  trimSilence: boolean;
  /** An MP3 source that needs no change can be used as it is instead of being re-encoded. */
  canKeepOriginal: boolean;
}

export interface ProcessedAudio {
  /** Null means the original MP3 is used untouched. */
  bytes: Uint8Array | null;
  info: AudioInfo | null;
  loudness: LoudnessResult | null;
  trim: TrimOutcome | null;
}

export const MAX_INPUT_BYTES = 2 * 1024 ** 3;

type Report = (progress: ProcessingProgress) => void;

export async function processAudio(runner: MediaRunner, file: File, options: ProcessingOptions, report: Report): Promise<ProcessedAudio> {
  if (file.size > MAX_INPUT_BYTES) throw new ConversionError("This file is larger than 2 GB, which is too big to convert in the browser.");
  const session = new ProcessingSession(runner, options, report);
  try {
    await runner.mount(file);
    return await session.run();
  } finally {
    runner.terminate();
  }
}

class ProcessingSession {
  private readonly passes: ProcessingPass[];
  private info: AudioInfo | null = null;

  constructor(
    private readonly runner: MediaRunner,
    private readonly options: ProcessingOptions,
    private readonly report: Report,
  ) {
    this.passes = plannedPasses({ trimSilence: options.trimSilence, normalize: options.target !== null });
  }

  async run(): Promise<ProcessedAudio> {
    const trim = this.options.trimSilence ? await this.detectSilence() : NO_TRIM;
    const measured = this.options.target ? await this.measureLoudness(this.options.target, trim) : null;
    const normalization = measured?.plan ?? null;
    const outcome = this.options.trimSilence ? trim.outcome : null;

    if (this.options.canKeepOriginal && trim.window === null && normalization === null) {
      this.report({ phase: "encoding", fraction: 1 });
      return { bytes: null, info: this.info, loudness: measured?.unchanged ?? null, trim: outcome };
    }
    const log = await this.pass(normalization ? "normalizing" : "encoding", buildEncodeArgs({ trim: trim.window, normalization }));
    const loudness = normalization ? this.normalizedLoudness(normalization, log) : (measured?.unchanged ?? null);
    return { bytes: await this.runner.readOutput(), info: this.info, loudness, trim: outcome };
  }

  private async detectSilence(): Promise<TrimPlan> {
    const log = await this.pass("detecting", buildDetectArgs());
    const duration = parseDuration(log);
    return duration === undefined ? NO_TRIM : planTrim(duration, parseSilences(log, duration));
  }

  private async measureLoudness(target: LoudnessTarget, trim: TrimPlan): Promise<{ plan: NormalizationPlan | null; unchanged: LoudnessResult | null }> {
    const measurement = parseMeasurement(await this.pass("measuring", buildMeasureArgs(target, trim.window)));
    if (isAtTarget(target, measurement.integrated, measurement.truePeak)) {
      const lufs = measurement.integrated;
      return { plan: null, unchanged: { measuredLufs: lufs, measuredTruePeak: measurement.truePeak, expectedLufs: lufs, type: "unchanged" } };
    }
    const sampleRate = resolveOutputRate(this.info?.sampleRateHz);
    return { plan: { target, measurement, sampleRate }, unchanged: null };
  }

  private normalizedLoudness({ target, measurement }: NormalizationPlan, log: string): LoudnessResult {
    return {
      measuredLufs: measurement.integrated,
      measuredTruePeak: measurement.truePeak,
      expectedLufs: parseOutputLufs(log) ?? target.integratedLufs,
      type: parseNormalizationType(log),
    };
  }

  private async pass(phase: ProcessingPhase, args: string[]): Promise<string> {
    const log = await this.runner.run(args, (ratio) => this.report(progressOf(phase, ratio, this.passes)));
    this.info ??= parseAudioInfo(log);
    return log;
  }
}
