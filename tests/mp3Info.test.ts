import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { TagLib } from "taglib-wasm";
import { readMp3Info } from "../src/audio/mp3Info";

const wasm = new Uint8Array(readFileSync("node_modules/taglib-wasm/dist/taglib-web.wasm"));
const mp3 = (bytes: Uint8Array = new Uint8Array(readFileSync("tests/fixtures/silence.mp3"))) => new File([bytes as Uint8Array<ArrayBuffer>], "silence.mp3");

let taglib: TagLib;
beforeAll(async () => {
  taglib = await TagLib.initialize({ wasmBinary: wasm });
});

describe("readMp3Info", () => {
  it("describes the file", async () => {
    const info = await readMp3Info(taglib, mp3());
    expect(info).toMatchObject({ codec: "MP3" });
    expect(info?.sampleRateHz).toBeGreaterThan(0);
    expect(info?.durationSeconds).toBeGreaterThan(0);
  });

  it("rejects bytes that are not an MP3", async () => {
    await expect(readMp3Info(taglib, mp3(new Uint8Array([1, 2, 3, 4])))).rejects.toThrow();
  });
});
