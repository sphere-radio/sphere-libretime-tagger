import type { Mp3Source } from "./mp3Source";

export type SaveOutcome = "replaced-original" | "downloaded-copy";

const OBJECT_URL_LIFETIME_MS = 10_000;

export function canReplaceOriginal(source: Mp3Source): boolean {
  return source.handle !== null && typeof source.handle.move === "function";
}

export async function saveTaggedMp3(source: Mp3Source, newName: string, bytes: Uint8Array): Promise<SaveOutcome> {
  if (source.handle && (await renameOriginal(source.handle, newName))) {
    await overwrite(source.handle, bytes);
    return "replaced-original";
  }
  download(bytes, newName);
  return "downloaded-copy";
}

async function renameOriginal(handle: FileSystemFileHandle, newName: string): Promise<boolean> {
  if (typeof handle.move !== "function" || !(await hasWriteAccess(handle))) return false;
  if (handle.name === newName) return true;
  try {
    await handle.move(newName);
    return true;
  } catch {
    return false;
  }
}

async function hasWriteAccess(handle: FileSystemFileHandle): Promise<boolean> {
  return (await handle.requestPermission?.({ mode: "readwrite" })) === "granted";
}

async function overwrite(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes as Uint8Array<ArrayBuffer>);
  } finally {
    await writable.close();
  }
}

function download(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/mpeg" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}
