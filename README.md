# Prayer Box

The current release direction is **web first**. The [approved execution contract](docs/WEB_PILOT_EXECUTION.md) records the design sign-off, connected staging, operations and invited-pilot gates. This increment finishes fictional account and photo/audio/transcript design flows; it does not open real registration or activate services. Native apps, widgets, video, browser push and payments are deferred.

This is the approved design direction expressed as a responsive React frontend for public design review. Every name, prayer, membership, media state, notification, report and donation is fictional. Demo input stays in browser memory and is cleared on reload. The prototype is not production security.

Demo: [Prayer Box on GitHub Pages](https://3verythingbutnothing-max.github.io/prayer-box/).

Backend development has started in a separate local build using Cloudflare Workers, D1, private R2, Queues and server-validated Turnstile. The first connected flow is private feedback with quarantined screenshots and durable receipt notifications. No real sign-in provider or public intake is enabled. See the [integration and launch plan](docs/BACKEND_INTEGRATION_AND_LAUNCH.md) for implemented scope, local commands, verification and remaining launch gates. The [account and community launch brief](docs/LAUNCH_READINESS_BRIEF.md) covers identity/recovery recommendations, screening, staffing and restore evidence. Local APIs now also provide guarded group administration, private group notices and scoped moderation, immutable author edit proposals, consented connections/events, and verified-contact password recovery. Group/event screens remain separate in-memory previews. Recovery is capability-gated in the backend build until identity enrollment and code delivery are configured.

Reading text, headings, labels and controls use a 125% root type scale while keeping the rounded Rubik face. Text sizes follow browser font preferences; the miniature decorative phone artwork keeps its own proportions. Larger navigation icons, aligned notification badges and pastel new-request buttons follow the same visual system.

## Run locally

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173/`. This development server binds to this computer only. Use the GitHub Pages demo above for a shareable phone-accessible link.

```sh
npm test
npm run test:stress
npm run build
```

The domain tests exercise fictional audience intersections, anonymous labels, independent deliveries, church approval/removal, friendship changes, actor blocks, limited screening examples and links under the hosted project path. They cannot prove server authorization or abuse protection. The backend now has separate local runtime tests; those do not prove production capacity or complete the launch plan.

`test:stress` runs two independently authored, deterministic local frontend-model harnesses. They check privacy tightening, revocations, blocks, selected-copy story operations, private acknowledgments/care notes, bounded Unicode input and independently decoded QR payloads. Their JSON evidence is written under the ignored `output/qa/mobile-swarm/` directory. These bounded assertions are not browser test counts, provider validation, API authorization or production load/security results. Both harnesses run in the static-site workflow before deployment.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` installs the locked dependencies, runs the prototype tests and builds the static site before deployment. Pushes to `main` publish to GitHub Pages. The build uses `/prayer-box/` as its base path, following the [Vite GitHub Pages guide](https://vite.dev/guide/static-deploy.html#github-pages).

```sh
npm run build:pages
```

Only `dist/` is deployed. The public repository contains the frontend source, fictional fixtures, bundled font/license and publishing workflow. Original founder briefs, internal design/security plans, local screenshots and exports remain in the local workspace and are excluded from Git. No production data or credentials belong in this repository. The prototype asks search engines not to index it; this is not access control.

## Explore

- Maria’s public box: `/#box/maria` — one card per prayer story, a My Prayers section, anonymous display, composer and separate optional Grace delivery.
- My Box: `/#box/mine` — Elena’s private personal inbox and accepted-friend prayer encouragement.
- My Requests: `/#requests` — a searchable single-column list of dated author-only requests, independent conversations, held requests/appeals, selected-delivery updates and per-story deletion.
- My Prayers: `/#prayers` — accessible requests this viewer has added a human prayer or encouragement to. New author updates/testimonies return the affected delivery to its active box list. Automatic replies and merely opening a request do not move it.
- My Church: `/#church` — signed-in accounts’ prayer groups plus the private Elena friendship fixture and name/@username search. Group membership and individual friendship remain separate. Pending friend requests never grant access; decisions persist across navigation until refresh.
- Grace Church: `/#box/grace` — public box, optional organization website link, membership application/invitation and group-access disclosure.
- Share box: every personal or organization box page has a branded QR card, downloadable as PNG for slides or SVG for print, plus a copyable box link.
- Shared inbox: `/#inbox` — approved members, assignment conflicts, owner reassignment and work states that do not narrow the audience.
- Prayer groups: `/#groups` and `/#group/grace-church` — create/edit groups, preset or local custom pictures, invitations, join requests, approvals, admin/moderator roles, scoped content removal, private notices, unanimous group deletion and departure handoffs. `/#members` now opens Grace’s group page. A new group has no live request intake; its new delivery path is still being connected.
- About: `/#about` — proposed editorial copy, confirmed Trinitarian foundation, personal/in-person prayer, Lord’s Prayer guide and 40 Scripture selections with NIV reading links.
- Get Help: `/#help` — regional crisis resources, official therapy/treatment pathways, affordability guidance and professional support alongside faith. It collects no clinical information and makes no referrals or appointments.
- Report a bug: `/#feedback` — a matching feedback form with a cute bug illustration, bug/feature/other choices, a message, optional local picture previews and a clearly simulated Submit action. Available from the footer and account menu, including to visitors.
- Donations: `/#donations` — average monthly hosting cost, a vivid moving rainbow, metallic-gold rim and tiny stars, with a static reduced-motion fallback. Net received funds drive the meter; expected renewals stay separate. One-time/custom and monthly previews remain available after the goal is met. A small overflowing wine-glass illustration accompanies “Our cup is overflowing!”; no funding lock or funding-gap cap remains. Payments are still simulated.
- My Donations: `/#donation-history` — Elena’s private fictional records, year/date filters, CSV and print/save-PDF, with simulated cancellation.
- Settings: `/#settings` — privacy limits, optional country, associations, recovery fixtures, separate contact consents, reminders and off-by-default reviewed automatic acknowledgments.
- Signup: `/#signup` — clean account setup wording, English interface-language selection, optional contact fixtures and recovery guidance. Identity/contact inputs remain fixture-backed and read-only; the quiet Bot check card is an unconnected illustration. No Bible edition is requested during setup and no account or recovery code is issued.
- Prayer events and invitations: `/#events` and `/#invitations` — personal/group event forms, virtual or in-person details, canonical reposts, edit/cancel/dismiss controls, Google Calendar links and Apple/other `.ics` copies. Calendar copies do not synchronize. Member-only invitations cannot be broadened.
- Connections: `/#connections` and My Church — exact-username search, request/accept/decline/withdraw/disconnect. Prayer submissions only offer a voluntary connection prompt, including anonymous submissions; connections carry no prayer provenance. Prototype accounts start connected to `@prayerbox` and can disconnect. This grants invitations, not private-prayer access or membership.
- Notification choices: `/#notification-preferences` — optional category controls after signup, private phone-banner previews and explicit browser permission. No alerts are scheduled; preferences are session-only.
- Account recovery: `/#recovery` — a disabled prototype view; the separate backend build wires this form to verified-contact recovery APIs only when configured. No real email/SMS delivery or signup/sign-in is connected.
- Review queue: `/#review` — platform-reviewer fixture only; held text/media, appeals, reported evidence and explicit validated-report decisions.

Use **Preview options** to switch fictional viewers, open signup or reset shared demo data. Artificial box-list loading/denial scenarios have been removed; actual audience checks remain. Maria is independently approved by Grace Church. Samuel is the removable member. Elena starts unapproved. The platform-reviewer fixture has no general private-box access. Every browser receives all fixture source data; these controls illustrate the intended rules only.

The composer uses a searchable name/@username recipient picker with explicit chips. Prayer Box is always offered as a destination unless it is the current viewer's own box. Accepted friends are suggested; other discoverable examples appear through search. Each selected destination keeps its own audience, anonymity, delivery and conversation. The fictional Prayer Box prayer-team inbox is separate from church membership and platform safety review; selecting it does not add those roles to other deliveries.

Owners cannot submit requests to their own personal or organization box. Own-box pages offer My requests and guidance to choose another box; optional destinations and the commit boundary also exclude owned boxes. Approved organization membership remains distinct from ownership, so ordinary approved members can ask their church for prayer. If the guest walkthrough signs into an account that owns the chosen destination, it retains the draft and asks for an explicit different box. These are prototype guards; production needs server enforcement.

## Private acknowledgment and care walkthrough

- Every newly accepted request gets a short, contextual first comment from Prayer Box, labeled **Automatic** and **Only you**. It is stored once for that delivery and appears in the original conversation before box welcomes or human replies. Other viewers and post-specific conversations do not receive it. It does not add a prayer team to the audience or claim that a human read or prayed over the request. The team wording illustrates the founder's planned standing commitment; no live team is notified.
- The composer’s **Support and safety** fictional example opens a dismissible resource panel before submission. The panel includes emergency guidance, Christian encouragement, regional crisis resources and a worldwide directory. Closing it continues the draft review. It never places a call, sends a text or shares prayer content with a provider automatically. The English-language cue rules are limited demo heuristics and can miss context; they are not crisis detection, diagnosis or monitoring.
- **Request safety and care options → This person may need help** creates a separate care case without removing the request, blocking the author or imposing a restriction. A reviewer can preview a discreet author-only in-app note. Existing support offers are deduplicated, and the author can dismiss the note. No real person, clinician, ministry, emergency service, email or phone is contacted.
- The updated palette adds soft blue surfaces and navy controls while retaining lavender prayers, peach testimonies, paper texture and gentle shadows.

The resource links are real, user-initiated support options. Their source checks and region limits are documented in [care resource notes](public/care-resource-notes.md). Human safeguarding responsibility, a real prayer-team commitment and production confidentiality require a separately approved backend and operating process.

## One prayer story, with room to return

Requests, updates and testimonies share one dated detail page with an aligned timeline and the original title on every post. Update notifications show the full update and original title, then open that exact post with its response selected. Each card opens its own prayers and encouragement, with private agreement state, reporting and nested replies. Personal-prayer encouragement follows the response fields. New posts append rather than replace earlier ones. Only author-selected deliveries receive them; another box never inherits private replies, updates or identifying details. Earlier `/#testimony/<delivery-id>` links open the same unified story, subject to the same audience. No public popularity counts or global conversation feed were added.

Each original/update card has one **Read prayers & encouragement** action. It opens a read-first list scoped to that exact card, not the response form. An update's list can expand its dated original request for context; prayers to the original and other posts stay separate. Explicit Leave encouragement or Reply actions open the corresponding response field. Card headers put the author above the post kind/title, with date and an adjacent ellipsis. Every author-post menu offers safety/care actions; the author's own menu offers management instead of self-blocking. Report and care evidence use the exact chosen post, with regression coverage against missing or mismatched post/reply IDs.

An approved human prayer or encouragement moves that request into **My Prayers** for that viewer. A new author update or testimony reactivates that delivery, independently of other recipients and approved church members. This is a personal organization aid with no public prayer counts or claim that a click proves someone prayed.

From **My Requests → Delete request**, select particular box deliveries or all deliveries of that story. The page has no global delete-all toolbar. Nothing starts selected; a review lists exactly what will be removed. Deletion removes each selected delivery and its linked posts, conversation and support-note fixtures from this session. Unselected deliveries and other authors' requests remain. Direct links to deleted examples become unavailable until the prototype is reset or reloaded. This does not erase downloaded copies or establish production deletion/retention enforcement.

## Editing and group lifecycle

Each author's story card offers an edit control for that exact delivery and post. Original dates stay unchanged; a saved correction shows its edit time. Prototype screening can hold a proposed revision without replacing previously visible approved words. Authors can revise or withdraw a pending proposal. Human encouragement shows posting time and supports the writer's own edit/remove controls, preserving other people's nested replies. The backend currently stores pending post proposals only; reviewer publication and connected reply writes remain unfinished.

Group membership controls include invite/cancel, accept/decline, apply/withdraw, approve/deny, promote/demote, remove/block/unblock and leave. Leaving as the last admin offers a successor choice or the longest-serving active moderator, then the oldest active continuous membership if no moderator is eligible. Pending, blocked and inactive accounts cannot inherit the role; no eligible successor means confirmed group archival. An unblock does not restore approval, and rejoining starts a fresh membership interval. Admin access is separate from official-reply permission. Local Worker tests exercise session/MFA revocation, membership/block races and atomic ownership handoff; real sign-in and production group-policy decisions are still required.

## Shareable Prayer Box QR cards

Open **Share box** on a personal, organization or Prayer Box team page. Its QR code is generated locally from that box’s normal permalink. The scanning pattern has no embedded logo or cutout and retains the full white four-module quiet zone; the logo stays in the card header. Captions and the permalink are larger. The exact same vector card is used on screen and for PNG/SVG export. PNG uses integer 3× scaling; SVG scales for print. Keep the complete card and white margin when sharing.

The encoder loads only when sharing is opened; copy-link access remains available if QR generation fails. No QR service, URL shortener, tracking, remote image generation, camera access or server is involved. Codes contain only the canonical box link, with page query parameters and earlier request routes removed. Sharing or scanning never grants additional request permissions. All six destinations are fictional prototype boxes. This static QR walkthrough does not create accounts or enforce server authorization; the separate local backend increment is described in the integration plan.

The pinned [node-qrcode encoder](https://github.com/soldair/node-qrcode) uses high error correction. Independent tests rasterize and decode each personal/organization destination with [jsQR](https://github.com/cozmo/jsQR), including the hosted project path and URL privacy/rejection cases. The white margin follows [DENSO WAVE’s four-module quiet-zone guidance](https://www.qrcode.com/en/howto/code.html/index.html). Actual exported files are checked separately from these unit tests; projector, print-size and physical-phone testing remain device-specific.

## Mobile app

The responsive prototype can be added to a phone's home screen. Open [the mobile app guide](https://3verythingbutnothing-max.github.io/prayer-box/#app), also available in the account menu and footer. The same **My Box / My Requests / My Church** navigation stays at the bottom on narrow screens, with larger labels and safe-area spacing. Menus scroll within short screens, and composer review/checking/result transitions keep keyboard focus inside the dialog.

The manifest declares standalone display, a project-relative identity/start/scope, cream theme/launch colors, normal 192/512px icons and a separate maskable 512px icon. A 180px Apple icon and editable SVG source use the existing open-box/heart logo on pastel blue. The optional browser install event is captured when available; only an explicit button click opens its prompt. Other browsers show readable manual instructions. The page reports installed status only from an actual browser install or standalone signal.

Current instructions link to [Apple's home-screen guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios) and [Google's Android web-app guide](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid). Browser menu names vary. This is a mobile web app, with no app-store package or native wrapper. It needs an internet connection. No service worker, offline prayer cache, push subscription, device permission or persistent prayer data was added; demo changes still clear on reload. Physical iOS/Android installation, virtual keyboards and device performance remain separate device checks.

## Widget previews and language

The Mobile app page includes small, medium and large prayer-reminder widget designs, a daily prayer-reading reference, a reminder-time preview and session-only Save demo widget choices. The previews contain no private request, identity, photograph, activity count or donation history. They do not add an OS widget or schedule an alert. Real Home Screen widgets need a separate native [Apple WidgetKit extension](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension) or [Android app-widget implementation](https://developer.android.com/develop/ui/views/appwidgets), packaging and device verification. The installed web-app icon alone provides neither.

Signup offers **English** as the only shipped interface language, independently of country. Bible edition is not a signup choice. A typed English catalog and fallback handle the setup/widget copy; the rest of the existing interface remains English. No prayer content is machine-translated and no translation provider is connected. This is a foundation for future approved catalogs, not a claim of multilingual coverage.

The founder selected **NIV**. About and widgets now link to the corresponding NIV readings on Bible Gateway; original encouragement is labeled separately. Permission to quote NIV text here has not been obtained. The earlier WEB text is preserved in source history/data and never relabeled NIV. Current and historical source notes are in [Scripture source notes](public/scripture-source-notes.md).

Custom donation amounts use exact integer cents, with a technical input range of $0.01–$10,000 and no cap based on remaining hosting need. The meter measures one average month; zero, partial, met and surplus states all leave contribution options available. Invalid, empty, exponent, comma-formatted, overprecise or oversized values are rejected rather than rounded or truncated. Review snapshots show the amount/currency and cadence, including continuing monthly authorization and cancellation; every final action remains simulated with no charge. Expected renewals are never treated as received funds. The displayed month follows the New York calendar date; monthly renewal dates handle month-end and leap years. Cancellation preserves received amounts while removing future commitments. Decorative loops pause offscreen and on hidden pages, and are static under reduced motion. The founder requested no on-page motion button.

## Buttons and preference controls

Submission outcomes share a pastel confirmation with a visible icon, warm wording and a polite screen-reader status. Accepted requests, published encouragement, feedback previews and other completed demo commits receive a sage check. Holds, incomplete deliveries, denied/invalid attempts and review decisions keep distinct, truthful wording. Partial sends retain each destination's state; a sound never certifies real delivery, human prayer, screening or payment. Feedback thanks the visitor for helping make Prayer Box better; a human prayer thanks them for caring for someone in need and serving God's Kingdom.

Successful new requests also show a brief dimensional CSS pop and personal-prayer encouragement. Pointer-triggered success notices now add a small Three.js sparkle lasting 560 milliseconds. The renderer loads on demand, uses nine shared-geometry stars and a capped pixel ratio, and releases its resources and context. Keyboard, reduced-motion and unavailable-WebGL paths keep the static DOM check and readable message. This visual effect does not send a real team notification. The separately loaded Three.js chunk is about 136.5 KB compressed; Vite reports its size warning, and physical-device performance remains unmeasured.

The optional sensory cue is generated locally with Web Audio: a short, quiet two-note success chime or one softer status note, plus a brief vibration request where supported. It starts only from an explicit action/result, with gesture preparation for delayed submissions. There is no audio file service, microphone access, autoplay on navigation, looping or voice generation. Superseded notes are stopped rather than stacked; mute, hidden pages and unmount cancel pending cues. The engine's finite tests cover quiet initialization, unavailable/rejecting APIs, mute/resume races, rapid replacement and cleanup.

**Settings → Sounds & touch** offers separate Confirmation sounds and Gentle vibration switches, plus Try feedback. Visual feedback stays on. Preferences apply to this page session and reset on reload. Vibration also respects reduced-motion preferences; actual output depends on the browser, hardware and system settings. See [MDN's vibration limits](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate) and [Web Audio user controls](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices). Browser/API scheduling evidence does not establish physical hearing or vibration.

Confirmations inside a native dialog appear in a dedicated slot beneath its heading, without covering form actions. Page confirmations stay dismissible and clear on the next control action, Escape, unrelated navigation or demo-viewer change. Only their own mute/dismiss buttons intercept pointer events. Keyboard outcomes are immediate; pointer entry uses the existing short CSS transition, with a static reduced-motion fallback. New status text contains no prayer content, hidden recipients, private account identifiers or billing details.

Buttons use a small 120ms press/release response and a gentle highlight. Ongoing Settings preferences use native checkbox-based switches with a 160ms sliding thumb, visible on/off marks and 50 × 44px input targets. Country/association display, update filters, friend reminders and the reviewed optional box welcome keep their existing temporary state and eligibility rules. Contact-purpose consent, additional recipients and deletion selections remain explicit checkboxes.

The One-time/Monthly selector keeps its native radio group, with one decorative pill moving beneath the labels. Space, Tab and radio Arrow keys remain available; keyboard changes are immediate with visible focus. Pointer hover is limited to fine pointers, reduced motion keeps final selection positions without transitions, and disabled controls remain inactive. The press and selector styling requires no animation library, backend or service. Browser viewport checks cover desktop, 768px, 390px and 320px; these do not establish physical-device or frame-rate performance.

## Boundaries and proposed decisions

### Bug reports and ideas

The feedback page uses the existing pastel paper surfaces and tactile button styles. It accepts a required message of up to 3,000 characters and optional PNG/JPG/WebP pictures (up to three, 5 MB each). Basic client checks cover declared type, file signature, size and browser decoding. Pictures use local blob URLs, with previews/removal and cleanup on removal, a fresh report or leaving the page. These checks are not a production upload or security pipeline.

**In the GitHub Pages prototype, Submit creates a temporary browser preview. Nothing is sent, saved, queued or monitored.** Editing retains the draft and selected pictures; starting another or leaving clears them. The page asks for fictional text and non-sensitive sample pictures, with no account/contact fields or automatic diagnostic collection. It is available without signing in so the design also accommodates reporting account-access issues. The separate local backend now exercises private report storage, attachment quarantine and queued receipt delivery; public reporting and staffed review remain launch gates. No GitHub issue, email or notification is created. The page and its styles load only when opened; a load failure offers a page reload.

Signed-in individuals can create a prayer group from **My Church → Create prayer group**. Its name, optional website and picture are managed together by current admins. Group handles remain stable for shared links. The website appears on the group card and existing Grace box/inbox, opens in a new tab, and stays separate from personal profiles and anonymous requester identity. Creating a group does not verify church authority. Settings lists every active group membership and links to its controls.

The demo accepts ordinary HTTP/HTTPS addresses, adds HTTPS to a bare domain, and rejects executable schemes, credential-bearing/local addresses and known payment-solicitation examples. It does not fetch previews, import posts, verify site ownership or establish reliable live URL/content screening. A blank value removes the link. Changes remain in React memory and reset on reload.

GitHub Pages serves the static frontend. That public demo has no connected backend, database, real authentication, contact verification, working CAPTCHA, bot protection, media upload/recording/transcription, AI moderation, model training, email/SMS, payment processor or real financial transaction. Audio/video states and transcripts are UI simulations; no voice is recorded or played. Donation exports are fictional personal records, not tax receipts; entity status and deductibility are unverified.

Signup and recovery use fixed sample credentials and contact/code verification states, including contact-free recovery and an example replacement kit. Request media uses synthetic photos and a recording/transcript walkthrough; all media submissions await simulated human review. The phone page provides web Home Screen instructions; native widget controls are deferred. **Preview options**, also opened by the footer's **Prototype details**, remains the central disclosure: all data is fictional, each browser receives the fixture source, account/bot verification is disconnected and state resets on reload. Natural presentation labels do not establish real delivery, authentication or screening.

Before real requests, the minimum implementation is a server application and database with maintained login/recovery, per-delivery authorization, church approval/revocation and anonymous identity separation; server-verified bot checks and rate limits; durable moderation/appeals/care and prayer-team queues; private media quarantine/processing for any enabled uploads; and durable in-app notifications, bug-report delivery, backups and incident/deletion operations. The approved pilot needs consented transactional email and reviewed photos/audio/transcripts before real onboarding. Browser push, video and payments stay deferred; optional phone recovery remains a separate verification purpose. A bot failure needs safe retry and an accessible support or independently verified alternative path, never a bypass around verification. Cognito Lite, Resend, Twilio Verify and Cloudflare Workers AI are the approved planned providers; none is activated by this frontend revision.

Confirmed requirements are in revision 4 and the founder’s subsequent additions, including English and NIV selection. Exact editorial wording, NIV quotation rights, native widget packaging, future-member retained-history policy, precise block/group confidentiality policy, retention, age/region rules, human review operations, providers, payment eligibility and surplus policy still require production decisions. Current NIV links and the historical WEB source audit are documented in `public/scripture-source-notes.md`.

The founder authorized GitHub hosting and has now authorized backend implementation. This increment is local and synthetic; real accounts, public intake, production deployment and payments remain gated by the integration and launch plan. Production authorization must protect every request, reply, attachment, linked testimony, export and notification at the server; browser visibility is insufficient.

## Design and source material

The founder's revision-4 brief controls; companion copy is proposed. The supplied briefs and the reviewable design/security plans were preserved in the local workspace. They are not part of this public source repository. The public demo keeps proposed copy visibly labeled for review.

Applied available local skills: Sites (local-only workflow), web-design-taste, Emil design engineering, React best practices and animate. The brief’s `frontend-design` and `web-design-guidelines` skills remain unavailable locally; their official upstream instructions were inspected earlier. No unrelated skill bundle was installed. Rubik is bundled locally with its OFL license. Icons are SVGs; the logo, favicon and hero share a vector redrawing of the founder’s supplied open-box and heart-note motif. The donation rainbow/glint uses CSS transforms and star opacity, with automatic offscreen/hidden-page pausing and a static reduced-motion fallback. Its layered gold rim uses sharp reflective bands and beveled edges.

The frontend uses React, TypeScript and Vite. The separate backend uses the pinned Cloudflare toolchain and local runtime test integration. The small QR encoder is loaded on demand, with jsQR used only for development tests. The GitHub Pages prototype keeps its state in React memory; the separate backend uses local D1 and R2. Donation CSV downloads use a controlled schema with spreadsheet-formula neutralization; QR PNG/SVG downloads contain only the branded box-link card.
