import type { AudioSource } from "../io/audioSource";
import { PreparationJob, type JobOptions, type PreparationServices } from "./preparationJob";

export interface QueueEntry {
  readonly id: number;
  readonly source: AudioSource;
  readonly job: PreparationJob;
  tagged: boolean;
}

/**
 * Keeps the files of a batch in order and prepares them one at a time:
 * the current file first, then the one after it, so memory holds at most two results.
 */
export class AudioQueue {
  private items: QueueEntry[] = [];
  private currentId: number | null = null;
  private lastId = 0;

  constructor(
    private readonly services: PreparationServices,
    private readonly onChange: () => void,
    private options: JobOptions,
  ) {}

  get entries(): readonly Readonly<QueueEntry>[] {
    return this.items;
  }

  get current(): QueueEntry | null {
    return this.items.find((entry) => entry.id === this.currentId) ?? null;
  }

  get untaggedCount(): number {
    return this.items.filter((entry) => !entry.tagged).length;
  }

  add(sources: AudioSource[]): void {
    for (const source of sources) {
      const entry: QueueEntry = { id: (this.lastId += 1), source, tagged: false, job: this.createJob(source) };
      this.items.push(entry);
    }
    if (this.current === null || this.current.tagged) this.moveTo(this.firstUntaggedFrom(0));
    this.update();
  }

  remove(id: number): void {
    const index = this.items.findIndex((entry) => entry.id === id);
    const removed = this.items[index];
    if (!removed) return;
    removed.job.abandon();
    this.items.splice(index, 1);
    if (id === this.currentId) this.currentId = this.firstUntaggedFrom(index)?.id ?? null;
    this.update();
  }

  markTagged(): void {
    const entry = this.current;
    if (entry) entry.tagged = true;
    this.update();
  }

  advance(): void {
    const leaving = this.current;
    if (!leaving) return;
    leaving.job.abandon();
    leaving.tagged = true;
    this.currentId = this.firstUntaggedFrom(this.items.indexOf(leaving) + 1)?.id ?? null;
    this.update();
  }

  clear(): void {
    for (const entry of this.items) entry.job.abandon();
    this.items = [];
    this.currentId = null;
    this.update();
  }

  setOptions(options: JobOptions): void {
    this.options = options;
    for (const entry of this.items) if (!entry.tagged) entry.job.abandon();
    this.update();
  }

  private createJob(source: AudioSource): PreparationJob {
    return new PreparationJob(source, this.services, () => this.update());
  }

  private moveTo(entry: QueueEntry | undefined): void {
    this.current?.job.abandon();
    this.currentId = entry?.id ?? null;
  }

  private firstUntaggedFrom(index: number): QueueEntry | undefined {
    return this.items.slice(index).find((entry) => !entry.tagged);
  }

  private following(): QueueEntry | undefined {
    const current = this.current;
    return current ? this.firstUntaggedFrom(this.items.indexOf(current) + 1) : undefined;
  }

  private update(): void {
    this.prepareNext();
    this.onChange();
  }

  private prepareNext(): void {
    if (this.items.some((entry) => entry.job.state.kind === "processing")) return;
    const current = this.current;
    const wanted = [current && !current.tagged ? current : undefined, this.following()];
    wanted.find((entry) => entry?.job.state.kind === "idle")?.job.start(this.options);
  }
}
