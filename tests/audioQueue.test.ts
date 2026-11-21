import { describe, expect, it, vi } from "vitest";
import { AudioQueue } from "../src/queue/audioQueue";
import type { JobOptions } from "../src/queue/preparationJob";
import { flush, manualRunner, source, type ManualRunner } from "./fakes";

const PLAIN: JobOptions = { target: null, trimSilence: false };
const names = (queue: AudioQueue) => queue.entries.map((entry) => entry.source.file.name);
const states = (queue: AudioQueue) => queue.entries.map((entry) => (entry.tagged ? "tagged" : entry.job.state.kind));

function setUp() {
  const runners: ManualRunner[] = [];
  const services = {
    createRunner: () => {
      const manual = manualRunner();
      runners.push(manual);
      return manual.runner;
    },
    describeMp3: async () => null,
  };
  const onChange = vi.fn();
  return { queue: new AudioQueue(services, onChange, PLAIN), runners, onChange };
}

describe("AudioQueue", () => {
  it("makes the first file current and prepares only that one", () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav"), source("b.wav"), source("c.wav")]);
    expect(queue.current?.source.file.name).toBe("a.wav");
    expect(states(queue)).toEqual(["processing", "idle", "idle"]);
    expect(runners).toHaveLength(1);
  });

  it("prepares the next file once the current one is ready, and no further", async () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav"), source("b.wav"), source("c.wav")]);
    runners[0]!.finish();
    await flush();
    expect(states(queue)).toEqual(["ready", "processing", "idle"]);
    runners[1]!.finish();
    await flush();
    expect(states(queue)).toEqual(["ready", "ready", "idle"]);
    expect(runners).toHaveLength(2);
  });

  it("moves on after a file is tagged, releases it and prepares the one after", async () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav"), source("b.wav"), source("c.wav")]);
    runners[0]!.finish();
    await flush();
    runners[1]!.finish();
    await flush();
    queue.markTagged();
    queue.advance();
    expect(queue.current?.source.file.name).toBe("b.wav");
    expect(states(queue)).toEqual(["tagged", "ready", "processing"]);
    expect(queue.untaggedCount).toBe(2);
  });

  it("ends with no current file after the last one", async () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav")]);
    runners[0]!.finish();
    await flush();
    queue.advance();
    expect(queue.current).toBeNull();
    expect(queue.untaggedCount).toBe(0);
    expect(names(queue)).toEqual(["a.wav"]);
  });

  it("makes new files current once everything before them is tagged", async () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav")]);
    runners[0]!.finish();
    await flush();
    queue.markTagged();
    queue.add([source("b.wav")]);
    expect(queue.current?.source.file.name).toBe("b.wav");
  });

  it("stops and skips a removed current file", () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav"), source("b.wav")]);
    queue.remove(queue.current!.id);
    expect(runners[0]!.runner.terminate).toHaveBeenCalled();
    expect(names(queue)).toEqual(["b.wav"]);
    expect(queue.current?.source.file.name).toBe("b.wav");
    expect(states(queue)).toEqual(["processing"]);
  });

  it("keeps the current file when another one is removed", () => {
    const { queue } = setUp();
    queue.add([source("a.wav"), source("b.wav")]);
    queue.remove(queue.entries[1]!.id);
    expect(queue.current?.source.file.name).toBe("a.wav");
  });

  it("does not let a failed file block the next one", async () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav"), source("b.wav")]);
    runners[0]!.fail();
    await flush();
    expect(states(queue)).toEqual(["failed", "processing"]);
  });

  it("starts again with new options, current file first", async () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav"), source("b.wav")]);
    runners[0]!.finish();
    await flush();
    queue.setOptions({ target: null, trimSilence: true });
    expect(runners[0]!.runner.terminate).toHaveBeenCalled();
    expect(states(queue)).toEqual(["processing", "idle"]);
    expect(runners).toHaveLength(3);
  });

  it("leaves a file that is already tagged alone when the options change", async () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav")]);
    runners[0]!.finish();
    await flush();
    queue.markTagged();
    queue.setOptions({ target: null, trimSilence: true });
    expect(queue.current?.job.state.kind).toBe("ready");
  });

  it("uses a plain MP3 at once and moves straight on to the next file", () => {
    const { queue, runners } = setUp();
    queue.add([source("a.mp3"), source("b.wav")]);
    expect(states(queue)).toEqual(["ready", "processing"]);
    expect(runners).toHaveLength(1);
  });

  it("empties the whole list", () => {
    const { queue, runners } = setUp();
    queue.add([source("a.wav"), source("b.wav")]);
    queue.clear();
    expect(queue.entries).toHaveLength(0);
    expect(queue.current).toBeNull();
    expect(runners[0]!.runner.terminate).toHaveBeenCalled();
  });
});
