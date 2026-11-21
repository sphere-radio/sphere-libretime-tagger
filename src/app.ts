import { loadTagLib } from "./audio/tagLibLoader";
import { writeTags } from "./audio/tagWriter";
import { buildFilename, isEpisodeTitleShortenedInFilename } from "./domain/naming";
import { buildTags } from "./domain/tags";
import type { EpisodeDraft } from "./domain/types";
import { validateForm, type FieldErrors, type FieldName, type RawForm } from "./domain/validation";
import { readBytes, type Mp3Source } from "./io/mp3Source";
import { canReplaceOriginal, saveTaggedMp3, type SaveOutcome } from "./io/saveMp3";
import { ShowCatalog } from "./shows/catalog";
import { IndexedDbRepository } from "./shows/indexedDbRepository";
import { suggestedEpisode } from "./shows/profile";
import { MemoryRepository, type ProfileRepository } from "./shows/repository";
import { ContributorsInput } from "./ui/contributors";
import { CoverEditor } from "./ui/coverEditor";
import { byId, h, onEscapeBlurTooltip } from "./ui/dom";
import { Mp3Picker } from "./ui/mp3Picker";
import { ReviewDialog } from "./ui/reviewDialog";
import { ShowsDialog, type ShowsChange } from "./ui/showsDialog";

const READOUT_PLACEHOLDER = "Choose a show and a date to see it.";

export async function startApp(): Promise<void> {
  onEscapeBlurTooltip();
  const { catalog, storageNotice } = await openCatalog();
  if (storageNotice) byId("tagForm").before(h("p", { class: "notice", role: "status", textContent: storageNotice }));
  new TaggerApp(catalog);
}

async function openCatalog(): Promise<{ catalog: ShowCatalog; storageNotice: string }> {
  try {
    const catalog = new ShowCatalog(new IndexedDbRepository());
    await catalog.load();
    return { catalog, storageNotice: "" };
  } catch {
    const memory: ProfileRepository = new MemoryRepository();
    const catalog = new ShowCatalog(memory);
    await catalog.load();
    return { catalog, storageNotice: "This browser does not allow saving your shows. They are forgotten when you close the page." };
  }
}

class TaggerApp {
  private readonly form = byId<HTMLFormElement>("tagForm");
  private readonly show = byId<HTMLSelectElement>("show");
  private readonly episode = byId<HTMLInputElement>("episode");
  private readonly episodeHint = byId("hint-episode");
  private readonly episodeTitle = byId<HTMLInputElement>("episodeTitle");
  private readonly date = byId<HTMLInputElement>("date");
  private readonly primaryCover = byId<HTMLInputElement>("primaryCover");
  private readonly primaryCoverRow = byId("primaryCoverRow");
  private readonly readout = byId<HTMLOutputElement>("readout");

  private readonly picker = new Mp3Picker(() => this.updateReadout());
  private readonly contributors = new ContributorsInput(() => this.updateReadout());
  private readonly cover = new CoverEditor(() => this.onCoverChanged());
  private readonly reviewDialog = new ReviewDialog();
  private readonly showsDialog: ShowsDialog;

  constructor(private readonly catalog: ShowCatalog) {
    this.showsDialog = new ShowsDialog(catalog, (change) => this.onShowsChanged(change));
    this.renderShowOptions("");
    this.wireEvents();
    this.updateReadout();
  }

