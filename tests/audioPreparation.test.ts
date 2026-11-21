// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaRunner } from "../src/convert/processAudio";
import type { AudioInfo } from "../src/domain/audioDescription";
import { saveSettings } from "../src/settings";
import { AudioPreparation } from "../src/ui/audioPreparation";
import { flush, manualRunner, runnerThat, source, type Behaviour } from "./fakes";

const page = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html").body.innerHTML;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rows = () => [...document.querySelectorAll<HTMLElement>("#queueList .queue-item")];
const rowText = (row: HTMLElement) => [row.querySelector(".queue-name")?.textContent, row.querySelector(".queue-status")?.textContent];

const MP3_INFO: AudioInfo = { codec: "MP3", durationSeconds: 65, sampleRateHz: 44100, channels: 2, bitrateKbps: 128 };

function setUp(behaviour: Behaviour = "succeeds") {
  const runners: MediaRunner[] = [];
  const onChange = vi.fn();
  const preparation = new AudioPreparation(onChange, {
    createRunner: () => {
      const runner = runnerThat(behaviour);
      runners.push(runner);
      return runner;
    },
    describeMp3: async () => MP3_INFO,
  });
  return { preparation, runners, onChange };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = page;
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

describe("AudioPreparation", () => {
  it("offers both loudness targets and keeps the selector off until normalizing", () => {
    setUp();
    expect([...element<HTMLSelectElement>("loudnessTarget").options].map((option) => option.value)).toEqual(["ebu-r128", "streaming"]);
    expect(element<HTMLSelectElement>("loudnessTarget").disabled).toBe(true);
  });

  it("uses a plain MP3 as it is, shows what it is and offers a preview", async () => {
    const { preparation } = setUp();
    preparation.add([source("show.mp3")]);
    await flush();
    expect(preparation.prepared).toEqual({ blob: null, converted: false, loudness: null, trim: null });
    expect(element("audioInfo").textContent).toBe("MP3 · 1:05 · 44.1 kHz · stereo · 128 kb/s");
    expect(element("audioPreview").hidden).toBe(false);
  });

  it("converts other formats and describes the source", async () => {
    const { preparation } = setUp();
    preparation.add([source("show.wav")]);
    expect(preparation.isProcessing()).toBe(true);
    expect(element("audioProgress").hidden).toBe(false);
    expect(element("audioPreview").hidden).toBe(true);
    await flush();
    expect(preparation.prepared).toMatchObject({ converted: true });
    expect(element("audioInfo").textContent).toBe("PCM · 0:10 · 44.1 kHz · stereo · 1411 kb/s");
    expect(element("audioProgress").hidden).toBe(true);
  });

  it("re-runs an MP3 once normalization is switched on and shows the loudness change", async () => {
    const { preparation } = setUp();
    preparation.add([source("show.mp3")]);
    element<HTMLInputElement>("normalize").click();
    expect(element<HTMLSelectElement>("loudnessTarget").disabled).toBe(false);
    await flush();
    expect(preparation.prepared?.loudness).toMatchObject({ target: { id: "ebu-r128" }, type: "linear", measuredLufs: -30, expectedLufs: -23.1 });
    expect(element("audioResult").textContent).toBe("Loudness: -30.0 LUFS (true peak -5.0 dBTP) → about -23.1 LUFS.");
  });

  it("starts processing an MP3 when silence trimming is switched on", async () => {
    const { preparation } = setUp();
    preparation.add([source("show.mp3")]);
    element<HTMLInputElement>("trimSilence").click();
    expect(preparation.isProcessing()).toBe(true);
    await flush();
    expect(preparation.prepared?.trim).toEqual({ kind: "none" });
  });

  it("restores and remembers the settings", () => {
    saveSettings({ normalize: true, targetId: "streaming", trimSilence: true });
    setUp();
    expect(element<HTMLInputElement>("normalize").checked).toBe(true);
    expect(element<HTMLSelectElement>("loudnessTarget").value).toBe("streaming");
    expect(element<HTMLSelectElement>("loudnessTarget").disabled).toBe(false);
    element<HTMLInputElement>("trimSilence").click();
    expect(JSON.parse(localStorage.getItem("sphere-tagger-settings") ?? "{}")).toEqual({ normalize: true, targetId: "streaming", trimSilence: false });
  });

  it("shows the failure on the file field", async () => {
    const { preparation } = setUp("fails");
    preparation.add([source("show.flac")]);
    await flush();
    expect(preparation.prepared).toBeNull();
    expect(preparation.notReadyMessage()).toBe("Broken audio.");
    expect(element("error-file").textContent).toBe("Broken audio.");
  });

  it("removes the current file when its preparation is cancelled", () => {
    const { preparation, runners } = setUp("hangs");
    preparation.add([source("show.wav")]);
    element("audioCancel").click();
    expect(runners[0]?.terminate).toHaveBeenCalled();
    expect(preparation.currentSource).toBeNull();
    expect(preparation.hasFiles).toBe(false);
    expect(element("queueList").hidden).toBe(true);
    expect(element("audioPreview").hidden).toBe(true);
  });

  it("tells the app when something changed", async () => {
    const { preparation, onChange } = setUp();
    preparation.add([source("show.wav")]);
    await flush();
    expect(onChange).toHaveBeenCalled();
  });
});

describe("the file list", () => {
  it("lists every file, marks the current one and prepares the next in the background", () => {
    const { preparation } = setUp("hangs");
    preparation.add([source("a.wav"), source("b.wav")]);
    expect(rows().map(rowText)).toEqual([["a.wav", "Preparing… 0%"], ["b.wav", "Waiting"]]);
    expect(rows()[0]?.getAttribute("aria-current")).toBe("true");
    expect(rows()[1]?.hasAttribute("aria-current")).toBe(false);
    expect(preparation.currentSource?.file.name).toBe("a.wav");
  });

  it("shows the next file as ready once the current one is done", async () => {
    const { preparation } = setUp();
    preparation.add([source("a.wav"), source("b.wav")]);
    await flush();
    expect(rows().map(rowText)).toEqual([["a.wav", "Current"], ["b.wav", "Ready"]]);
    expect(preparation.untaggedCount).toBe(2);
  });

  it("moves on to the next file after one is tagged", async () => {
    const { preparation } = setUp();
    preparation.add([source("a.wav"), source("b.wav")]);
    await flush();
    preparation.markTagged();
    preparation.advance();
    expect(rows().map(rowText)).toEqual([["a.wav", "Tagged"], ["b.wav", "Current"]]);
    expect(preparation.currentSource?.file.name).toBe("b.wav");
    expect(preparation.prepared).not.toBeNull();
  });

  it("removes a file with its button and keeps focus in the list", async () => {
    const { preparation } = setUp();
    preparation.add([source("a.wav"), source("b.wav"), source("c.wav")]);
    await flush();
    rows()[0]?.querySelector<HTMLButtonElement>(".queue-remove")?.click();
    expect(rows().map((row) => rowText(row)[0])).toEqual(["b.wav", "c.wav"]);
    expect(preparation.currentSource?.file.name).toBe("b.wav");
    expect(document.activeElement).toBe(rows()[0]?.querySelector(".queue-remove"));
  });

  it("keeps the same buttons while progress ticks, so a focused button stays focused", () => {
    const manual = manualRunner();
    new AudioPreparation(() => {}, { createRunner: () => manual.runner, describeMp3: async () => null }).add([source("a.wav")]);
    const button = rows()[0]?.querySelector(".queue-remove");
    manual.finish();
    expect(rows()[0]?.querySelector(".queue-remove")).toBe(button);
  });

  it("empties the list", () => {
    const { preparation } = setUp("hangs");
    preparation.add([source("a.wav"), source("b.wav")]);
    preparation.clear();
    expect(rows()).toHaveLength(0);
    expect(preparation.hasFiles).toBe(false);
  });
});
