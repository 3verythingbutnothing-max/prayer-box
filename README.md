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
npm run build
```

The domain tests exercise fictional audience intersections, anonymous labels, independent deliveries, church approval/removal, friendship changes, actor blocks, limited screening examples and links under the hosted project path. They cannot prove server authorization or abuse protection. The founder's separate backend/stress-test plan has not been executed.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` installs the locked dependencies, runs the prototype tests and builds the static site before deployment. Pushes to `main` publish to GitHub Pages. The build uses `/prayer-box/` as its base path, following the [Vite GitHub Pages guide](https://vite.dev/guide/static-deploy.html#github-pages).

```sh
npm run build:pages
```

Only `dist/` is deployed. The public repository contains the frontend source, fictional fixtures, bundled font/license and publishing workflow. Original founder briefs, internal design/security plans, local screenshots and exports remain in the local workspace and are excluded from Git. No production data or credentials belong in this repository. The prototype asks search engines not to index it; this is not access control.

## Explore

- Maria’s public box: `/#box/maria` — incoming requests, anonymous display, linked testimonies, composer and separate optional Grace delivery.
- My Box: `/#box/mine` — Elena’s private personal inbox and accepted-friend prayer encouragement.
- My Requests: `/#requests` — author-only delivery list, independent conversations, held requests/appeals, reuse and selected-delivery updates.
- My Church: `/#church` — Elena’s private accepted friends; friendship and organization membership remain separate.
- Grace Church: `/#box/grace` — public box, membership application/invitation and group-access disclosure.
- Shared inbox: `/#inbox` — approved members, assignment conflicts, owner reassignment and work states that do not narrow the audience.
- Member controls: `/#members` — owner-only simulated approval, invitations, removal and official-reply permission.
- About: `/#about` — proposed public copy, confirmed Trinitarian foundation, personal/in-person prayer, Lord’s Prayer guide and 40 fully populated Scripture selections.
- Donations: `/#donations` — truthful $0 initial hosting need, optional fictional positive-cost rainbow example, explicit monthly choice and simulated review.
- My Donations: `/#donation-history` — Elena’s private fictional records, year/date filters, CSV and print/save-PDF, with simulated cancellation.
- Settings: `/#settings` — privacy limits, optional country, associations, recovery fixtures, separate contact consents, reminders and off-by-default reviewed automatic acknowledgments.
- Signup: `/#signup` — read-only example credentials, optional contact fixtures, recovery codes and an explicitly simulated bot-challenge state.
- Review queue: `/#review` — platform-reviewer fixture only; held text/media, appeals, reported evidence and explicit validated-report decisions.

Use **Preview options** to switch fictional viewers, open boundary states, or reset shared demo data. Maria is independently approved by Grace Church. Samuel is the removable member. Elena starts unapproved. The platform-reviewer fixture has no general private-box access. Every browser receives all fixture source data; these controls illustrate the intended rules only.

## Private acknowledgment and care walkthrough

- Every newly accepted request gets a short, contextual first comment from Prayer Box, labeled **Automatic** and **Only you**. It is stored once for that delivery and appears before box welcomes or human replies. It is absent from other viewers' rendered threads and linked testimonies. It does not add a prayer team to the audience or claim that a human read or prayed over the request. The team wording illustrates the founder's planned standing commitment; no live team is notified.
- The composer’s **Support and safety** fictional example opens a dismissible resource panel before submission. The panel includes emergency guidance, Christian encouragement, regional crisis resources and a worldwide directory. Closing it continues the draft review. It never places a call, sends a text or shares prayer content with a provider automatically. The English-language cue rules are limited demo heuristics and can miss context; they are not crisis detection, diagnosis or monitoring.
- **Request safety and care options → This person may need help** creates a separate care case without removing the request, blocking the author or imposing a restriction. A reviewer can preview a discreet author-only in-app note. Existing support offers are deduplicated, and the author can dismiss the note. No real person, clinician, ministry, emergency service, email or phone is contacted.
- The updated palette adds soft blue surfaces and navy controls while retaining lavender prayers, peach testimonies, paper texture and gentle shadows.

The resource links are real, user-initiated support options. Their source checks and region limits are documented in [care resource notes](public/care-resource-notes.md). Human safeguarding responsibility, a real prayer-team commitment and production confidentiality require a separately approved backend and operating process.

## Boundaries and proposed decisions

GitHub Pages serves the static frontend. There is no backend, database, real authentication, contact verification, working CAPTCHA, bot protection, media upload/recording/transcription, AI moderation, model training, email/SMS, payment processor or real financial transaction. Audio/video states and transcripts are UI simulations; no voice is recorded or played. Donation exports are fictional personal records, not tax receipts; entity status and deductibility are unverified.

Confirmed requirements are in revision 4 and the founder’s subsequent screening/donation additions. The exact About/confirmation wording, Scripture edition, future-member retained-history policy, precise block/group confidentiality policy, retention, age/region rules, human review operations, providers, payment eligibility and surplus policy still require production decisions. The World English Bible edition used for review is proposed, sourced and documented in `public/scripture-source-notes.md`.

The founder authorized hosting this fictional frontend on GitHub. Stop for separate explicit founder approval before a backend or real service integration, real accounts, submissions or payments. Production authorization must protect every request, reply, attachment, linked testimony, export and notification at the server; browser visibility is insufficient.

## Design and source material

The founder's revision-4 brief controls; companion copy is proposed. The supplied briefs and the reviewable design/security plans were preserved in the local workspace. They are not part of this public source repository. The public demo keeps proposed copy visibly labeled for review.

Applied available local skills: Sites (local-only workflow), web-design-taste, React best practices and animate. The brief’s `frontend-design` and `web-design-guidelines` skills were not installed locally; their official upstream instructions were inspected. No unrelated skill bundle was installed. Rubik is bundled locally with its OFL license. Icons and the folded-note/box artwork are original SVGs.

The app uses React, TypeScript and Vite without routing, animation, database or service infrastructure packages. All state is in React memory. Local downloads use a controlled CSV schema with spreadsheet-formula neutralization.