  private wireEvents(): void {
    this.show.addEventListener("change", () => this.applyShowDefaults());
    byId("newShow").addEventListener("click", () => this.showsDialog.open(true));
    byId("editShows").addEventListener("click", () => this.showsDialog.open(false));
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.review();
    });
    this.form.addEventListener("reset", (event) => {
      event.preventDefault();
      this.clearAll();
    });
    for (const control of [this.show, this.episode, this.episodeTitle, this.date]) {
      control.addEventListener("input", () => this.onFieldEdited(control));
    }
  }

  private onFieldEdited(control: HTMLElement): void {
    this.clearError(control);
    this.updateReadout();
  }

  private renderShowOptions(selected: string): void {
    const shows = this.catalog.all();
    const placeholder = h("option", { value: "", textContent: shows.length > 0 ? "Choose a show…" : "No shows yet. Use New show." });
    this.show.replaceChildren(placeholder, ...shows.map((show) => h("option", { value: show.name, textContent: show.name })));
    this.show.value = selected;
    if (this.show.selectedIndex === -1) this.show.selectedIndex = 0;
  }

  private onShowsChanged(change: ShowsChange): void {
    const previous = this.show.value;
    const target = change.select ?? (change.renamed?.from === previous ? change.renamed.to : previous);
    this.renderShowOptions(target);
    if (change.select || this.show.value !== target) this.applyShowDefaults();
    else this.applyEpisodeSuggestion();
  }

  private applyShowDefaults(): void {
    this.clearError(this.show);
    const profile = this.catalog.find(this.show.value);
    this.applyEpisodeSuggestion();
    this.contributors.set(profile?.primaryContributors ?? [], true);
    if (profile?.primaryCover) void this.cover.showPrimary(profile.primaryCover);
    else this.cover.clear();
    this.updateReadout();
  }

  private applyEpisodeSuggestion(): void {
    const profile = this.catalog.find(this.show.value);
    const suggestion = profile ? suggestedEpisode(profile) : null;
    this.episode.value = suggestion === null ? "" : String(suggestion);
    this.episodeHint.textContent = suggestion === null ? "" : `Suggested: the next one after episode ${suggestion - 1}.`;
    this.updateReadout();
  }

  private onCoverChanged(): void {
    this.clearError(byId("coverDrop"));
    this.syncPrimaryCoverOption();
    this.updateReadout();
  }

  private syncPrimaryCoverOption(): void {
    const offer = this.cover.isNewImage() && this.show.value !== "";
    this.primaryCoverRow.hidden = !offer;
    if (!offer) this.primaryCover.checked = false;
  }

  private readForm(contributors: string[]): RawForm {
    return {
      hasFile: this.picker.source !== null,
      hasCover: this.cover.hasCover(),
      show: this.show.value,
      episode: this.episode.value,
      episodeTitle: this.episodeTitle.value,
      contributors,
      broadcastDate: this.date.value,
    };
  }

  private updateReadout(): void {
    const result = validateForm({ ...this.readForm(this.contributors.previewValues()), hasFile: true, hasCover: true });
    this.readout.textContent = result.ok ? buildFilename(result.draft) : READOUT_PLACEHOLDER;
  }

  private async review(): Promise<void> {
    this.clearAllErrors();
    const result = validateForm(this.readForm(this.contributors.values()));
    if (!result.ok) return this.showErrors(result.errors);

    const source = this.picker.source;
    const cover = await this.prepareCover();
    if (!source || !cover) return;

    this.reviewDialog.open(
      {
        originalName: source.file.name,
        newName: buildFilename(result.draft),
        tags: buildTags(result.draft),
        nameWasShortened: isEpisodeTitleShortenedInFilename(result.draft),
        replacesOriginal: canReplaceOriginal(source),
      },
      () => this.save(source, result.draft, cover),
      () => this.resetForNextFile(),
    );
  }

  private async prepareCover(): Promise<Blob | undefined> {
    try {
      return (await this.cover.toJpeg()) ?? undefined;
    } catch (failure) {
      byId("error-cover").textContent = failure instanceof Error ? failure.message : "The cover could not be prepared.";
      return undefined;
    }
  }

  private async save(source: Mp3Source, draft: EpisodeDraft, cover: Blob): Promise<SaveOutcome> {
    const coverBytes = new Uint8Array(await cover.arrayBuffer());
    const tagged = await writeTags(await loadTagLib(), await readBytes(source), buildTags(draft), coverBytes);
    const outcome = await saveTaggedMp3(source, buildFilename(draft), tagged);
    await this.rememberShow(draft, cover);
    return outcome;
  }

  private async rememberShow(draft: EpisodeDraft, cover: Blob): Promise<void> {
    const profile = this.catalog.find(draft.show);
    if (!profile) return;
    try {
      await this.catalog.update({
        ...profile,
        lastEpisode: draft.episode ?? profile.lastEpisode,
        primaryContributors: this.contributors.primaryNames(),
        primaryCover: this.primaryCover.checked ? cover : profile.primaryCover,
      });
    } catch (failure) {
      console.error("The show settings could not be remembered.", failure);
    }
  }

  private resetForNextFile(): void {
    this.picker.clear();
    this.episodeTitle.value = "";
    this.date.value = "";
    this.clearAllErrors();
    this.applyShowDefaults();
    this.picker.focus();
  }

  private clearAll(): void {
    this.picker.clear();
    this.episodeTitle.value = "";
    this.date.value = "";
    this.renderShowOptions("");
    this.clearAllErrors();
    this.applyShowDefaults();
  }

  private errorFields(): Record<FieldName, HTMLElement> {
    return { file: byId("fileDrop"), show: this.show, episode: this.episode, date: this.date, cover: byId("coverDrop") };
  }

  private showErrors(errors: FieldErrors): void {
    const fields = this.errorFields();
    const names = (Object.keys(errors) as FieldName[]).sort((a, b) => order(a) - order(b));
    for (const name of names) {
      fields[name].setAttribute("aria-invalid", "true");
      byId(`error-${name}`).textContent = errors[name] ?? "";
    }
    const first = names[0];
    if (first) fields[first].focus();
  }

  private clearError(control: HTMLElement): void {
    control.removeAttribute("aria-invalid");
    const name = (Object.keys(this.errorFields()) as FieldName[]).find((key) => this.errorFields()[key] === control);
    if (name) byId(`error-${name}`).textContent = "";
  }

  private clearAllErrors(): void {
    for (const control of Object.values(this.errorFields())) this.clearError(control);
  }
}

function order(name: FieldName): number {
  return ["file", "show", "episode", "date", "cover"].indexOf(name);
}
