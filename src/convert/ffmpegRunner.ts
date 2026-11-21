import { FFFSType, FFmpeg, type LogEvent, type ProgressEvent as FfmpegProgressEvent } from "@ffmpeg/ffmpeg";
import coreUrl from "@ffmpeg/core?url";
import wasmUrl from "@ffmpeg/core/wasm?url";
import { ConversionError } from "./errors";
import { MOUNT_DIR, OUTPUT_PATH, SOURCE_NAME } from "./ffmpegArgs";
import type { MediaRunner } from "./processAudio";

export class FfmpegRunner implements MediaRunner {
  private readonly ffmpeg = new FFmpeg();

  async mount(file: File): Promise<void> {
    await this.ffmpeg.load({ coreURL: coreUrl, wasmURL: wasmUrl });
    await this.ffmpeg.createDir(MOUNT_DIR);
    // Mounting reads the file lazily, so long recordings are never copied into memory.
    await this.ffmpeg.mount(FFFSType.WORKERFS, { files: [new File([file], SOURCE_NAME)] }, MOUNT_DIR);
  }

  async run(args: string[], onProgress: (ratio: number) => void): Promise<string> {
    const lines: string[] = [];
    const collect = ({ message }: LogEvent) => void lines.push(message);
    const forward = ({ progress }: FfmpegProgressEvent) => onProgress(progress);
    this.ffmpeg.on("log", collect);
    this.ffmpeg.on("progress", forward);
    try {
      if ((await this.ffmpeg.exec(args)) !== 0) throw new ConversionError("This audio file could not be converted. It may be damaged or use an unsupported format.");
      return lines.join("\n");
    } finally {
      this.ffmpeg.off("log", collect);
      this.ffmpeg.off("progress", forward);
    }
  }

  async readOutput(): Promise<Uint8Array> {
    const output = await this.ffmpeg.readFile(OUTPUT_PATH);
    if (typeof output === "string") throw new ConversionError("The converted audio could not be read.");
    return output;
  }

  terminate(): void {
    this.ffmpeg.terminate();
  }
}
