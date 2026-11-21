export interface Mp3Source {
  file: File;
  handle: FileSystemFileHandle | null;
}

const MP3_PICKER_OPTIONS = {
  types: [{ description: "MP3 audio", accept: { "audio/mpeg": [".mp3"] } }],
  excludeAcceptAllOption: true,
};

export function isMp3(file: File): boolean {
  return file.name.toLowerCase().endsWith(".mp3");
}

export function sourceFromFile(file: File): Mp3Source {
  return { file, handle: null };
}

export async function pickMp3WithHandle(): Promise<Mp3Source | null> {
  if (!window.showOpenFilePicker) return null;
  try {
    const [handle] = await window.showOpenFilePicker(MP3_PICKER_OPTIONS);
    return handle ? { file: await handle.getFile(), handle } : null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

export async function sourceFromDrop(item: DataTransferItem): Promise<Mp3Source | null> {
  const handle = await item.getAsFileSystemHandle?.();
  if (handle?.kind === "file") {
    const fileHandle = handle as FileSystemFileHandle;
    return { file: await fileHandle.getFile(), handle: fileHandle };
  }
  const file = item.getAsFile();
  return file ? sourceFromFile(file) : null;
}

export async function readBytes(source: Mp3Source): Promise<Uint8Array> {
  const file = source.handle ? await source.handle.getFile() : source.file;
  return new Uint8Array(await file.arrayBuffer());
}
