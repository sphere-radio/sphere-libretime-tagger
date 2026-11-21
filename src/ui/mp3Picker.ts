import { isMp3, pickMp3WithHandle, sourceFromDrop, sourceFromFile, type Mp3Source } from "../io/mp3Source";
import { byId } from "./dom";

const EMPTY_PROMPT = "Drop an MP3 here, or choose a file";

export class Mp3Picker {
  source: Mp3Source | null = null;
  private readonly button = byId<HTMLButtonElement>("fileDrop");
  private readonly label = byId<HTMLElement>("fileDropText");
  private readonly input = byId<HTMLInputElement>("fileInput");
  private readonly error = byId<HTMLElement>("error-file");

  constructor(private readonly onChange: () => void) {
    this.button.addEventListener("click", () => void this.choose());
    this.input.addEventListener("change", () => this.acceptInputFile());
    this.button.addEventListener("dragover", (event) => {
      event.preventDefault();
      this.button.classList.add("is-over");
    });
    this.button.addEventListener("dragleave", () => this.button.classList.remove("is-over"));
    this.button.addEventListener("drop", (event) => void this.acceptDrop(event));
  }

  clear(): void {
    this.set(null);
  }

  focus(): void {
    this.button.focus();
  }

  private async choose(): Promise<void> {
    const picked = await pickMp3WithHandle();
    if (picked) this.accept(picked);
    else if (!window.showOpenFilePicker) this.input.click();
  }

  private acceptInputFile(): void {
    const file = this.input.files?.[0];
    this.input.value = "";
    if (file) this.accept(sourceFromFile(file));
  }

  private async acceptDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.button.classList.remove("is-over");
    const item = event.dataTransfer?.items[0];
    const source = item ? await sourceFromDrop(item) : null;
    if (source) this.accept(source);
  }

  private accept(source: Mp3Source): void {
    if (!isMp3(source.file)) {
      this.error.textContent = "Only .mp3 files can be tagged.";
      return;
    }
    this.set(source);
  }

  private set(source: Mp3Source | null): void {
    this.source = source;
    this.error.textContent = "";
    this.label.textContent = source ? source.file.name : EMPTY_PROMPT;
    this.button.classList.toggle("has-file", source !== null);
    this.onChange();
  }
}
