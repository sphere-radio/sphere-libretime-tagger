export interface AudioSource {
  file: File;
  handle: FileSystemFileHandle | null;
}

export const SUPPORTED_EXTENSIONS = [".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".aac", ".ogg", ".oga", ".opus"];

const AUDIO_PICKER_OPTIONS = {
  types: [{ description: "Audio", accept: { "audio/*": SUPPORTED_EXTENSIONS } }],
  excludeAcceptAllOption: true,
};

export function isMp3(file: File): boolean {
  return file.name.toLowerCase().endsWith(".mp3");
}

export function isSupportedAudio(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function sourceFromFile(file: File): AudioSource {
  return { file, handle: null };
}

export async function pickAudioWithHandles(): Promise<AudioSource[]> {
  if (!window.showOpenFilePicker) return [];
  try {
    const handles = await window.showOpenFilePicker({ ...AUDIO_PICKER_OPTIONS, multiple: true });
    return await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return [];
    throw error;
  }
}

export async function sourcesFromDrop(items: DataTransferItemList): Promise<AudioSource[]> {
  // Items are only valid while the drop event runs, so everything is requested before the first await.
  const requests = Array.from(items)
    .filter((item) => item.kind === "file")
    .map((item) => ({ file: item.getAsFile(), handle: item.getAsFileSystemHandle?.() }));
  const sources = await Promise.all(requests.map(toSource));
  return sources.filter((source): source is AudioSource => source !== null);
}

async function toSource({ file, handle }: { file: File | null; handle: Promise<FileSystemHandle | null> | undefined }): Promise<AudioSource | null> {
  const resolved = await handle;
  if (resolved?.kind === "file") {
    const fileHandle = resolved as FileSystemFileHandle;
    return { file: await fileHandle.getFile(), handle: fileHandle };
  }
  return file ? sourceFromFile(file) : null;
}

export async function readBytes(source: AudioSource): Promise<Uint8Array> {
  const file = source.handle ? await source.handle.getFile() : source.file;
  return new Uint8Array(await file.arrayBuffer());
}
