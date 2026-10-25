import type { MouseEvent, ReactNode } from "react";
import { Icon } from "../ui";
import "../get-help.css";

export type GetHelpPageProps = {
  onSupport: () => void;
  onNavigate?: (route: string) => void;
};

const links = {
  nimh: "https://www.nimh.nih.gov/health/find-help",
  treatment: "https://findtreatment.gov/",
  pay: "https://www.samhsa.gov/find-support/how-to-pay-for-treatment",
  lowCost:
    "https://www.samhsa.gov/find-support/how-to-pay-for-treatment/free-or-low-cost-treatment",
  nhs: "https://www.nhs.uk/mental-health/social-care-and-your-rights/how-to-access-mental-health-services/",
  talkingTherapies:
    "https://www.nhs.uk/nhs-services/mental-health-services/find-nhs-talking-therapies-for-anxiety-and-depression/",
  worldwide: "https://findahelpline.com/",
  directorySource: "https://findahelpline.com/about",
};

function HelpLink({
  href,
  children,
  action = false,
}: {
  href: string;
  children: ReactNode;
  action?: boolean;
}) {
  return (
    <a
      href={href}
      className={action ? "get-help-outside-action" : "get-help-source"}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <span className="get-help-sr-only">
        {" "}
        (external site, opens in a new tab)
      </span>
      <Icon name="arrow" size={action ? 16 : 13} />
    </a>
  );
}

