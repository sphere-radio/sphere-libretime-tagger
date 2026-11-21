import { describe, expect, it, vi } from "vitest";
import type { AudioInfo } from "../src/domain/audioDescription";
import { PreparationJob, type JobOptions, type PreparationServices } from "../src/queue/preparationJob";
import { flush, manualRunner, runnerThat, source } from "./fakes";

const PLAIN: JobOptions = { target: null, trimSilence: false };
const MP3_INFO: AudioInfo = { codec: "MP3", durationSeconds: 65, sampleRateHz: 44100, channels: 2, bitrateKbps: 128 };

function setUp(name: string, behaviour: "succeeds" | "fails" | "hangs" = "succeeds") {
  const runner = runnerThat(behaviour);
  const createRunner = vi.fn(() => runner);
  const services: PreparationServices = { createRunner, describeMp3: async () => MP3_INFO };
  const onChange = vi.fn();
  return { job: new PreparationJob(source(name), services, onChange), runner, createRunner, onChange };
}

describe("PreparationJob", () => {
  it("is ready at once for a plain MP3 and reads its details", async () => {
    const { job, createRunner } = setUp("show.mp3");
    job.start(PLAIN);
    expect(job.state).toEqual({ kind: "ready", audio: { blob: null, converted: false, loudness: null, trim: null } });
    expect(createRunner).not.toHaveBeenCalled();
    await flush();
    expect(job.info).toEqual(MP3_INFO);
  });

  it("converts other formats", async () => {
    const { job } = setUp("show.wav");
    job.start(PLAIN);
    expect(job.state.kind).toBe("processing");
    await flush();
    expect(job.state).toMatchObject({ kind: "ready", audio: { converted: true } });
    expect(job.info).toMatchObject({ codec: "pcm", durationSeconds: 10 });
  });

  it("exposes progress while it works", async () => {
    const { job, onChange } = setUp("show.wav");
    job.start(PLAIN);
    await flush();
    expect(onChange).toHaveBeenCalled();
    expect(job.state.kind).toBe("ready");
  });

  it("reports a conversion failure with its own message", async () => {
    const { job } = setUp("show.flac", "fails");
    job.start(PLAIN);
    await flush();
    expect(job.state).toEqual({ kind: "failed", message: "Broken audio." });
  });

  it("hides unexpected errors behind a general message", async () => {
    const { job, runner } = setUp("show.flac");
    runner.mount = vi.fn(async () => { throw new Error("out of memory"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    job.start(PLAIN);
    await flush();
    expect(job.state).toEqual({ kind: "failed", message: "The audio could not be prepared. Try another file." });
  });

  it("stops the running work when abandoned and ignores its late result", async () => {
    const manual = manualRunner();
    const job = new PreparationJob(source("show.wav"), { createRunner: () => manual.runner, describeMp3: async () => null }, () => {});
    job.start(PLAIN);
    job.abandon();
    expect(manual.runner.terminate).toHaveBeenCalled();
    manual.finish();
    await flush();
    expect(job.state).toEqual({ kind: "idle" });
  });

  it("restarts cleanly when started again", () => {
    const runners = [manualRunner(), manualRunner()];
    const create = vi.fn(() => runners[create.mock.calls.length - 1]!.runner);
    const job = new PreparationJob(source("show.wav"), { createRunner: create, describeMp3: async () => null }, () => {});
    job.start(PLAIN);
    job.start({ target: null, trimSilence: true });
    expect(runners[0]!.runner.terminate).toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
