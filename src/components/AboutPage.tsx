import { useEffect } from "react";
import type { ReactNode } from "react";
import {
  lordsPrayer,
  scriptureEdition,
  scriptureEntries,
  scriptureThemes,
} from "../data/scripture";
import type { ScriptureQuotation } from "../data/scripture";
import "../about.css";

type AboutPageProps = { onNavigate?: (route: string) => void };

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="text-link about-source-link"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <span className="about-sr-only"> (opens in a new tab)</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

function PassageText({
  quotation,
  showSegmentLabels = false,
}: {
  quotation: ScriptureQuotation;
  showSegmentLabels?: boolean;
}) {
  return (
    <div className="about-passage-text">
      <p className="about-edition">
        Bible quotation · {scriptureEdition.shortName}
      </p>
      {quotation.segments.map((segment) => (
        <div className="about-scripture-segment" key={segment.reference}>
          {showSegmentLabels && (
            <p className="about-segment-label">{segment.reference}</p>
          )}
          <blockquote>
            {segment.verses.map(({ verse, text }) => (
              <p key={verse}>
                <sup
                  className="about-verse-number"
                  aria-label={`Verse ${verse}`}
                >
                  {verse}
                </sup>{" "}
                {text}
              </p>
            ))}
          </blockquote>
        </div>
      ))}
      {quotation.notes.length > 0 && (
        <div
          className="about-textual-notes"
          aria-label="Publisher textual notes"
        >
          {quotation.notes.map((note, index) => (
            <p key={`${note.verse}-${index}`}>
              <strong>Publisher note, verse {note.verse}:</strong> {note.text}
            </p>
          ))}
        </div>
      )}
      <SourceLink href={quotation.sourceUrl}>
        Read the publisher’s chapter for context
      </SourceLink>
    </div>
  );
}

const prayerMovements = [
  [
    "Address God as Father and honor him",
    "Begin with relationship and reverence: recognize God’s holiness, majesty, and loving authority.",
  ],
  [
    "Seek God’s kingdom and will",
    "Ask for God’s reign and purposes to shape life on earth, including your own choices; place your wishes under his will.",
  ],
  [
    "Bring daily needs",
    "Ask for what you need and acknowledge dependence on God’s provision.",
  ],
  [
    "Confess and forgive",
    "Seek mercy for your sins, forgive others, and ask for help where forgiveness is difficult.",
  ],
  [
    "Ask for protection",
    "Seek help against temptation and deliverance from evil.",
  ],
  [
    "Give God glory",
    "Where the chosen edition includes the concluding praise, acknowledge God’s rule, power, and glory.",
  ],
];

