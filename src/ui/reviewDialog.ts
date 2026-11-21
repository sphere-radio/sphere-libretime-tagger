import type { Mp3Tags } from "../domain/types";
import type { SaveOutcome } from "../io/saveMp3";
import { byId, h } from "./dom";

export interface ReviewModel {
  originalName: string;
  newName: string;
  tags: Mp3Tags;
  nameWasShortened: boolean;
  replacesOriginal: boolean;
}

const OUTCOME_MESSAGES: Record<SaveOutcome, (name: string) => string> = {
  "replaced-original": (name) => `Saved. The file is now named ${name}.`,
  "downloaded-copy": (name) => `Saved as ${name} in your downloads folder. The original file was not changed.`,
};

export class ReviewDialog {
  private readonly dialog = byId<HTMLDialogElement>("reviewDialog");
  private readonly body = byId("reviewBody");
  private readonly actions = byId("reviewActions");

  open(model: ReviewModel, save: () => Promise<SaveOutcome>, onDone: () => void): void {
    this.showReview(model, save, onDone);
    if (!this.dialog.open) this.dialog.showModal();
  }

  private showReview(model: ReviewModel, save: () => Promise<SaveOutcome>, onDone: () => void): void {
    this.body.replaceChildren(this.renderSummary(model), this.renderNotes(model));
    const back = h("button", { type: "button", class: "btn", textContent: "Back" });
    const confirm = h("button", { type: "button", class: "btn primary", textContent: "Save" });
    back.addEventListener("click", () => this.dialog.close());
    confirm.addEventListener("click", () => void this.runSave(model, save, onDone));
    this.actions.replaceChildren(back, confirm);
    confirm.focus();
  }

  private async runSave(model: ReviewModel, save: () => Promise<SaveOutcome>, onDone: () => void): Promise<void> {
    this.actions.replaceChildren();
    this.body.replaceChildren(h("p", { role: "status", textContent: "Saving…" }));
    try {
      const outcome = await save();
      this.showDone(OUTCOME_MESSAGES[outcome](model.newName), onDone);
    } catch (error) {
      this.showFailure(error, model, save, onDone);
    }
  }

  private showDone(message: string, onDone: () => void): void {
    const next = h("button", { type: "button", class: "btn primary", textContent: "Tag another file" });
    const close = h("button", { type: "button", class: "btn", textContent: "Close" });
    next.addEventListener("click", () => {
      this.dialog.close();
      onDone();
    });
    close.addEventListener("click", () => this.dialog.close());
    this.body.replaceChildren(h("p", { role: "status", class: "success", textContent: message }));
    this.actions.replaceChildren(close, next);
    next.focus();
  }

  private showFailure(error: unknown, model: ReviewModel, save: () => Promise<SaveOutcome>, onDone: () => void): void {
    const reason = error instanceof Error ? error.message : "Something went wrong.";
    const retry = h("button", { type: "button", class: "btn primary", textContent: "Try again" });
    const close = h("button", { type: "button", class: "btn", textContent: "Close" });
    retry.addEventListener("click", () => this.showReview(model, save, onDone));
    close.addEventListener("click", () => this.dialog.close());
    this.body.replaceChildren(h("p", { role: "alert", class: "error", textContent: `Nothing was saved. ${reason}` }));
    this.actions.replaceChildren(close, retry);
    retry.focus();
  }

  private renderSummary(model: ReviewModel): HTMLElement {
    const { tags } = model;
    const rows: [string, string][] = [
      ["Current file", model.originalName],
      ["New file name", model.newName],
      ["Title", tags.title],
      ["Artist", tags.artist || "(empty)"],
      ["Album", tags.album],
      ["Track number", tags.trackNumber === null ? "(empty)" : String(tags.trackNumber)],
      ["Composer", tags.composer],
      ["Cover", "Embedded as JPEG"],
    ];
    return h("dl", { class: "summary" }, ...rows.flatMap(([term, value]) => [h("dt", { textContent: term }), h("dd", { textContent: value })]));
  }

  private renderNotes(model: ReviewModel): HTMLElement {
    const notes = [
      "All other tags in the file are removed.",
      model.replacesOriginal
        ? "Saving changes the original file and renames it. If a file with the new name is in the same folder, check it first."
        : "Your browser cannot rename the original. A tagged copy is downloaded and the original stays unchanged.",
    ];
    if (model.nameWasShortened) notes.push("The episode title is shortened in the file name to stay within 100 characters. The Title tag keeps it in full.");
    return h("ul", { class: "notes" }, ...notes.map((text) => h("li", { textContent: text })));
  }
}
