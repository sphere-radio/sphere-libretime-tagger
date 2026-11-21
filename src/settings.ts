import { targetById, type LoudnessTargetId } from "./domain/loudness";

export interface Settings {
  normalize: boolean;
  targetId: LoudnessTargetId;
  trimSilence: boolean;
}

const STORAGE_KEY = "sphere-tagger-settings";

export function loadSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return { normalize: stored?.normalize === true, targetId: targetById(stored?.targetId).id, trimSilence: stored?.trimSilence === true };
  } catch {
    return { normalize: false, targetId: targetById(undefined).id, trimSilence: false };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage is not an error: the choices simply last for this visit.
  }
}