function FoldedNote() {
  return (
    <svg
      className="about-note-drawing"
      viewBox="0 0 160 124"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M21 45L78 18a9 9 0 0 1 8 0l54 28v56a9 9 0 0 1-9 9H30a9 9 0 0 1-9-9V45Z"
        fill="var(--peach)"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M44 58V24a5 5 0 0 1 5-5h64a5 5 0 0 1 5 5v36"
        fill="var(--paper)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M61 36h40M61 47h29"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".55"
      />
      <path
        d="m22 47 49 33a17 17 0 0 0 19 0l49-33M23 107l40-35m75 35-40-35"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M80 62c-9-13-22-2-11 8l11 9 11-9c11-10-2-21-11-8Z"
        fill="var(--lavender)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m135 17 1-8m7 12 7-3M21 21l-6-5M16 31l-8 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AboutPage({ onNavigate }: AboutPageProps) {
  useEffect(() => {
    // A submission confirmation can link straight to the guide without a new page.
    const id = window.location.hash.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target instanceof HTMLDetailsElement) target.open = true;
    if (target) target.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="about-page">
      <header className="about-hero">
        <div>
          <p className="eyebrow">A little about Prayer Box</p>
          <h1 className="page-title">
            A little space for prayer,
            <br className="about-desktop-break" /> encouragement, and hope.
          </h1>
          <p className="page-intro">
            Bring your needs to God. Pray for someone else. Come back with an
            update, a testimony, or simply an unfinished story.
          </p>
          <p className="about-hero-welcome">
            You don’t need an audience, impressive words, or a perfect life to
            ask for prayer.
          </p>
        </div>
        <div className="about-note">
          <FoldedNote />
          <p>
            You’re welcome here,
            <br />
            just as you are.
          </p>
        </div>
      </header>

      <div className="about-review-note">
        <span className="chip">Copy for review</span>
        <p>
          The Trinitarian foundation is confirmed. This prototype’s exact
          wording and Bible edition remain proposed for founder approval.
        </p>
      </div>

      <nav className="about-anchor-nav" aria-label="On this About page">
        <a href="#our-foundation">Our foundation</a>
        <a href="#personal-prayer">Your own prayer life</a>
        <a
          href="#prayer-guide"
          onClick={() => {
            const guide = document.getElementById("prayer-guide");
            if (guide instanceof HTMLDetailsElement) guide.open = true;
          }}
        >
          A guide to prayer
        </a>
        <a href="#scripture-collection">Scripture to return to</a>
      </nav>

      <section
        className="about-belief panel"
        id="our-foundation"
        aria-labelledby="about-belief-title"
      >
        <span className="about-section-mark" aria-hidden="true">
          ✦
        </span>
        <div>
          <p className="eyebrow">Our foundation</p>
          <h2 id="about-belief-title">
            One God. Father, Son, and Holy Spirit.
          </h2>
          <p>
            Prayer Box is rooted in Trinitarian Christianity. We believe in one
            God, eternally Father, Son, and Holy Spirit: three distinct persons,
            each fully God, sharing the one divine nature. They are not three
            gods, three parts of God, or one person appearing in different
            forms. Jesus Christ is God the Son, who became human for our
            salvation.
          </p>
          <p className="about-context">
            This proposed statement reflects the core Trinitarian confession of
            the{" "}
            <SourceLink href="https://www.rca.org/about/theology/creeds-and-confessions/the-athanasian-creed/">
              Athanasian Creed
            </SourceLink>
            . It does not add a denomination’s other requirements.
          </p>
        </div>
      </section>

      <section
        className="about-short-section"
        aria-labelledby="about-name-title"
      >
        <h2 id="about-name-title">Why we pray in Jesus’ name</h2>
        <p>
          We come to the Father through Jesus Christ, with the help of the Holy
          Spirit. Praying in Jesus’ name means trusting him and seeking what is
          consistent with his teaching, God’s will, and the Father’s glory. It
          is not a formula that guarantees our preferred outcome.
        </p>
        <p>
          “In Jesus’ name, amen” is welcome. Those exact words are not required
          for a prayer to be accepted here. A sincere prayer addressed to Jesus
          is also welcome, and a short prayer does not need to name all three
          persons.
        </p>
        <p className="about-context">
          Scripture context:{" "}
          <SourceLink href="https://ebible.org/engwebp/EPH02.htm#V18">
            Ephesians 2:18
          </SourceLink>
          ,{" "}
          <SourceLink href="https://ebible.org/engwebp/JHN14.htm#V13">
            John 14:13–14
          </SourceLink>
          ,{" "}
          <SourceLink href="https://ebible.org/engwebp/JHN15.htm#V7">
            John 15:7
          </SourceLink>
          ,{" "}
          <SourceLink href="https://ebible.org/engwebp/JHN16.htm#V23">
            John 16:23–27
          </SourceLink>
          ,{" "}
          <SourceLink href="https://ebible.org/engwebp/1JN05.htm#V14">
            1 John 5:14–15
          </SourceLink>
          , and{" "}
          <SourceLink href="https://ebible.org/engwebp/ACT07.htm#V59">
            Acts 7:59–60
          </SourceLink>
          .
        </p>
      </section>

      <div className="about-care-grid">
        <section
          className="about-care-card about-care-personal"
          id="personal-prayer"
          aria-labelledby="about-personal-title"
        >
          <p className="eyebrow">Your own heart matters</p>
          <h2 id="about-personal-title">Bring your own heart to God</h2>
          <p>
            You are welcome to ask others to pray with you. You also do not need
            a creator, ministry, or large audience to speak to God. Come to the
            Father through Jesus Christ, with the help of the Holy Spirit, and
            bring your gratitude, needs, confession, questions, and hopes
            honestly.
          </p>
          <p>
            Let the prayers of others accompany your own relationship with God.
            If you feel overwhelmed or cannot find the words, you are still
            welcome to ask for prayer.
          </p>
          <p className="about-context">
            Scripture context:{" "}
            <SourceLink href="https://ebible.org/engwebp/MAT06.htm#V6">
              Matthew 6:6–13
            </SourceLink>
            ,{" "}
            <SourceLink href="https://ebible.org/engwebp/EPH02.htm#V18">
              Ephesians 2:18
            </SourceLink>
            , and{" "}
            <SourceLink href="https://ebible.org/engwebp/ROM08.htm#V26">
              Romans 8:26–27
            </SourceLink>
            .
          </p>
        </section>
        <section
          className="about-care-card about-care-together"
          aria-labelledby="about-together-title"
        >
          <p className="eyebrow">Care beyond a screen</p>
          <h2 id="about-together-title">Pray together, with care</h2>
          <p>
            Prayer Box supports prayer and the life of a local church. When it
            is possible and welcomed, listen to one another and pray together in
            person. Pray boldly in Jesus’ name and, with the person’s
            permission, lay hands gently as you pray.
          </p>
          <p>
            Receiving prayer should never require unwanted touch, an unsafe
            meeting, public disclosure, or a promise of healing. Respect
            boundaries and your church’s safeguarding practices. Prayer does not
            require stopping medical care.
          </p>
          <p className="about-context">
            <SourceLink href="https://ebible.org/engwebp/LUK04.htm#V40">
              Luke 4:40
            </SourceLink>{" "}
            describes Jesus laying hands on sick people;{" "}
            <SourceLink href="https://ebible.org/engwebp/ACT28.htm#V8">
              Acts 28:8
            </SourceLink>{" "}
            describes Paul praying and laying hands on Publius’s father.{" "}
            <SourceLink href="https://ebible.org/engwebp/JAS05.htm#V13">
              James 5:13–16
            </SourceLink>{" "}
            describes prayer, elders, and anointing.{" "}
            <SourceLink href="https://ebible.org/engwebp/HEB10.htm#V24">
              Hebrews 10:24–25
            </SourceLink>{" "}
            encourages gathering. Asking permission is our care practice, not a
            Bible quotation.
          </p>
        </section>
      </div>

      <details className="about-guide panel" id="prayer-guide">
        <summary>
          <h2 className="about-guide-heading">
            <span>
              <span className="eyebrow">A gentle place to begin</span>
              <span className="about-summary-title">
                Learning to pray with the Lord’s Prayer
              </span>
            </span>
            <span className="about-details-chevron" aria-hidden="true">
              ⌄
            </span>
          </h2>
        </summary>
        <div className="about-guide-content" id="lords-prayer">
          <p className="about-guide-intro">
            Jesus gives his followers a pattern for prayer. You can pray these
            words, take time with one part, or use them to guide your own words.
          </p>
          <h3>Matthew 6:9–13</h3>
          <PassageText quotation={lordsPrayer} />
          <div className="about-editorial-guide">
            <p className="eyebrow">Editorial guide · proposed site copy</p>
            <h3>Six movements to reflect on</h3>
            <p>The explanations below are separate from the Bible quotation.</p>
            <ol className="about-movements">
              {prayerMovements.map(([title, explanation]) => (
                <li key={title}>
                  <h4>{title}</h4>
                  <p>{explanation}</p>
                </li>
              ))}
            </ol>
            <p>
              This is a pattern, not a compulsory checklist or a formula for
              controlling outcomes. You do not need to prove repentance or
              disclose a confession to ask for prayer. Forgiveness does not
              require returning to an unsafe relationship or hiding abuse.
            </p>
            <p>
              Seeking God’s kingdom includes his will in everyday life now,
              alongside hope for Christ’s return and the promised new creation.
              See{" "}
              <SourceLink href="https://ebible.org/engwebp/2PE03.htm#V10">
                2 Peter 3:10–13
              </SourceLink>{" "}
              and{" "}
              <SourceLink href="https://ebible.org/engwebp/REV21.htm#V1">
                Revelation 21:1–5
              </SourceLink>
              . This guide sets no end-times timetable.
            </p>
            <p>
              Asking for protection from temptation does not mean God entices
              people to sin;{" "}
              <SourceLink href="https://ebible.org/engwebp/JAS01.htm#V13">
                James 1:13
              </SourceLink>{" "}
              makes that distinction.
            </p>
            <div className="about-closing-example">
              <strong>A separate suggested Christian closing</strong>
              <p>In the name of Jesus Christ, amen.</p>
              <small>
                This example draws on John 16:23–27. It is not part of Matthew’s
                quoted words, and these exact words are not required.
              </small>
            </div>
            <p className="about-context">
              The proposed WEB edition includes the concluding praise and the
              publisher’s note that NU omits it. Another Trinitarian tradition’s
              customary recitation may omit that ending.
            </p>
          </div>
        </div>
      </details>

      <section
        className="about-short-section"
        aria-labelledby="about-wait-title"
      >
        <h2 id="about-wait-title">While we wait, and when we give thanks</h2>
        <p>
          There is room here for gratitude, uncertainty, grief, and an
          unfinished story. A testimony can describe what someone believes God
          has done. An update can simply say that prayer is still needed. We do
          not require a happy ending, promise that every request will be
          granted, or blame a person who is suffering.
        </p>
        <p className="about-context">
          Read{" "}
          <SourceLink href="https://ebible.org/engwebp/ROM08.htm#V26">
            Romans 8:26–27
          </SourceLink>
          ,{" "}
          <SourceLink href="https://ebible.org/engwebp/LUK22.htm#V39">
            Luke 22:39–46
          </SourceLink>
          , and{" "}
          <SourceLink href="https://ebible.org/engwebp/2CO12.htm#V7">
            2 Corinthians 12:7–10
          </SourceLink>{" "}
          alongside the promises about prayer.
        </p>
      </section>

      <section
        className="about-collection"
        id="scripture-collection"
        aria-labelledby="about-scripture-title"
      >
        <p className="eyebrow">Words to return to</p>
        <h2 id="about-scripture-title">
          Scripture for prayer and encouragement
        </h2>
        <p className="about-collection-intro">
          Explore the six themes at your own pace. Each passage keeps its Bible
          text and a little context separate.
        </p>
        <div className="about-edition-notice">
          <span className="chip">{scriptureEdition.status}</span>
          <p>
            {scriptureEdition.name}. Final edition and reflections await
            approval. Selected texts were checked against the publisher on{" "}
            {scriptureEdition.checkedAt}.
          </p>
        </div>
        <div className="about-theme-list">
          {scriptureThemes.map((theme, themeIndex) => (
            <details className="about-theme" key={theme}>
              <summary>
                <h3 className="about-theme-heading">
                  <span className="about-theme-icon" aria-hidden="true">
                    {["✦", "✧", "❋", "✶", "✤", "✺"][themeIndex]}
                  </span>
                  <span>{theme}</span>
                  <span className="about-details-chevron" aria-hidden="true">
                    ⌄
                  </span>
                </h3>
              </summary>
              <div className="about-theme-content">
                {scriptureEntries
                  .filter((entry) => entry.theme === theme)
                  .map((entry) => (
                    <details
                      className="about-scripture-card"
                      id={entry.id}
                      key={entry.id}
                    >
                      <summary>
                        <h4 className="about-passage-heading">
                          <span>{entry.reference}</span>
                          <span className="about-read-label">
                            Read passage{" "}
                            <span
                              className="about-details-chevron"
                              aria-hidden="true"
                            >
                              ⌄
                            </span>
                          </span>
                        </h4>
                      </summary>
                      <div className="about-scripture-card-content">
                        <PassageText
                          quotation={entry}
                          showSegmentLabels={entry.segments.length > 1}
                        />
                        <div className="about-reflection">
                          <p className="about-reflection-label">
                            A little context · proposed reflection
                          </p>
                          <p>{entry.explanation}</p>
                        </div>
                      </div>
                    </details>
                  ))}
              </div>
            </details>
          ))}
        </div>
        <p className="about-context about-reuse-note">
          The World English Bible is dedicated to the public domain. Its name
          identifies the publisher’s faithful text.{" "}
          <SourceLink href={scriptureEdition.reuseUrl}>
            Publisher’s reuse statement
          </SourceLink>
          .
        </p>
      </section>

      <section
        className="about-welcome-footer"
        aria-labelledby="about-welcome-title"
      >
        <span aria-hidden="true">✧</span>
        <h2 id="about-welcome-title">You are welcome to ask.</h2>
        <p>
          Whether you have followed Jesus for years, are exploring Christianity,
          or simply need prayer, bring a sincere request. Respect the site’s
          Christian foundation, each other’s privacy, and every person’s
          dignity. Asking for prayer is always free.
        </p>
        {onNavigate && (
          <button
            type="button"
            className="about-back-button"
            onClick={() => onNavigate("box")}
          >
            Back to my box <span aria-hidden="true">↗</span>
          </button>
        )}
      </section>
    </div>
  );
}
