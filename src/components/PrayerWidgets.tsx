import { useRef, useState } from "react";
import { Icon, PrayerBoxMark } from "../ui";
import { useActionFeedback } from "../action-feedback";
import { biblePreference, uiText } from "../localization";
import type { UiLanguage } from "../localization";
import {
  formatReminderTime,
  prayerReadingForDate,
  validReminderTime,
} from "../widgets";
import type { WidgetMode, WidgetPreferences } from "../widgets";
import "../widgets.css";

const modes: { id: WidgetMode; label: string; description: string }[] = [
  { id: "small", label: "Small", description: "A little daily nudge" },
  { id: "medium", label: "Medium", description: "Reading and reminder" },
  { id: "large", label: "Large", description: "Room for a quiet moment" },
];

export default function PrayerWidgets({
  preferences,
  onSave,
  language,
  onNavigate,
}: {
  preferences: WidgetPreferences;
  onSave: (preferences: WidgetPreferences) => void;
  language: UiLanguage;
  onNavigate: (route: string) => void;
}) {
  const feedback = useActionFeedback();
  const [mode, setMode] = useState(preferences.mode);
  const [time, setTime] = useState(preferences.time);
  const [error, setError] = useState("");
  const timeField = useRef<HTMLInputElement>(null);
  const previewCard = useRef<HTMLElement>(null);
  const reading = prayerReadingForDate(new Date());
  return (
    <section
      id="prayer-widgets"
      className="prayer-widgets-section"
      aria-labelledby="prayer-widgets-title"
      tabIndex={-1}
    >
      <header className="mobile-app-section-heading">
        <p className="eyebrow">A quiet invitation</p>
        <h2 id="prayer-widgets-title">{uiText("widgetTitle", language)}</h2>
        <p>{uiText("widgetIntro", language)}</p>
      </header>
      <p className="widget-native-notice">
        <Icon name="info" size={19} />
        <span>{uiText("nativeNotice", language)}</span>
      </p>
      <div className="prayer-widgets-layout">
        <section
          className="panel widget-size-panel"
          aria-label="Widget size choices"
        >
          <fieldset className="widget-mode-fieldset">
            <legend>Widget size</legend>
            <div className="widget-mode-options">
              {modes.map((item) => (
                <label
                  key={item.id}
                  className={item.id === mode ? "is-selected" : ""}
                >
                  <input
                    type="radio"
                    name="prayer-widget-mode"
                    value={item.id}
                    checked={item.id === mode}
                    onChange={() => setMode(item.id)}
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <div className="widget-preview-stage">
          <p className="eyebrow">{uiText("previewLabel", language)}</p>
          <article
            ref={previewCard}
            tabIndex={-1}
            className={`prayer-widget prayer-widget-${mode}`}
            aria-label={`${mode} prayer widget design preview`}
          >
            <div className="widget-brand">
              <PrayerBoxMark size={mode === "small" ? 25 : 32} />
              <span>Prayer Box</span>
              <span className="widget-little-star" aria-hidden="true">
                ✦
              </span>
            </div>
            <div className="widget-preview-copy">
              <p className="widget-today">Today · {formatReminderTime(time)}</p>
              <h3>{uiText("prayToday", language)}</h3>
              <p className="widget-reading-theme">{reading.theme}</p>
              <a
                className="widget-reading-link"
                href={reading.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {reading.reference} · NIV <span aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
            {mode === "large" && (
              <div className="widget-encouragement">
                <p>{reading.encouragement}</p>
                <small>
                  Prayer Box encouragement · not a Scripture quotation
                </small>
              </div>
            )}
            {mode !== "small" && (
              <button
                className="widget-open-prayers"
                onClick={() => onNavigate("prayers")}
              >
                Open My Prayers <Icon name="arrow" size={16} />
              </button>
            )}
          </article>
          <p className="widget-private-note">
            <Icon name="lock" size={16} />
            <span>
              Only a general reminder and reading reference. No private request,
              name, photograph or prayer count appears.
            </span>
          </p>
        </div>
        <form
          className="panel widget-controls"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            feedback.prepare();
            if (!validReminderTime(time)) {
              setError("Choose a valid time for the reminder preview.");
              timeField.current?.focus();
              feedback.respond({
                tone: "error",
                title: "Choose a reminder time.",
                message: "The demo choices have not been saved.",
              });
              return;
            }
            setError("");
            onSave({ mode, time });
            previewCard.current?.scrollIntoView({
              block: "start",
              behavior: "instant",
            });
            previewCard.current?.focus({ preventScroll: true });
            feedback.respond({
              tone: "success",
              title: uiText("widgetSaved", language),
              message: uiText("widgetSavedDetail", language),
            });
          }}
        >
          <label className="field">
            Reminder time preview
            <input
              ref={timeField}
              type="time"
              value={time}
              required
              aria-invalid={!!error}
              aria-describedby="widget-time-help"
              onChange={(event) => {
                setTime(event.target.value);
                setError("");
              }}
            />
          </label>
          <p className="widget-control-help" id="widget-time-help">
            A design choice for this session. It does not schedule
            notifications.
          </p>
          {error && (
            <p role="alert" className="widget-error">
              {error}
            </p>
          )}
          <div className="widget-edition">
            <Icon name="globe" size={18} />
            <p>
              <strong>English · {biblePreference.id}</strong>
              <span>
                Bible Gateway reading links. NIV text permission has not been
                obtained.
              </span>
            </p>
          </div>
          <button type="submit" className="button">
            {uiText("widgetSave", language)} <Icon name="check" size={17} />
          </button>
        </form>
      </div>
    </section>
  );
}
