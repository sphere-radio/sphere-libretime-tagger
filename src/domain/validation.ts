import { collapseWhitespace } from "./text";
import type { EpisodeDraft } from "./types";

export interface RawForm {
  hasFile: boolean;
  hasCover: boolean;
  show: string;
  episode: string;
  episodeTitle: string;
  contributors: string[];
  broadcastDate: string;
}

export type FieldName = "file" | "show" | "episode" | "date" | "cover";
export type FieldErrors = Partial<Record<FieldName, string>>;
export type ValidationResult =
  | { ok: true; draft: EpisodeDraft }
  | { ok: false; errors: FieldErrors };

const EPISODE_PATTERN = /^\d{1,6}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function validateForm(raw: RawForm): ValidationResult {
  const errors = collectErrors(raw);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    draft: {
      show: raw.show,
      episode: raw.episode.trim() === "" ? null : Number(raw.episode.trim()),
      episodeTitle: collapseWhitespace(raw.episodeTitle),
      contributors: raw.contributors,
      broadcastDate: raw.broadcastDate,
    },
  };
}

export function isRealIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function collectErrors(raw: RawForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!raw.hasFile) errors.file = "Choose an audio file.";
  if (!raw.hasCover) errors.cover = "Add a cover image.";
  if (raw.show === "") errors.show = "Choose a show.";
  const episode = raw.episode.trim();
  if (episode !== "" && !EPISODE_PATTERN.test(episode)) errors.episode = "Use digits only, for example 12.";
  if (!isRealIsoDate(raw.broadcastDate)) errors.date = "Pick the broadcast date.";
  return errors;
}