export default function GetHelpPage({
  onSupport,
  onNavigate,
}: GetHelpPageProps) {
  function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    const section = document.getElementById(id);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <div className="get-help-page">
      <header className="get-help-header">
        <span className="get-help-header-icon">
          <Icon name="heart" size={25} />
        </span>
        <div>
          <p className="eyebrow">A little support for the next step</p>
          <h1 className="page-title">Get help. You matter here.</h1>
          <p className="page-intro">
            A place to find mental health support, a path toward therapy, or
            someone to speak with when life feels too heavy.
          </p>
        </div>
      </header>

      <section className="get-help-now" aria-labelledby="get-help-now-title">
        <div className="get-help-now-heading">
          <span className="get-help-small-icon">
            <Icon name="people" size={22} />
          </span>
          <h2 id="get-help-now-title">If you need help right now</h2>
        </div>
        <p className="get-help-emergency">
          <strong>
            If you have already hurt yourself, taken something that could harm
            you, or are at immediate risk, call local emergency services or go
            to the nearest emergency department now.
          </strong>{" "}
          Please don’t wait for a Prayer Box reply.
        </p>
        <p className="get-help-crisis-line">
          <strong>United States or Canada:</strong> call or text{" "}
          <strong>988</strong> for crisis support, day or night. For other
          countries, choose the support options below.
        </p>
        <div className="get-help-immediate-actions">
          <button
            type="button"
            className="get-help-primary-action"
            onClick={onSupport}
          >
            Crisis support by country <Icon name="arrow" size={17} />
          </button>
          <HelpLink href={links.worldwide} action>
            Worldwide helpline directory
          </HelpLink>
        </div>
        <p className="get-help-service-note">
          Prayer Box is not an emergency service and is not continuously
          monitored.{" "}
          <strong>
            In this demo, no team or emergency service has been alerted.
          </strong>
        </p>
        <p className="get-help-sources">
          Sources:{" "}
          <HelpLink href="https://988lifeline.org/help-someone-else/">
            U.S. 988 Lifeline
          </HelpLink>
          <span aria-hidden="true"> · </span>
          <HelpLink href="https://988.ca/">Canada 9-8-8</HelpLink>
          <span aria-hidden="true"> · </span>
          <HelpLink href={links.directorySource}>
            About the worldwide directory
          </HelpLink>
        </p>
      </section>

      <nav
        className="get-help-section-links"
        aria-label="On this Get Help page"
      >
        <a href="#help" onClick={(event) => jumpTo(event, "finding-therapy")}>
          Finding ongoing care
        </a>
        <a href="#help" onClick={(event) => jumpTo(event, "affording-care")}>
          Help with the cost
        </a>
        <a href="#help" onClick={(event) => jumpTo(event, "care-and-faith")}>
          Care and faith
        </a>
      </nav>

      <section
        className="get-help-start"
        id="finding-therapy"
        aria-labelledby="get-help-start-title"
        tabIndex={-1}
      >
        <p className="eyebrow">One step at a time</p>
        <h2 id="get-help-start-title">
          Finding a therapist or mental health professional
        </h2>
        <p>
          You can begin by telling a primary care clinician or GP how you have
          been feeling and asking about mental health support. They can help you
          explore a referral. You can also use the official resources below to
          find a starting point.
        </p>
        <div className="get-help-pathways">
          <article className="get-help-pathway">
            <span className="get-help-region-label">United States</span>
            <h3>A guide and a treatment directory</h3>
            <p>
              NIMH explains ways to find mental health care, including through a
              clinician, insurance plan, local health services, school, or
              workplace. FindTreatment.gov is a U.S. treatment locator.
            </p>
            <HelpLink href={links.treatment} action>
              Explore FindTreatment.gov
            </HelpLink>
            <p className="get-help-sources">
              Source:{" "}
              <HelpLink href={links.nimh}>
                NIMH help and treatment guide
              </HelpLink>
            </p>
          </article>
          <article className="get-help-pathway">
            <span className="get-help-region-label">
              England · United Kingdom
            </span>
            <h3>Start with the NHS</h3>
            <p>
              A GP can help you find an appropriate mental health service. NHS
              talking therapies also accepts self-referrals for eligible people
              living in England—generally age 18 and over, or 16–17 in some
              areas. Services assess whether they can help.
            </p>
            <HelpLink href={links.talkingTherapies} action>
              Read NHS talking therapy options
            </HelpLink>
            <p className="get-help-sources">
              Sources: <HelpLink href={links.nhs}>NHS access guide</HelpLink>
              <span aria-hidden="true"> · </span>
              <HelpLink href={links.talkingTherapies}>
                Eligibility and self-referral
              </HelpLink>
            </p>
          </article>
          <article className="get-help-pathway">
            <span className="get-help-region-label">
              Other countries and regions
            </span>
            <h3>A place to begin near you</h3>
            <p>
              Ask a local clinician or health service about an appropriately
              qualified mental health professional. If you need someone to talk
              with now, Find A Helpline lets you choose your country and see
              emotional support options.
            </p>
            <HelpLink href={links.worldwide} action>
              Find emotional support
            </HelpLink>
            <p className="get-help-sources">
              Source:{" "}
              <HelpLink href={links.directorySource}>
                Find A Helpline directory information
              </HelpLink>
            </p>
          </article>
        </div>
        <p className="get-help-availability">
          These links provide information, not a reserved appointment or a
          promise of availability. Eligibility, fees, waiting times, and
          available care vary; confirm them with the service.
        </p>
      </section>

      <div className="get-help-practical-grid">
        <section
          className="get-help-cost-card"
          id="affording-care"
          tabIndex={-1}
          aria-labelledby="get-help-cost-title"
        >
          <span className="get-help-small-icon">
            <Icon name="note" size={21} />
          </span>
          <p className="eyebrow">When cost is a worry</p>
          <h2 id="get-help-cost-title">It’s okay to ask about the cost.</h2>
          <p>
            Ask what you would pay before starting. If you have insurance, check
            which professionals and services your plan covers.
          </p>
          <p>
            In the U.S., ask whether a service has fees based on income,
            lower-cost options, or payment assistance. SAMHSA also points to
            health centers and state agencies. Availability and eligibility
            differ; check directly.
          </p>
          <div className="get-help-resource-links">
            <HelpLink href={links.pay}>SAMHSA: paying for treatment</HelpLink>
            <HelpLink href={links.lowCost}>
              SAMHSA: free or lower-cost options
            </HelpLink>
          </div>
          <p className="get-help-sources">
            These SAMHSA resources are for the United States. Elsewhere, ask
            your local health service about costs and available assistance.
          </p>
        </section>
        <section
          className="get-help-questions-card"
          aria-labelledby="get-help-questions-title"
        >
          <span className="get-help-small-icon">
            <Icon name="people" size={21} />
          </span>
          <p className="eyebrow">You can bring a few questions</p>
          <h2 id="get-help-questions-title">Finding someone you can talk to</h2>
          <ul>
            <li>What experience do you have helping with what I’m facing?</li>
            <li>What would care involve, and what does it cost?</li>
            <li>Do you accept my insurance or offer payment options?</li>
            <li>
              Can you respect and include my faith or preferences in our work?
            </li>
          </ul>
          <p>
            If possible, ask a trusted person to help you take the first step.
            You do not need to share your private story publicly to find help.
          </p>
          <p className="get-help-sources">
            Provider and cost questions draw on{" "}
            <HelpLink href={links.nimh}>NIMH’s guide</HelpLink>. The question
            about faith is our editorial suggestion.
          </p>
        </section>
      </div>

      <section
        className="get-help-faith"
        id="care-and-faith"
        tabIndex={-1}
        aria-labelledby="get-help-faith-title"
      >
        <span className="get-help-faith-mark" aria-hidden="true">
          ✦
        </span>
        <div>
          <p className="eyebrow">Prayer, care, and companionship</p>
          <h2 id="get-help-faith-title">You don’t have to face this alone.</h2>
          <p>
            Prayer Box is rooted in Trinitarian Christianity: one God, Father,
            Son, and Holy Spirit. Your life matters. You are welcome here
            whether you follow Jesus, are exploring faith, or simply need
            support.
          </p>
          <p>
            Prayer and professional care can accompany one another. A trusted
            pastor, friend, or family member can listen and walk alongside you
            as you seek help from a qualified professional. Receiving help here
            does not require a donation or a declaration of faith.
          </p>
          {onNavigate && (
            <button
              type="button"
              className="get-help-about-button"
              onClick={() => onNavigate("about")}
            >
              About our Christian foundation <Icon name="arrow" size={16} />
            </button>
          )}
        </div>
      </section>

      <footer className="get-help-footer">
        <Icon name="info" size={19} />
        <p>
          These outside resources are real; you choose whether to open them.
          Their own privacy policies apply. Prayer Box sends no prayer text,
          contact information, or referral with these links and does not provide
          clinical treatment or book appointments.
        </p>
      </footer>
    </div>
  );
}
