import type { TagLib } from "taglib-wasm";
import type { AudioInfo } from "../domain/audioDescription";

// Reading the file into the tagging engine costs about twice its size in memory.
const MAX_INFO_BYTES = 400 * 1024 ** 2;

export async function readMp3Info(taglib: TagLib, file: File): Promise<AudioInfo | null> {
  if (file.size > MAX_INFO_BYTES) return null;
  const audio = await taglib.open(new Uint8Array(await file.arrayBuffer()));
  try {
    const properties = audio.audioProperties();
    if (!properties) return null;
    return {
      codec: "MP3",
      durationSeconds: positiveOrNull(properties.duration),
      sampleRateHz: positiveOrNull(properties.sampleRate),
      channels: positiveOrNull(properties.channels),
      bitrateKbps: positiveOrNull(properties.bitrate),
    };
  } finally {
    audio.dispose();
  }
}

function positiveOrNull(value: number): number | null {
  return value > 0 ? value : null;
}
