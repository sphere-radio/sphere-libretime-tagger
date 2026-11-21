// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPicker } from "../src/ui/audioPicker";

const page = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html").body.innerHTML;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const file = (name: string) => new File([new Uint8Array([1])], name);

function choose(...files: File[]) {
  const input = element<HTMLInputElement>("fileInput");
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  document.body.innerHTML = page;
});

describe("AudioPicker", () => {
  it("hands over every supported file at once", () => {
    const onFiles = vi.fn();
    new AudioPicker(onFiles);
    choose(file("a.wav"), file("b.mp3"));
    expect(onFiles.mock.calls[0]?.[0].map((source: { file: File }) => source.file.name)).toEqual(["a.wav", "b.mp3"]);
    expect(element("error-file").textContent).toBe("");
  });

  it("skips unsupported files and says so", () => {
    const onFiles = vi.fn();
    new AudioPicker(onFiles);
    choose(file("a.wav"), file("notes.txt"), file("cover.png"));
    expect(onFiles.mock.calls[0]?.[0]).toHaveLength(1);
    expect(element("error-file").textContent).toMatch(/2 files were skipped/);
  });

  it("does not report anything when no file is usable", () => {
    const onFiles = vi.fn();
    new AudioPicker(onFiles);
    choose(file("notes.txt"));
    expect(onFiles).not.toHaveBeenCalled();
    expect(element("error-file").textContent).toMatch(/MP3, WAV/);
  });

  it("asks for more files once some are chosen", () => {
    const picker = new AudioPicker(() => {});
    picker.showsMoreFiles(true);
    expect(element("fileDropText").textContent).toMatch(/more/);
    picker.showsMoreFiles(false);
    expect(element("fileDropText").textContent).not.toMatch(/more/);
  });
});
