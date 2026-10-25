import { useId, useState } from "react";
import { Icon } from "../ui";
import "../care-resources.css";

type Region = "" | "us" | "ca" | "uk" | "ie" | "other";
type CareResourcesProps = { compact?: boolean };

const sources = {
  us: "https://988lifeline.org/help-someone-else/",
  canada: "https://988.ca/",
  samaritans: "https://www.samaritans.org/how-we-can-help/contact-samaritan/",
  directory: "https://findahelpline.com/about",
};

function Source({ href, children }: { href: string; children: string }) {
  return (
    <a
      className="care-source"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <span className="care-sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default function CareResources({ compact = false }: CareResourcesProps) {
  const [region, setRegion] = useState<Region>("");
  const fieldId = useId();
  const selectedNorthAmerica = region === "us" || region === "ca";
  const selectedSamaritans = region === "uk" || region === "ie";

  return (
    <div
      className={`care-resources${compact ? " care-resources--compact" : ""}`}
    >
      <p className="care-immediate">
        <strong>
          If you have already hurt yourself, taken something that could harm
          you, or are at immediate risk, call local emergency services or go to
          the nearest emergency department now.
        </strong>{" "}
        Please don’t wait for a Prayer Box reply.
      </p>

      <div className="care-quick-help">
        <span className="care-soft-icon">
          <Icon name="heart" size={21} />
        </span>
        <div>
          <p>
            <strong>In the U.S. or Canada?</strong> Call or text{" "}
            <strong>988</strong> for crisis support, any time, day or night.
          </p>
          <p className="care-sources">
            Sources: <Source href={sources.us}>U.S. 988 Lifeline</Source> ·{" "}
            <Source href={sources.canada}>Canada 9-8-8</Source>
          </p>
        </div>
      </div>

      <p className="care-demo-note">
        Prayer Box is not an emergency service and is not continuously
        monitored.{" "}
        <strong>
          In this demo, no team or emergency service has been alerted.
        </strong>
      </p>

      <p className="care-link-note">
        The support links here are real, even in this fictional demo. A call,
        text, or outside service opens only when you choose its link. No prayer
        text is included.
      </p>

      <div className="care-region-field">
        <label htmlFor={fieldId}>Support for your country or region</label>
        <select
          id={fieldId}
          value={region}
          onChange={(event) => setRegion(event.target.value as Region)}
          aria-describedby={`${fieldId}-help`}
        >
          <option value="">Choose a country or region</option>
          <option value="us">United States</option>
          <option value="ca">Canada</option>
          <option value="uk">United Kingdom</option>
          <option value="ie">Ireland</option>
          <option value="other">Another country or region</option>
        </select>
        <p id={`${fieldId}-help`} className="care-field-help">
          Choose for yourself. We do not look up your location.
        </p>
      </div>

      <div className="care-local-support" aria-live="polite" aria-atomic="true">
        {selectedNorthAmerica && (
          <section aria-labelledby={`${fieldId}-local-title`}>
            <h3 id={`${fieldId}-local-title`}>
              {region === "us"
                ? "United States · 988 Lifeline"
                : "Canada · 9-8-8 Suicide Crisis Helpline"}
            </h3>
            <p>
              Call or text <strong>988</strong>, 24 hours a day. You can reach
              out when you are struggling or worried about someone else.
            </p>
            <div className="care-actions">
              <a className="care-action care-action-primary" href="tel:988">
                Call 988
              </a>
              <a className="care-action" href="sms:988">
                Text 988
              </a>
              {region === "us" && (
                <a
                  className="care-action"
                  href="https://chat.988lifeline.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chat with 988
                  <span className="care-sr-only"> (opens in a new tab)</span>
                  <Icon name="arrow" size={15} />
                </a>
              )}
            </div>
            <p className="care-sources">
              Source:{" "}
              <Source href={region === "us" ? sources.us : sources.canada}>
                {region === "us"
                  ? "988 Lifeline service information"
                  : "Canada 9-8-8 service information"}
              </Source>
            </p>
          </section>
        )}

        {selectedSamaritans && (
          <section aria-labelledby={`${fieldId}-local-title`}>
            <h3 id={`${fieldId}-local-title`}>
              {region === "uk" ? "United Kingdom" : "Ireland"} · Samaritans
            </h3>
            <p>
              Call <strong>116 123</strong> free, any time, day or night, to
              speak with someone who will listen.
            </p>
            <div className="care-actions">
              <a className="care-action care-action-primary" href="tel:116123">
                Call 116 123
              </a>
            </div>
            <p className="care-service-note">
              Online chat is not available to everyone. Check the service’s
              current options; for urgent support, use the phone line.
            </p>
            <p className="care-sources">
              Source:{" "}
              <Source href={sources.samaritans}>
                Samaritans contact options
              </Source>
            </p>
          </section>
        )}

        {!selectedNorthAmerica && !selectedSamaritans && (
          <section aria-labelledby={`${fieldId}-local-title`}>
            <h3 id={`${fieldId}-local-title`}>
              {region === "other"
                ? "Find support in your country"
                : "Support around the world"}
            </h3>
            <p>
              Find A Helpline lists support services by country. Choose your
              country there to see available phone, text, or chat options.
            </p>
            <div className="care-actions">
              <a
                className="care-action care-action-primary"
                href="https://findahelpline.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="globe" size={18} />
                Find a local helpline
                <span className="care-sr-only"> (opens in a new tab)</span>
                <Icon name="arrow" size={15} />
              </a>
            </div>
            <p className="care-sources">
              Source:{" "}
              <Source href={sources.directory}>
                About Find A Helpline’s verified directory
              </Source>
            </p>
          </section>
        )}
      </div>

      <p className="care-human-support">
        If you can, ask a trusted person to stay with you now. Reach out to a
        clinician, counselor, or crisis service. A trusted pastor can also offer
        care alongside professional help.
      </p>

      <div className="care-encouragement">
        <p className="care-encouragement-label">A little encouragement</p>
        <p>
          You are made in God’s image, and your life matters. God sees and hears
          you; Jesus Christ, God the Son, laid down His life for you. You can
          turn to Him and reach out for help—you do not have to face this alone.
        </p>
      </div>
    </div>
  );
}
