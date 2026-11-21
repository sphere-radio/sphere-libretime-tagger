import {
  MAX_ZOOM,
  MIN_ZOOM,
  cropSquare,
  initialCrop,
  outputSize,
  panCrop,
  zoomCrop,
  type CropState,
} from "../cover/cropMath";
import { renderCover } from "../cover/renderCover";
import { byId } from "./dom";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const KEYBOARD_PAN_FRACTION = 0.05;
const KEYBOARD_ZOOM_STEP = 0.1;
const SHADE = "rgba(8, 14, 26, 0.62)";
const FRAME = "#ffffff";

type CoverSource =
  | { kind: "none" }
  | { kind: "primary"; bitmap: ImageBitmap; blob: Blob }
  | { kind: "image"; bitmap: ImageBitmap; crop: CropState };

export class CoverEditor {
  private source: CoverSource = { kind: "none" };
  private readonly drop = byId<HTMLButtonElement>("coverDrop");
  private readonly canvas = byId<HTMLCanvasElement>("coverCanvas");
  private readonly preview = byId<HTMLCanvasElement>("coverPreview");
  private readonly tools = byId<HTMLElement>("coverTools");
  private readonly zoomRow = byId<HTMLElement>("zoomRow");
  private readonly zoom = byId<HTMLInputElement>("zoom");
  private readonly status = byId<HTMLElement>("coverStatus");
  private readonly error = byId<HTMLElement>("error-cover");
  private readonly input = byId<HTMLInputElement>("coverInput");
  private dragFrom: { x: number; y: number } | null = null;

  constructor(private readonly onChange: () => void) {
    this.wireFileChoosing();
    this.wireDragging();
    this.wireKeyboard();
    this.zoom.addEventListener("input", () => this.setZoom(Number(this.zoom.value)));
    byId("coverRemove").addEventListener("click", () => this.clear());
  }

  hasCover(): boolean {
    return this.source.kind !== "none";
  }

  isNewImage(): boolean {
    return this.source.kind === "image";
  }

