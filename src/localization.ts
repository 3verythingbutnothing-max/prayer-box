/** English-only interface catalog. UI language and Scripture edition are separate. */
export const supportedLanguages = [{ code: "en", label: "English" }] as const;
export type UiLanguage = (typeof supportedLanguages)[number]["code"];
export const biblePreference = {
  id: "NIV",
  name: "New International Version",
  language: "en",
  availability: "reading-links",
  permissionsUrl: "https://www.biblica.com/permissions/",
} as const;

export function resolveUiLanguage(_requested: unknown): UiLanguage {
  // Unsupported values fall back to the one shipped catalog. Never infer a
  // language from country, identity, prayer content or a third-party service.
  return "en";
}

const en = {
  languageLabel: "Interface language",
  languageHelp:
    "English is available for now. This does not translate anyone’s prayer request.",
  editionLabel: "Bible edition",
  editionHelp:
    "NIV is selected. Read on Bible Gateway; permission is required before NIV quotations can appear here.",
  widgetTitle: "A little reminder to pray.",
  widgetIntro:
    "A quiet invitation on your Home Screen, with a Scripture reading about prayer. Choose a design to preview.",
  prayToday: "Make a little space for prayer today.",
  previewLabel: "Widget design preview",
  widgetSave: "Save demo widget choices",
  widgetSaved: "Your widget preview is ready.",
  widgetSavedDetail:
    "Choices saved for this demo session. No Home Screen widget was added and no alert was scheduled.",
  nativeNotice:
    "These are interactive design previews. Adding a real Home Screen widget requires the native iPhone or Android app; the web app cannot add one.",
} as const;
export function uiText(key: keyof typeof en, language: unknown = "en"): string {
  resolveUiLanguage(language);
  return en[key];
}

/** User-initiated reading link only. No Scripture fetch or service is connected. */
export function nivReadingUrl(reference: string): string {
  const url = new URL("https://www.biblegateway.com/passage/");
  url.searchParams.set("search", reference);
  url.searchParams.set("version", biblePreference.id);
  return url.href;
}
