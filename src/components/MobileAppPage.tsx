import type { AppInstall } from "../app-install";
import { Icon, PrayerBoxMark } from "../ui";
import "./MobileAppPage.css";

function PocketPreview() {
  return (
    <div
      className="pocket-preview"
      role="img"
      aria-label="Prayer Box mobile design: a soft blue prayer box, a paper prayer card, and My Box, My Requests and My Church navigation."
    >
      <span className="pocket-spark pocket-spark-one" aria-hidden="true">
        ✦
      </span>
      <span className="pocket-spark pocket-spark-two" aria-hidden="true">
        ✧
      </span>
      <div className="pocket-phone" aria-hidden="true">
        <div className="pocket-island" />
        <div className="pocket-brand">
          <PrayerBoxMark size={26} />
          Prayer Box<span>✦</span>
        </div>
        <div className="pocket-hero">
          <span className="pocket-eyebrow">A LITTLE SPACE FOR PRAYER</span>
          <strong>
            Bring what’s
            <br />
            on your heart.
          </strong>
          <PrayerBoxMark size={78} />
        </div>
        <div className="pocket-card">
          <span>
            <Icon name="heart" size={16} /> A quiet moment
          </span>
          <strong>Peace for this week</strong>
          <div className="pocket-line" />
          <div className="pocket-line short" />
          <span className="pocket-pray">
            Read & pray <Icon name="arrow" size={13} />
          </span>
        </div>
        <div className="pocket-bottom">
          <span className="selected">
            <Icon name="box" size={18} />
            My Box
          </span>
          <span>
            <Icon name="note" size={18} />
            My Requests
          </span>
          <span>
            <Icon name="people" size={18} />
            My Church
          </span>
        </div>
      </div>
      <span className="pocket-caption" aria-hidden="true">
        A little prayer, wherever you are.
      </span>
    </div>
  );
}

export default function MobileAppPage({ app }: { app: AppInstall }) {
  return (
    <div className="mobile-app-page">
      <div className="breadcrumb">
        <a href="#home">Prayer Box</a>
        <Icon name="chevron" size={12} />
        <span>Mobile app</span>
      </div>
      <section
        className="mobile-app-hero panel"
        aria-labelledby="mobile-app-title"
      >
        <div className="mobile-app-intro">
          <span className="mobile-app-tag">
            <Icon name="heart" size={15} /> Your little box, close by
          </span>
          <h1 id="mobile-app-title">
            Make a little room
            <br />
            for prayer.
          </h1>
          <p>
            Add Prayer Box to your home screen. Open your box, share a request,
            and return to pray with the same gentle space you know.
          </p>
          <div className="mobile-app-actions">
            {app.installed ? (
              <span className="mobile-app-ready">
                <Icon name="check" size={19} />{" "}
                {app.message ? "Added to your device" : "You’re using the app"}
              </span>
            ) : app.available || app.pending ? (
              <button
                className="button"
                disabled={app.pending}
                onClick={() => void app.install()}
              >
                <Icon name="box" size={18} />
                {app.pending ? "Opening your browser…" : "Add Prayer Box"}
              </button>
            ) : (
              <a
                className="button"
                href="#phone-install-steps"
                onClick={(event) => {
                  event.preventDefault();
                  const steps = document.getElementById("phone-install-steps");
                  steps?.scrollIntoView({
                    block: "start",
                    behavior: "instant",
                  });
                  steps?.focus({ preventScroll: true });
                }}
              >
                See how to add it <Icon name="arrow" size={17} />
              </a>
            )}
            <a className="text-link" href="#box/maria">
              Explore the example <Icon name="arrow" size={16} />
            </a>
          </div>
          <p className="mobile-app-status" role="status" aria-live="polite">
            {app.message}
          </p>
          <p className="mobile-app-demo">
            <Icon name="info" size={17} />
            <span>
              Fictional prototype. Use sample details only. Your demo changes
              clear when you reload; an internet connection is needed.
            </span>
          </p>
        </div>
        <PocketPreview />
      </section>

      <section
        id="phone-install-steps"
        className="phone-install-section"
        tabIndex={-1}
        aria-labelledby="phone-install-title"
      >
        <div className="mobile-app-section-heading">
          <p className="eyebrow">A small spot on your home screen</p>
          <h2 id="phone-install-title">Bring your box along.</h2>
          <p>
            Choose your phone below. You can always keep using the website, too.
          </p>
        </div>
        <div className="phone-install-grid">
          <article className="phone-install-card panel">
            <div className="phone-install-heading">
              <span className="phone-install-icon">
                <Icon name="heart" size={21} />
              </span>
              <div>
                <span className="eyebrow">Safari</span>
                <h3>iPhone & iPad</h3>
              </div>
            </div>
            <ol>
              <li>
                <span>1</span>
                <p>
                  Open this website in <strong>Safari</strong>.
                </p>
              </li>
              <li>
                <span>2</span>
                <p>
                  Tap <strong>Share</strong>. You may find it inside the Page
                  Menu.
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  Choose <strong>Add to Home Screen</strong>. If shown, turn on{" "}
                  <strong>Open as Web App</strong>, then tap{" "}
                  <strong>Add</strong>.
                </p>
              </li>
            </ol>
            <a
              className="text-link"
              href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios"
              target="_blank"
              rel="noopener noreferrer"
            >
              Apple’s step-by-step guide <Icon name="arrow" size={15} />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </article>
          <article className="phone-install-card panel">
            <div className="phone-install-heading">
              <span className="phone-install-icon blue">
                <Icon name="box" size={21} />
              </span>
              <div>
                <span className="eyebrow">Chrome</span>
                <h3>Android</h3>
              </div>
            </div>
            <ol>
              <li>
                <span>1</span>
                <p>
                  Open this website in <strong>Chrome</strong>.
                </p>
              </li>
              <li>
                <span>2</span>
                <p>
                  Tap the <strong>More</strong> menu beside the address bar.
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  Choose <strong>Install and create shortcut → Install</strong>,
                  then follow the steps. Some versions say{" "}
                  <strong>Add to Home screen</strong>.
                </p>
              </li>
            </ol>
            <a
              className="text-link"
              href="https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google’s step-by-step guide <Icon name="arrow" size={15} />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </article>
        </div>
        <p className="phone-install-note">
          On a computer, look for your browser’s install option, or use Safari’s
          File → Add to Dock. Menu names vary by browser and version.
        </p>
      </section>

      <section
        className="mobile-app-reassurance panel"
        aria-labelledby="mobile-app-same-space"
      >
        <PrayerBoxMark size={43} />
        <div>
          <h2 id="mobile-app-same-space">
            The same little space. The same care.
          </h2>
          <p>
            Your personal box, your requests and your church stay easy to reach.
            The demo’s privacy choices and separate deliveries work the same way
            on phone and desktop.
          </p>
        </div>
        <a className="text-link" href="#help">
          Get Help <Icon name="arrow" size={16} />
        </a>
      </section>
    </div>
  );
}
