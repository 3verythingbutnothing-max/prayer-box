import assert from "node:assert/strict";
import test from "node:test";
import {
  biblePreference,
  nivReadingUrl,
  resolveUiLanguage,
  uiText,
} from "./localization.ts";
import {
  formatReminderTime,
  prayerReadingForDate,
  prayerReadings,
  validReminderTime,
} from "./widgets.ts";

test("unsupported interface locales use English without changing the separate NIV preference", () => {
  for (const value of [
    "en",
    "en-GB",
    "es",
    "ar",
    undefined,
    null,
    { country: "US" },
  ]) {
    assert.equal(resolveUiLanguage(value), "en");
    assert.equal(
      uiText("prayToday", value),
      "Make a little space for prayer today.",
    );
  }
  assert.equal(biblePreference.id, "NIV");
  assert.equal(biblePreference.availability, "reading-links");
});

test("NIV reading links keep edition/reference separate and never inherit private page parameters", () => {
  for (const reading of prayerReadings) {
    const url = new URL(nivReadingUrl(reading.reference));
    assert.equal(url.origin, "https://www.biblegateway.com");
    assert.equal(url.pathname, "/passage/");
    assert.deepEqual([...url.searchParams.keys()], ["search", "version"]);
    assert.equal(url.searchParams.get("search"), reading.reference);
    assert.equal(url.searchParams.get("version"), "NIV");
    assert.equal(url.hash, "");
    assert.equal("text" in reading, false);
  }
});

test("a daily reading is stable through one local calendar day and advances across days", () => {
  const first = prayerReadingForDate(new Date(2026, 9, 25, 0, 1));
  assert.deepEqual(first, prayerReadingForDate(new Date(2026, 9, 25, 23, 59)));
  assert.notEqual(
    first.reference,
    prayerReadingForDate(new Date(2026, 9, 26, 0, 1)).reference,
  );
  assert.ok(prayerReadingForDate(new Date("invalid")).reference);
});

test("widget reminder times reject incomplete, invalid and injected values without scheduling", () => {
  for (const value of [
    "",
    "7:30",
    "24:00",
    "12:60",
    "08:00:00",
    "08:00<script>",
  ])
    assert.equal(validReminderTime(value), false);
  for (const value of ["00:00", "08:00", "12:00", "23:59"])
    assert.equal(validReminderTime(value), true);
  assert.equal(formatReminderTime("00:00"), "12:00 AM");
  assert.equal(formatReminderTime("12:00"), "12:00 PM");
  assert.equal(formatReminderTime("23:59"), "11:59 PM");
  assert.equal(formatReminderTime("invalid"), "8:00 AM");
});
