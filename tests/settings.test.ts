// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "../src/settings";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("settings", () => {
  it("starts with everything off and the broadcast target", () => {
    expect(loadSettings()).toEqual({ normalize: false, targetId: "ebu-r128", trimSilence: false });
  });

  it("remembers what was saved", () => {
    saveSettings({ normalize: true, targetId: "streaming", trimSilence: true });
    expect(loadSettings()).toEqual({ normalize: true, targetId: "streaming", trimSilence: true });
  });

  it("ignores stored values it does not know", () => {
    localStorage.setItem("sphere-tagger-settings", JSON.stringify({ normalize: "yes", targetId: "loud", trimSilence: 1 }));
    expect(loadSettings()).toEqual({ normalize: false, targetId: "ebu-r128", trimSilence: false });
  });

  it("survives damaged storage", () => {
    localStorage.setItem("sphere-tagger-settings", "{not json");
    expect(loadSettings().normalize).toBe(false);
  });

  it("keeps working when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadSettings().normalize).toBe(false);
    expect(() => saveSettings({ normalize: true, targetId: "streaming", trimSilence: true })).not.toThrow();
  });
});
