import { readMp3Info } from "../audio/mp3Info";
import { loadTagLib } from "../audio/tagLibLoader";
import { FfmpegRunner } from "../convert/ffmpegRunner";
import type { ProcessingPhase } from "../convert/progress";
import { describeAudioInfo, describeLoudness, describeTrim } from "../domain/audioDescription";
import { LOUDNESS_TARGETS, targetById, type LoudnessTarget } from "../domain/loudness";
import type { AudioSource } from "../io/audioSource";
import { AudioQueue, type QueueEntry } from "../queue/audioQueue";
import type { JobOptions, JobState, PreparationServices, PreparedAudio } from "../queue/preparationJob";
import { loadSettings, saveSettings, type Settings } from "../settings";
import { AudioPreview } from "./audioPreview";
import { byId, h } from "./dom";
import { QueueView, setText } from "./queueView";

export type { PreparedAudio } from "../queue/preparationJob";

const LOADING_MESSAGE = "Loading the converter…";
const IDLE: JobState = { kind: "idle" };

const REAL_SERVICES: PreparationServices = {
  createRunner: () => new FfmpegRunner(),
  describeMp3: async (file) => {
    try {
      return await readMp3Info(await loadTagLib(), file);
    } catch {
      return null;
    }
  },
};

/** Shows the controls and the state of the current file, and drives the queue behind them. */
export class AudioPreparation {
  private readonly queue: AudioQueue;
  private readonly view = new QueueView((id) => this.removeFile(id));
  private readonly preview = new AudioPreview();
  private previewed: PreparedAudio | null = null;
  private showingFailure = false;

  private readonly masthead = byId("masthead");
  private readonly bar = byId("audioProgress");
  private readonly normalize = byId<HTMLInputElement>("normalize");
  private readonly target = byId<HTMLSelectElement>("loudnessTarget");
  private readonly trimSilence = byId<HTMLInputElement>("trimSilence");
  private readonly status = byId("audioStatus");
  private readonly infoLine = byId("audioInfo");
  private readonly resultLine = byId("audioResult");
  private readonly cancel = byId<HTMLButtonElement>("audioCancel");
  private readonly error = byId("error-file");

  constructor(
    private readonly onChange: () => void,
    services: PreparationServices = REAL_SERVICES,
  ) {
    this.target.replaceChildren(
      ...LOUDNESS_TARGETS.map((option) => h("option", { value: option.id, textContent: `${option.integratedLufs} LUFS (${option.description})` })),
    );
    this.applySettings(loadSettings());
    this.queue = new AudioQueue(services, () => this.render(), this.currentOptions());
    for (const control of [this.normalize, this.target, this.trimSilence]) {
      control.addEventListener("change", () => this.onSettingsChanged());
    }
    this.cancel.addEventListener("click", () => this.cancelCurrent());
  }

  get currentSource(): AudioSource | null {
    return this.queue.current?.source ?? null;
  }

  get prepared(): PreparedAudio | null {
    const state = this.queue.current?.job.state;
    return state?.kind === "ready" ? state.audio : null;
  }

  get hasFiles(): boolean {
    return this.queue.entries.length > 0;
  }

  get untaggedCount(): number {
    return this.queue.untaggedCount;
  }

  isProcessing(): boolean {
    return this.queue.current?.job.state.kind === "processing";
  }

  notReadyMessage(): string {
    const state = this.queue.current?.job.state;
    return state?.kind === "failed" ? state.message : "Wait until the audio is ready.";
  }

  add(sources: AudioSource[]): void {
    this.queue.add(sources);
  }

  markTagged(): void {
    this.queue.markTagged();
  }

  advance(): void {
    this.queue.advance();
  }

  clear(): void {
    this.queue.clear();
  }

  private cancelCurrent(): void {
    const current = this.queue.current;
    if (current) this.removeFile(current.id);
  }

  private removeFile(id: number): void {
    this.queue.remove(id);
    this.view.focusAfterRemoval();
  }

  private applySettings(settings: Settings): void {
    this.normalize.checked = settings.normalize;
    this.target.value = settings.targetId;
    this.trimSilence.checked = settings.trimSilence;
    this.target.disabled = !settings.normalize;
  }

  private onSettingsChanged(): void {
    this.target.disabled = !this.normalize.checked;
    saveSettings({ normalize: this.normalize.checked, targetId: targetById(this.target.value).id, trimSilence: this.trimSilence.checked });
    this.queue.setOptions(this.currentOptions());
  }

  private currentOptions(): JobOptions {
    const target: LoudnessTarget | null = this.normalize.checked ? targetById(this.target.value) : null;
    return { target, trimSilence: this.trimSilence.checked };
  }

  private render(): void {
    const entry = this.queue.current;
    const state = entry?.job.state ?? IDLE;
    const processing = state.kind === "processing";
    this.masthead.classList.toggle("is-processing", processing);
    this.bar.hidden = !processing;
    this.cancel.hidden = !processing;
    this.renderProgress(state);
    setText(this.status, statusText(state));
    setText(this.infoLine, entry?.job.info ? describeAudioInfo(entry.job.info) : "");
    this.renderFailure(state);
    this.renderResult(entry, state);
    this.view.update(this.queue.entries, entry?.id ?? null);
    this.onChange();
  }

  private renderProgress(state: JobState): void {
    const fraction = state.kind === "processing" ? (state.progress?.fraction ?? 0) : 0;
    this.bar.style.setProperty("--progress", String(fraction));
    this.bar.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
  }

  private renderFailure(state: JobState): void {
    if (state.kind === "failed") {
      this.error.textContent = state.message;
      this.showingFailure = true;
    } else if (this.showingFailure) {
      this.error.textContent = "";
      this.showingFailure = false;
    }
  }

  private renderResult(entry: QueueEntry | null, state: JobState): void {
    const audio = state.kind === "ready" ? state.audio : null;
    setText(this.resultLine, audio ? summarize(audio) : "");
    if (audio === this.previewed) return;
    this.previewed = audio;
    if (audio && entry) this.preview.show(audio.blob ?? entry.source.file);
    else this.preview.hide();
  }
}

function statusText(state: JobState): string {
  if (state.kind === "processing") return state.progress ? phaseLabel(state.progress.phase) : LOADING_MESSAGE;
  return state.kind === "ready" && state.audio.blob ? "The audio is ready." : "";
}

function summarize({ loudness, trim }: PreparedAudio): string {
  const parts = [loudness ? `Loudness: ${describeLoudness(loudness)}` : "", trim ? describeTrim(trim) : ""];
  return parts.filter((part) => part !== "").join(" ");
}

function phaseLabel(phase: ProcessingPhase): string {
  switch (phase) {
    case "detecting":
      return "Looking for silence…";
    case "measuring":
      return "Measuring loudness…";
    case "normalizing":
      return "Normalizing and encoding…";
    case "encoding":
      return "Encoding MP3…";
  }
}
