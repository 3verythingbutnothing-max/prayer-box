import { nivReadingUrl } from "./localization.ts";

export type WidgetMode = "small" | "medium" | "large";
export type WidgetPreferences = { mode: WidgetMode; time: string };
export const defaultWidgetPreferences: WidgetPreferences = {
  mode: "medium",
  time: "08:00",
};

/** References and original editorial prompts; no unlicensed NIV text is bundled. */
export const prayerReadings = [
  {
    reference: "Colossians 4:2",
    theme: "Prayer, watchfulness and gratitude",
    encouragement:
      "Pause for a moment. Bring your gratitude and what is on your heart to God.",
  },
  {
    reference: "Philippians 4:6–7",
    theme: "Bring your concerns to God",
    encouragement:
      "You can bring the things that feel heavy to the Father, one honest prayer at a time.",
  },
  {
    reference: "1 Thessalonians 5:16–18",
    theme: "Prayer through ordinary days",
    encouragement:
      "There is room for prayer in the ordinary moments of your day.",
  },
  {
    reference: "Matthew 6:6",
    theme: "A quiet moment with the Father",
    encouragement:
      "Find a little quiet, and make space to speak honestly with the Father.",
  },
  {
    reference: "Ephesians 6:18",
    theme: "Pray in the Spirit for one another",
    encouragement:
      "Remember someone who needs care today. Pray through Jesus, with the help of the Holy Spirit.",
  },
] as const;

export function prayerReadingForDate(date: Date) {
  const valid = Number.isFinite(date.getTime());
  const day = valid
    ? Math.floor(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
          86_400_000,
      )
    : 0;
  const index =
    ((day % prayerReadings.length) + prayerReadings.length) %
    prayerReadings.length;
  const reading = prayerReadings[index];
  return { ...reading, url: nivReadingUrl(reading.reference) };
}

export function validReminderTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function formatReminderTime(value: string): string {
  const safe = validReminderTime(value) ? value : defaultWidgetPreferences.time;
  const [hour, minute] = safe.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
