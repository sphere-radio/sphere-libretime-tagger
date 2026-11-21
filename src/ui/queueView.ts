import type { QueueEntry } from "../queue/audioQueue";
import { byId, h } from "./dom";

interface Row {
  item: HTMLLIElement;
  status: HTMLElement;
}

export class QueueView {
  private readonly list = byId<HTMLOListElement>("queueList");
  private rows = new Map<number, Row>();

  constructor(private readonly onRemove: (id: number) => void) {}

  update(entries: readonly Readonly<QueueEntry>[], currentId: number | null): void {
    this.list.hidden = entries.length === 0;
    if (!this.hasSameRows(entries)) this.rebuild(entries);
    for (const entry of entries) this.refresh(entry, entry.id === currentId);
  }

  focusAfterRemoval(): void {
    const next = this.list.querySelector<HTMLButtonElement>(".queue-remove");
    (next ?? byId("fileDrop")).focus();
  }

  private hasSameRows(entries: readonly Readonly<QueueEntry>[]): boolean {
    return entries.length === this.rows.size && entries.every((entry) => this.rows.has(entry.id));
  }

  // Rows are only rebuilt when files come or go, so a focused remove button keeps focus while progress ticks.
  private rebuild(entries: readonly Readonly<QueueEntry>[]): void {
    const previous = this.rows;
    this.rows = new Map(entries.map((entry) => [entry.id, previous.get(entry.id) ?? this.createRow(entry)]));
    this.list.replaceChildren(...[...this.rows.values()].map((row) => row.item));
  }

  private createRow(entry: Readonly<QueueEntry>): Row {
    const name = entry.source.file.name;
    const status = h("span", { class: "queue-status" });
    const remove = h("button", { type: "button", class: "btn quiet queue-remove", ariaLabel: `Remove ${name} from the list`, textContent: "×" });
    remove.addEventListener("click", () => this.onRemove(entry.id));
    const item = h("li", { class: "queue-item" }, h("span", { class: "queue-name", textContent: name }), status, remove);
    return { item, status };
  }

  private refresh(entry: Readonly<QueueEntry>, isCurrent: boolean): void {
    const row = this.rows.get(entry.id);
    if (!row) return;
    row.item.classList.toggle("is-current", isCurrent);
    row.item.classList.toggle("is-tagged", entry.tagged);
    if (isCurrent) row.item.setAttribute("aria-current", "true");
    else row.item.removeAttribute("aria-current");
    setText(row.status, statusOf(entry, isCurrent));
  }
}

export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

function statusOf(entry: Readonly<QueueEntry>, isCurrent: boolean): string {
  if (entry.tagged) return "Tagged";
  const state = entry.job.state;
  switch (state.kind) {
    case "processing":
      return `Preparing… ${Math.round((state.progress?.fraction ?? 0) * 100)}%`;
    case "failed":
      return "Could not be prepared";
    case "ready":
      return isCurrent ? "Current" : "Ready";
    case "idle":
      return isCurrent ? "Current" : "Waiting";
  }
}
