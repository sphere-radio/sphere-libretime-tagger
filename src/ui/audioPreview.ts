import { byId } from "./dom";

export class AudioPreview {
  private readonly player = byId<HTMLAudioElement>("audioPreview");
  private url: string | null = null;

  show(audio: Blob): void {
    this.release();
    this.url = URL.createObjectURL(audio);
    this.player.src = this.url;
    this.player.hidden = false;
  }

  hide(): void {
    this.player.pause();
    this.release();
    this.player.removeAttribute("src");
    this.player.load();
    this.player.hidden = true;
  }

  private release(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
