import { isSupportedAudio, pickAudioWithHandles, sourceFromFile, sourcesFromDrop, type AudioSource } from "../io/audioSource";
import { byId } from "./dom";

const EMPTY_PROMPT = "Drop audio files here, or choose files";
const ADD_MORE_PROMPT = "Drop more audio files here, or choose files";
const UNSUPPORTED_MESSAGE = "Use MP3, WAV, FLAC, AIFF, M4A, AAC, OGG or Opus files.";

export class AudioPicker {
  private readonly button = byId<HTMLButtonElement>("fileDrop");
  private readonly label = byId<HTMLElement>("fileDropText");
  private readonly input = byId<HTMLInputElement>("fileInput");
  private readonly error = byId<HTMLElement>("error-file");

  constructor(private readonly onFiles: (sources: AudioSource[]) => void) {
    this.button.addEventListener("click", () => void this.choose());
    this.input.addEventListener("change", () => this.acceptInputFiles());
    this.button.addEventListener("dragover", (event) => {
      event.preventDefault();
      this.button.classList.add("is-over");
    });
    this.button.addEventListener("dragleave", () => this.button.classList.remove("is-over"));
    this.button.addEventListener("drop", (event) => void this.acceptDrop(event));
  }

  showsMoreFiles(hasFiles: boolean): void {
    this.label.textContent = hasFiles ? ADD_MORE_PROMPT : EMPTY_PROMPT;
  }

  focus(): void {
    this.button.focus();
  }

  private async choose(): Promise<void> {
    const picked = await pickAudioWithHandles();
    if (picked.length > 0) this.accept(picked);
    else if (!window.showOpenFilePicker) this.input.click();
  }

  private acceptInputFiles(): void {
    const files = Array.from(this.input.files ?? []);
    this.input.value = "";
    if (files.length > 0) this.accept(files.map(sourceFromFile));
  }

  private async acceptDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.button.classList.remove("is-over");
    const sources = event.dataTransfer ? await sourcesFromDrop(event.dataTransfer.items) : [];
    if (sources.length > 0) this.accept(sources);
  }

  private accept(sources: AudioSource[]): void {
    const supported = sources.filter((source) => isSupportedAudio(source.file));
    const skipped = sources.length - supported.length;
    this.error.textContent = skipped === 0 ? "" : skippedMessage(skipped);
    if (supported.length > 0) this.onFiles(supported);
  }
}

function skippedMessage(skipped: number): string {
  return skipped === 1 ? UNSUPPORTED_MESSAGE : `${skipped} files were skipped. ${UNSUPPORTED_MESSAGE}`;
}
