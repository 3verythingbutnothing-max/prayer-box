# Prayer Box frontend prototype

This is the approved design direction expressed as a responsive React frontend for public design review. Every name, prayer, membership, media state, notification, report and donation is fictional. Demo input stays in browser memory and is cleared on reload. The prototype is not production security.

Demo: [Prayer Box on GitHub Pages](https://3verythingbutnothing-max.github.io/prayer-box/).

## Run locally

Use Node.js 20.19+ or 22.12+ and npm:

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

The domain tests exercise fictional audience intersections, anonymous labels, independent deliveries, church approval/removal, friendship changes, actor blocks, limited screening examples and links under the hosted project path. They cannot prove server authorization or abuse protection. The founder's separate backend/stress-test plan has not been executed.

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
- My Requests: `/#requests` — author-only deliveries, independent conversations, held requests/appeals, multiple selected-delivery updates, and deletion from selected boxes or all owned deliveries.
- My Prayers: `/#prayers` — accessible requests this viewer has added a human prayer or encouragement to. New author updates/testimonies return the affected delivery to its active box list. Automatic replies and merely opening a request do not move it.
- My Church: `/#church` — Elena’s private accepted friends; friendship and organization membership remain separate.
- Grace Church: `/#box/grace` — public box, optional organization website link, membership application/invitation and group-access disclosure.
- Share box: every personal or organization box page has a branded QR card, downloadable as PNG for slides or SVG for print, plus a copyable box link.
- Shared inbox: `/#inbox` — approved members, assignment conflicts, owner reassignment and work states that do not narrow the audience.
- Member controls: `/#members` — owner-only simulated approval, invitations, removal and official-reply permission.
- About: `/#about` — proposed public copy, confirmed Trinitarian foundation, personal/in-person prayer, Lord’s Prayer guide and 40 fully populated Scripture selections.
- Get Help: `/#help` — regional crisis resources, official therapy/treatment pathways, affordability guidance and professional support alongside faith. It collects no clinical information and makes no referrals or appointments.
- Report a bug: `/#feedback` — a matching feedback form with a cute bug illustration, bug/feature/other choices, a message, optional local picture previews and a clearly simulated Submit action. Available from the footer and account menu, including to visitors.
- Donations: `/#donations` — truthful $0 initial hosting need shown with a full decorative rainbow, gold rim and one short shimmer; an optional positive-cost example still shows actual net coverage. Explicit monthly choice and simulated review remain.
- My Donations: `/#donation-history` — Elena’s private fictional records, year/date filters, CSV and print/save-PDF, with simulated cancellation.
- Settings: `/#settings` — privacy limits, optional country, associations, recovery fixtures, separate contact consents, reminders and off-by-default reviewed automatic acknowledgments.
- Signup: `/#signup` — read-only example credentials, optional contact fixtures, recovery codes and an explicitly simulated bot-challenge state.
- Review queue: `/#review` — platform-reviewer fixture only; held text/media, appeals, reported evidence and explicit validated-report decisions.

Use **Preview options** to switch fictional viewers, open boundary states, or reset shared demo data. Maria is independently approved by Grace Church. Samuel is the removable member. Elena starts unapproved. The platform-reviewer fixture has no general private-box access. Every browser receives all fixture source data; these controls illustrate the intended rules only.

## Private acknowledgment and care walkthrough

- Every newly accepted request gets a short, contextual first comment from Prayer Box, labeled **Automatic** and **Only you**. It is stored once for that delivery and appears in the original conversation before box welcomes or human replies. Other viewers and post-specific conversations do not receive it. It does not add a prayer team to the audience or claim that a human read or prayed over the request. The team wording illustrates the founder's planned standing commitment; no live team is notified.
- The composer’s **Support and safety** fictional example opens a dismissible resource panel before submission. The panel includes emergency guidance, Christian encouragement, regional crisis resources and a worldwide directory. Closing it continues the draft review. It never places a call, sends a text or shares prayer content with a provider automatically. The English-language cue rules are limited demo heuristics and can miss context; they are not crisis detection, diagnosis or monitoring.
- **Request safety and care options → This person may need help** creates a separate care case without removing the request, blocking the author or imposing a restriction. A reviewer can preview a discreet author-only in-app note. Existing support offers are deduplicated, and the author can dismiss the note. No real person, clinician, ministry, emergency service, email or phone is contacted.
- The updated palette adds soft blue surfaces and navy controls while retaining lavender prayers, peach testimonies, paper texture and gentle shadows.

The resource links are real, user-initiated support options. Their source checks and region limits are documented in [care resource notes](public/care-resource-notes.md). Human safeguarding responsibility, a real prayer-team commitment and production confidentiality require a separately approved backend and operating process.

## One prayer story, with room to return

Requests, updates and testimonies share one dated detail page. Its date links move between the original and each published post, and the encouragement selector keeps replies attached to the selected part of that story. New posts append rather than replace earlier ones. Only the author-selected deliveries receive them; another box never inherits private replies, updates or identifying details. Earlier `/#testimony/<delivery-id>` links open the same unified story, subject to the same audience.

An approved human prayer or encouragement moves that request into **My Prayers** for that viewer. A new author update or testimony reactivates that delivery, independently of other recipients and approved church members. This is a personal organization aid with no public prayer counts or claim that a click proves someone prayed.

From **My Requests → Delete request**, select particular box deliveries or all deliveries of that story. **Delete requests** in the page toolbar supports selecting all owned requests together. Nothing starts selected; a review lists exactly what will be removed. Deletion removes each selected delivery and its linked posts, conversation and support-note fixtures from this session. Unselected deliveries and other authors' requests remain. Direct links to deleted examples become unavailable until the prototype is reset or reloaded. This does not erase downloaded copies or establish production deletion/retention enforcement.

## Shareable Prayer Box QR cards

Open **Share box** on Maria’s, Elena’s or Grace Church’s page. Its QR code is generated locally from that box’s normal permalink. The downloadable card includes the shared Prayer Box logo in a soft blue header, outside the scanning pattern. Dark square modules and a solid white four-module quiet zone remain clear. PNG exports use integer 3× scaling; the self-contained SVG can scale for print. Keep the complete card and white margin when placing it in a slide or handout.

The encoder loads only when sharing is opened; copy-link access remains available if QR generation fails. No QR service, URL shortener, tracking, remote image generation, camera access or server is involved. Codes contain only the canonical box link, with page query parameters and earlier request routes removed. Sharing or scanning never grants additional request permissions. These three destinations are fictional prototype boxes; real account creation and server authorization remain unimplemented.

The pinned [node-qrcode encoder](https://github.com/soldair/node-qrcode) uses high error correction. Independent tests rasterize and decode each personal/organization destination with [jsQR](https://github.com/cozmo/jsQR), including the hosted project path and URL privacy/rejection cases. The white margin follows [DENSO WAVE’s four-module quiet-zone guidance](https://www.qrcode.com/en/howto/code.html/index.html). Actual exported files are checked separately from these unit tests; projector, print-size and physical-phone testing remain device-specific.

## Mobile app

The responsive prototype can be added to a phone's home screen. Open [the mobile app guide](https://3verythingbutnothing-max.github.io/prayer-box/#app), also available in the account menu and footer. The same **My Box / My Requests / My Church** navigation stays at the bottom on narrow screens, with larger labels and safe-area spacing. Menus scroll within short screens, and composer review/checking/result transitions keep keyboard focus inside the dialog.

The manifest declares standalone display, a project-relative identity/start/scope, cream theme/launch colors, normal 192/512px icons and a separate maskable 512px icon. A 180px Apple icon and editable SVG source use the existing open-box/heart logo on pastel blue. The optional browser install event is captured when available; only an explicit button click opens its prompt. Other browsers show readable manual instructions. The page reports installed status only from an actual browser install or standalone signal.

Current instructions link to [Apple's home-screen guide](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios) and [Google's Android web-app guide](https://support.google.com/chrome/answer/9658361?hl=en&co=GENIE.Platform%3DAndroid). Browser menu names vary. This is a mobile web app, with no app-store package or native wrapper. It needs an internet connection. No service worker, offline prayer cache, push subscription, device permission or persistent prayer data was added; demo changes still clear on reload. Physical iOS/Android installation, virtual keyboards and device performance remain separate device checks.

## Buttons and preference controls

Submission outcomes share a pastel confirmation with a visible icon, warm wording and a polite screen-reader status. Accepted requests, published encouragement, feedback previews and other completed demo commits receive a sage check. Holds, incomplete deliveries, denied/invalid attempts and review decisions keep distinct, truthful wording. Partial sends retain each destination's state; a sound never certifies real delivery, human prayer, screening or payment. Feedback thanks the visitor for helping make Prayer Box better; a human prayer thanks them for caring for someone in need and serving God's Kingdom.

The optional sensory cue is generated locally with Web Audio: a short, quiet two-note success chime or one softer status note, plus a brief vibration request where supported. It starts only from an explicit action/result, with gesture preparation for delayed submissions. There is no audio file service, microphone access, autoplay on navigation, looping or voice generation. Superseded notes are stopped rather than stacked; mute, hidden pages and unmount cancel pending cues. The engine's finite tests cover quiet initialization, unavailable/rejecting APIs, mute/resume races, rapid replacement and cleanup.

**Settings → Sounds & touch** offers separate Confirmation sounds and Gentle vibration switches, plus Try feedback. Visual feedback stays on. Preferences apply to this page session and reset on reload. Vibration also respects reduced-motion preferences; actual output depends on the browser, hardware and system settings. See [MDN's vibration limits](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate) and [Web Audio user controls](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices). Browser/API scheduling evidence does not establish physical hearing or vibration.

Confirmations inside a native dialog appear in a dedicated slot beneath its heading, without covering form actions. Page confirmations stay dismissible and clear on the next control action, Escape, unrelated navigation or demo-viewer change. Only their own mute/dismiss buttons intercept pointer events. Keyboard outcomes are immediate; pointer entry uses the existing short CSS transition, with a static reduced-motion fallback. New status text contains no prayer content, hidden recipients, private account identifiers or billing details.

Buttons use a small 120ms press/release response and a gentle highlight. Ongoing Settings preferences use native checkbox-based switches with a 160ms sliding thumb, visible on/off marks and 50 × 44px input targets. Country/association display, update filters, friend reminders and the reviewed optional box welcome keep their existing temporary state and eligibility rules. Contact-purpose consent, additional recipients and deletion selections remain explicit checkboxes.

The One-time/Monthly selector keeps its native radio group, with one decorative pill moving beneath the labels. Space, Tab and radio Arrow keys remain available; keyboard changes are immediate with visible focus. Pointer hover is limited to fine pointers, reduced motion keeps final selection positions without transitions, and disabled controls remain inactive. The press and selector styling requires no animation library, backend or service. Browser viewport checks cover desktop, 768px, 390px and 320px; these do not establish physical-device or frame-rate performance.

## Boundaries and proposed decisions

### Bug reports and ideas

The feedback page uses the existing pastel paper surfaces and tactile button styles. It accepts a required message of up to 3,000 characters and optional PNG/JPG/WebP pictures (up to three, 5 MB each). Basic client checks cover declared type, file signature, size and browser decoding. Pictures use local blob URLs, with previews/removal and cleanup on removal, a fresh report or leaving the page. These checks are not a production upload or security pipeline.

**Submit creates a temporary browser preview. Nothing is sent, saved, queued or monitored.** Editing retains the draft and selected pictures; starting another or leaving clears them. The page asks for fictional text and non-sensitive sample pictures, with no account/contact fields or automatic diagnostic collection. It is available without signing in so the design also accommodates reporting account-access issues. A real reporting inbox, secure attachment service and delivery require separate backend/service approval. No GitHub issue, email or notification is created. The page and its styles load only when opened; a load failure offers a page reload.

Organizations can optionally add their own website during the fictional ministry signup. The owner can edit or remove it under **Settings → Organization website**, also reached through the organization box's owner-only edit button. The link appears on the public organization box and shared-inbox heading, opens in a new tab and includes the destination domain. It is independent of personal profiles, memberships and anonymous requester identity. The seeded organization uses `https://example.org/` as a fictional example, not a verified church website.

The demo accepts ordinary HTTP/HTTPS addresses, adds HTTPS to a bare domain, and rejects executable schemes, credential-bearing/local addresses and known payment-solicitation examples. It does not fetch previews, import posts, verify site ownership or establish reliable live URL/content screening. A blank value removes the link. Changes remain in React memory and reset on reload.

GitHub Pages serves the static frontend. There is no backend, database, real authentication, contact verification, working CAPTCHA, bot protection, media upload/recording/transcription, AI moderation, model training, email/SMS, payment processor or real financial transaction. Audio/video states and transcripts are UI simulations; no voice is recorded or played. Donation exports are fictional personal records, not tax receipts; entity status and deductibility are unverified.

Confirmed requirements are in revision 4 and the founder’s subsequent screening/donation additions. The exact About/confirmation wording, Scripture edition, future-member retained-history policy, precise block/group confidentiality policy, retention, age/region rules, human review operations, providers, payment eligibility and surplus policy still require production decisions. The World English Bible edition used for review is proposed, sourced and documented in `public/scripture-source-notes.md`.

The founder authorized hosting this fictional frontend on GitHub. Stop for separate explicit founder approval before a backend or real service integration, real accounts, submissions or payments. Production authorization must protect every request, reply, attachment, linked testimony, export and notification at the server; browser visibility is insufficient.

## Design and source material

The founder's revision-4 brief controls; companion copy is proposed. The supplied briefs and the reviewable design/security plans were preserved in the local workspace. They are not part of this public source repository. The public demo keeps proposed copy visibly labeled for review.

Applied available local skills: Sites (local-only workflow), web-design-taste, Emil design engineering, React best practices and animate. The brief’s `frontend-design` and `web-design-guidelines` skills were not installed locally; their official upstream instructions were inspected. No unrelated skill bundle was installed. Rubik is bundled locally with its OFL license. Icons are SVGs; the logo, favicon and hero share a vector redrawing of the founder’s supplied open-box and heart-note motif. The zero-cost shimmer uses CSS transform/opacity for one 300ms pass, with a static gold/rainbow reduced-motion fallback.

The app uses React, TypeScript and Vite without routing, animation, database or service infrastructure packages. The small QR encoder is loaded on demand, with jsQR used only for development tests. All state is in React memory. Donation CSV downloads use a controlled schema with spreadsheet-formula neutralization; QR PNG/SVG downloads contain only the branded box-link card.
