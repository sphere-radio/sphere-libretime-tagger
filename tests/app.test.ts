// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { startApp } from "../src/app";
import { IndexedDbRepository } from "../src/shows/indexedDbRepository";
import { newProfile } from "../src/shows/profile";

const page = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html").body.innerHTML;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const type = (id: string, value: string) => {
  const input = element<HTMLInputElement>(id);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
const chipNames = () => [...document.querySelectorAll("#chipList .chip")].map((chip) => chip.textContent);

async function openApp(seed: Parameters<IndexedDbRepository["save"]>[0][] = []) {
  indexedDB = new IDBFactory();
  const repository = new IndexedDbRepository();
  for (const profile of seed) await repository.save(profile);
  document.body.innerHTML = page;
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  await startApp();
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("app wiring", () => {
  it("starts with an empty show list and a hint in the readout", async () => {
    await openApp();
    expect(element<HTMLSelectElement>("show").options).toHaveLength(1);
    expect(element("readout").textContent).toMatch(/Choose a show/);
  });

  it("selects a freshly added show", async () => {
    await openApp();
    element("newShow").click();
    element<HTMLInputElement>("newShowName").value = "  Mike’s   Hour ";
    element<HTMLFormElement>("addShowForm").dispatchEvent(new Event("submit", { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(element<HTMLSelectElement>("show").value).toBe("Mike's Hour");
  });

  it("prefills episode and primary contributors from the show", async () => {
    await openApp([{ ...newProfile("1H w/ DJ Mike"), lastEpisode: 37, primaryContributors: ["DJ Mike"] }]);
    const select = element<HTMLSelectElement>("show");
    select.value = "1H w/ DJ Mike";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(element<HTMLInputElement>("episode").value).toBe("38");
    expect(chipNames().join()).toContain("DJ Mike");
    expect(document.querySelector(".chip-badge")?.textContent).toBe("primary");
  });

  it("builds the file name live", async () => {
    await openApp([{ ...newProfile("Quick"), lastEpisode: 6, primaryContributors: ["DJ B"] }]);
    const select = element<HTMLSelectElement>("show");
    select.value = "Quick";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    type("date", "2002-02-02");
    expect(element("readout").textContent).toBe("Quick - 7 - DJ B - 02.02.2002.mp3");
    type("contributorInput", "DJ C");
    expect(element("readout").textContent).toBe("Quick - 7 - DJ B, DJ C - 02.02.2002.mp3");
  });

  it("flags every missing required field on review", async () => {
    await openApp();
    element<HTMLFormElement>("tagForm").dispatchEvent(new Event("submit", { cancelable: true }));
    for (const field of ["file", "cover", "show", "date"]) expect(element(`error-${field}`).textContent).not.toBe("");
    expect(element("fileDrop").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(element("fileDrop"));
  });

  it("rejects a non-numeric episode and clears the error when edited", async () => {
    await openApp();
    type("episode", "CINCO");
    element<HTMLFormElement>("tagForm").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(element("error-episode").textContent).toMatch(/digits/);
    type("episode", "5");
    expect(element("error-episode").textContent).toBe("");
  });

  it("de-duplicates contributors and toggles primary", async () => {
    await openApp();
    type("contributorInput", "DJ A, dj a, DJ B");
    element<HTMLInputElement>("contributorInput").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(chipNames().join()).toMatch(/DJ A.*DJ B/);
    expect(document.querySelectorAll("#chipList .chip")).toHaveLength(2);
    (document.querySelector(".chip-star") as HTMLButtonElement).click();
    expect(document.querySelector(".chip.is-primary")).not.toBeNull();
  });

  it("every help button points at an existing tooltip", async () => {
    await openApp();
    for (const button of document.querySelectorAll<HTMLButtonElement>(".tip")) {
      const tooltip = document.getElementById(button.getAttribute("aria-describedby") ?? "");
      expect(tooltip?.getAttribute("role")).toBe("tooltip");
    }
  });
});
