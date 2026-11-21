import { describe, expect, it } from "vitest";
import { isMp3, isSupportedAudio, sourcesFromDrop } from "../src/io/audioSource";

const file = (name: string) => new File([new Uint8Array([1])], name);

describe("sourcesFromDrop", () => {
  it("takes every dropped file, keeps handles where the browser gives them and skips other items", async () => {
    const handled = file("handled.wav");
    const handle = { kind: "file", getFile: async () => handled } as unknown as FileSystemFileHandle;
    const items = [
      { kind: "file", getAsFile: () => file("fallback.wav"), getAsFileSystemHandle: async () => handle },
      { kind: "string", getAsFile: () => null },
      { kind: "file", getAsFile: () => file("plain.mp3") },
    ] as unknown as DataTransferItemList;

    const sources = await sourcesFromDrop(items);
    expect(sources.map((source) => source.file.name)).toEqual(["handled.wav", "plain.mp3"]);
    expect(sources[0]?.handle).toBe(handle);
    expect(sources[1]?.handle).toBeNull();
  });

  it("falls back to the plain file when the handle is a directory", async () => {
    const directory = { kind: "directory" } as unknown as FileSystemHandle;
    const items = [{ kind: "file", getAsFile: () => file("a.flac"), getAsFileSystemHandle: async () => directory }] as unknown as DataTransferItemList;
    expect((await sourcesFromDrop(items)).map((source) => source.file.name)).toEqual(["a.flac"]);
  });
});

describe("file types", () => {
  it.each([["show.MP3", true, true], ["show.wav", false, true], ["show.opus", false, true], ["notes.txt", false, false]])(
    "%s",
    (name, mp3, supported) => {
      expect(isMp3(file(name))).toBe(mp3);
      expect(isSupportedAudio(file(name))).toBe(supported);
    },
  );
});