  async loadFile(file: File): Promise<void> {
    this.error.textContent = "";
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.error.textContent = "Use a PNG, JPG or WebP image.";
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      this.replaceSource({ kind: "image", bitmap, crop: initialCrop(bitmap) });
    } catch {
      this.error.textContent = "This image could not be read. Try another file.";
    }
  }

  async showPrimary(blob: Blob): Promise<void> {
    this.replaceSource({ kind: "primary", bitmap: await createImageBitmap(blob), blob });
  }

  clear(): void {
    this.replaceSource({ kind: "none" });
  }

  async toJpeg(): Promise<Blob | null> {
    switch (this.source.kind) {
      case "none":
        return null;
      case "primary":
        return this.source.blob;
      case "image":
        return renderCover(this.source.bitmap, cropSquare(this.source.bitmap, this.source.crop));
    }
  }

  private replaceSource(source: CoverSource): void {
    if (this.source.kind !== "none") this.source.bitmap.close();
    this.source = source;
    this.error.textContent = "";
    this.refresh();
    this.onChange();
  }

  private refresh(): void {
    const hasCover = this.source.kind !== "none";
    this.drop.hidden = hasCover;
    this.canvas.hidden = !hasCover;
    this.tools.hidden = !hasCover;
    this.zoomRow.hidden = this.source.kind !== "image";
    this.canvas.tabIndex = this.source.kind === "image" ? 0 : -1;
    if (this.source.kind === "image") this.zoom.value = String(this.source.crop.zoom);
    this.draw();
  }

  private draw(): void {
    if (this.source.kind === "none") return;
    const { bitmap } = this.source;
    const crop = this.source.kind === "image" ? this.source.crop : initialCrop(bitmap);
    this.drawStage(bitmap, crop);
    this.drawPreview(bitmap, crop);
    this.describeCrop(bitmap, crop);
  }

  private drawStage(bitmap: ImageBitmap, crop: CropState): void {
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const layout = this.stageLayout(bitmap);
    const square = cropSquare(bitmap, crop);
    const frame = { x: layout.x + square.x * layout.scale, y: layout.y + square.y * layout.scale, size: square.size * layout.scale };

    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.drawImage(bitmap, layout.x, layout.y, layout.width, layout.height);
    context.fillStyle = SHADE;
    context.beginPath();
    context.rect(layout.x, layout.y, layout.width, layout.height);
    context.rect(frame.x, frame.y, frame.size, frame.size);
    context.fill("evenodd");
    context.strokeStyle = FRAME;
    context.lineWidth = 2;
    context.strokeRect(frame.x, frame.y, frame.size, frame.size);
  }

  private drawPreview(bitmap: ImageBitmap, crop: CropState): void {
    const context = this.preview.getContext("2d");
    if (!context) return;
    const square = cropSquare(bitmap, crop);
    context.drawImage(bitmap, square.x, square.y, square.size, square.size, 0, 0, this.preview.width, this.preview.height);
  }

  private describeCrop(bitmap: ImageBitmap, crop: CropState): void {
    const size = outputSize(cropSquare(bitmap, crop));
    this.status.textContent =
      this.source.kind === "primary"
        ? "Primary cover of this show."
        : `Saved as ${size} × ${size} px JPEG, cut from ${bitmap.width} × ${bitmap.height} px.`;
  }

  private stageLayout(bitmap: ImageBitmap) {
    const scale = Math.min(this.canvas.width / bitmap.width, this.canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    return { scale, width, height, x: (this.canvas.width - width) / 2, y: (this.canvas.height - height) / 2 };
  }

  private updateCrop(change: (bitmap: ImageBitmap, crop: CropState) => CropState): void {
    if (this.source.kind !== "image") return;
    this.source.crop = change(this.source.bitmap, this.source.crop);
    this.zoom.value = String(this.source.crop.zoom);
    this.draw();
  }

  private setZoom(zoom: number): void {
    this.updateCrop((bitmap, crop) => zoomCrop(bitmap, crop, zoom));
  }

  private wireFileChoosing(): void {
    const choose = () => this.input.click();
    this.drop.addEventListener("click", choose);
    byId("coverReplace").addEventListener("click", choose);
    this.input.addEventListener("change", () => {
      const file = this.input.files?.[0];
      this.input.value = "";
      if (file) void this.loadFile(file);
    });
    for (const target of [this.drop, this.canvas] as HTMLElement[]) {
      target.addEventListener("dragover", (event) => event.preventDefault());
      target.addEventListener("drop", (event) => {
        event.preventDefault();
        const file = event.dataTransfer?.files[0];
        if (file) void this.loadFile(file);
      });
    }
  }

  private wireDragging(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragFrom = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragFrom || this.source.kind !== "image") return;
      const canvasPixelsPerScreenPixel = this.canvas.width / this.canvas.getBoundingClientRect().width;
      const { scale } = this.stageLayout(this.source.bitmap);
      const deltaX = ((event.clientX - this.dragFrom.x) * canvasPixelsPerScreenPixel) / scale;
      const deltaY = ((event.clientY - this.dragFrom.y) * canvasPixelsPerScreenPixel) / scale;
      this.dragFrom = { x: event.clientX, y: event.clientY };
      this.updateCrop((bitmap, crop) => panCrop(bitmap, crop, deltaX, deltaY));
    });
    const stopDragging = () => (this.dragFrom = null);
    this.canvas.addEventListener("pointerup", stopDragging);
    this.canvas.addEventListener("pointercancel", stopDragging);
  }

  private wireKeyboard(): void {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    this.canvas.addEventListener("keydown", (event) => {
      const direction = arrows[event.key];
      if (direction) {
        event.preventDefault();
        this.updateCrop((bitmap, crop) => {
          const step = cropSquare(bitmap, crop).size * KEYBOARD_PAN_FRACTION;
          return panCrop(bitmap, crop, direction[0] * step, direction[1] * step);
        });
      } else if (event.key === "+" || event.key === "=" || event.key === "-") {
        event.preventDefault();
        const change = event.key === "-" ? -KEYBOARD_ZOOM_STEP : KEYBOARD_ZOOM_STEP;
        this.updateCrop((bitmap, crop) => zoomCrop(bitmap, crop, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, crop.zoom + change))));
      }
    });
  }
}
