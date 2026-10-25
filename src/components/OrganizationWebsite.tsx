import { useId, useState } from "react";
import { normalizeOrganizationWebsite } from "../organization";
import { Icon } from "../ui";
import { useActionFeedback } from "../action-feedback";
import "../organization-website.css";

export function OrganizationWebsiteLink({
  value,
  name = "Grace Church",
}: {
  value: string;
  name?: string;
}) {
  const result = normalizeOrganizationWebsite(value);
  if (!result.valid || !result.url) return null;
  const hostname = new URL(result.url).host;
  return (
    <a
      className="organization-website-link"
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Visit ${name}’s website at ${hostname} (opens in a new tab)`}
    >
      <Icon name="globe" size={16} />
      <span>
        Website <span className="organization-website-domain">{hostname}</span>
      </span>
      <Icon name="arrow" size={15} />
    </a>
  );
}

export function OrganizationWebsiteEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (website: string) => void;
}) {
  const feedback = useActionFeedback();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const helpId = useId();
  const errorId = useId();
  return (
    <section className="account-settings-section panel organization-website-settings">
      <div className="account-section-top">
        <h2>Organization website</h2>
        <Icon name="globe" />
      </div>
      <p>
        Give visitors a way to learn about your church, ministry or organization
        on its own website.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          feedback.prepare();
          const result = normalizeOrganizationWebsite(draft);
          if (!result.valid) {
            setError(result.error);
            feedback.respond({
              tone: "error",
              title: "Please check this website address.",
              message: result.error,
            });
            return;
          }
          setError("");
          onSave(result.url);
        }}
      >
        <label className="field">
          Website address <span className="account-optional">Optional</span>
          <input
            type="text"
            inputMode="url"
            value={draft}
            maxLength={2048}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="https://example.org"
            aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
            aria-invalid={!!error}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
          />
        </label>
        <p className="account-field-help" id={helpId}>
          This link appears on your organization’s public prayer box. Leave it
          blank to remove it. Use fictional addresses such as example.org in
          this demo.
        </p>
        {error && (
          <p className="organization-website-error" id={errorId} role="alert">
            {error}
          </p>
        )}
        <div className="organization-website-actions">
          <button className="button secondary compact" type="submit">
            Save website
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setDraft("https://example.org/");
              setError("");
            }}
          >
            Use example website
          </button>
        </div>
      </form>
      {value && (
        <div className="organization-website-preview">
          <span>Currently shown on your organization’s box</span>
          <OrganizationWebsiteLink value={value} />
        </div>
      )}
    </section>
  );
}
