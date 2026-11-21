import { ConversionError } from "../convert/errors";
import { processAudio, type MediaRunner, type ProcessedAudio, type ProcessingOptions } from "../convert/processAudio";
import type { ProcessingProgress } from "../convert/progress";
import type { AudioInfo } from "../domain/audioDescription";
import type { AppliedLoudness, LoudnessTarget } from "../domain/loudness";
import type { TrimOutcome } from "../domain/trim";
import { isMp3, type AudioSource } from "../io/audioSource";

export interface PreparedAudio {
  /** Null means the chosen MP3 is used untouched. */
  blob: Blob | null;
  converted: boolean;
  loudness: AppliedLoudness | null;
  trim: TrimOutcome | null;
}

export interface PreparationServices {
  createRunner(): MediaRunner;
  describeMp3(file: File): Promise<AudioInfo | null>;
}

export interface JobOptions {
  target: LoudnessTarget | null;
  trimSilence: boolean;
}

export type JobState =
  | { kind: "idle" }
  | { kind: "processing"; progress: ProcessingProgress | null }
  | { kind: "failed"; message: string }
  | { kind: "ready"; audio: PreparedAudio };

const MP3_MIME_TYPE = "audio/mpeg";
const FAILURE_MESSAGE = "The audio could not be prepared. Try another file.";

export class PreparationJob {
  private current: JobState = { kind: "idle" };
  private details: AudioInfo | null = null;
  private runner: MediaRunner | null = null;
  private generation = 0;
  private infoRequested = false;

  constructor(
    readonly source: AudioSource,
    private readonly services: PreparationServices,
    private readonly onChange: () => void,
  ) {}

  get state(): JobState {
    return this.current;
  }

  get info(): AudioInfo | null {
    return this.details;
  }

  start(options: JobOptions): void {
    this.abandon();
    this.requestInfo();
    const file = this.source.file;
    const full = { ...options, canKeepOriginal: isMp3(file) };
    if (full.canKeepOriginal && !full.target && !full.trimSilence) {
      this.set({ kind: "ready", audio: { blob: null, converted: false, loudness: null, trim: null } });
    } else {
      void this.process(file, full);
    }
  }

  /** Stops any running work and drops the prepared audio, without announcing it. */
  abandon(): void {
    this.generation += 1;
    this.runner?.terminate();
    this.runner = null;
    this.current = { kind: "idle" };
  }

  private requestInfo(): void {
    if (this.infoRequested || !isMp3(this.source.file)) return;
    this.infoRequested = true;
    void this.services.describeMp3(this.source.file).then((info) => {
      this.details = info;
      this.onChange();
    });
  }

  private async process(file: File, options: ProcessingOptions): Promise<void> {
    const generation = this.generation;
    const runner = this.services.createRunner();
    this.runner = runner;
    this.set({ kind: "processing", progress: null });
    try {
      const result = await processAudio(runner, file, options, (progress) => this.report(generation, progress));
      this.finish(generation, this.readyState(options, result));
    } catch (failure) {
      if (generation !== this.generation) return;
      if (!(failure instanceof ConversionError)) console.error("Audio processing failed.", failure);
      this.finish(generation, { kind: "failed", message: failure instanceof ConversionError ? failure.message : FAILURE_MESSAGE });
    }
  }

  private readyState(options: ProcessingOptions, result: ProcessedAudio): JobState {
    const converted = !options.canKeepOriginal;
    if (converted) this.details = result.info;
    const loudness = options.target && result.loudness ? { target: options.target, ...result.loudness } : null;
    const blob = result.bytes && new Blob([result.bytes as Uint8Array<ArrayBuffer>], { type: MP3_MIME_TYPE });
    return { kind: "ready", audio: { blob, converted, loudness, trim: result.trim } };
  }

  private report(generation: number, progress: ProcessingProgress): void {
    if (generation === this.generation) this.set({ kind: "processing", progress });
  }

  private finish(generation: number, state: JobState): void {
    if (generation !== this.generation) return;
    this.runner = null;
    this.set(state);
  }

  private set(state: JobState): void {
    this.current = state;
    this.onChange();
  }
}
