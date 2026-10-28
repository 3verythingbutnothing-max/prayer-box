# Prayer Box backend integration and launch

Status: implementation has started; local and synthetic only. The stack is **Cloudflare Workers + D1 + private R2 + Queues + Turnstile**. There is no Zapier dependency. GitHub remains source control, and the existing GitHub Pages site remains the fictional design preview.

The founder authorized backend development. This increment does not open sign-up, create Cloudflare resources, deploy a backend, connect paid services, collect real prayers, or accept donations. The production budget is still unpriced; the preview's zero-cost donation state is not a production hosting estimate.

## Architecture and first increment

```mermaid
flowchart LR
    Browser[Same-origin React UI] --> Worker[Worker API and static assets]
    Worker --> Verify[Turnstile Siteverify]
    Worker --> DB[(D1: sessions, delivery policy, reports, outbox)]
    Worker --> R2[(Private R2 quarantine and derivatives)]
    DB --> Dispatcher[Scheduled outbox dispatcher]
    Dispatcher --> Queue[Queues: identifiers only]
    Queue --> Consumer[Idempotent consumer]
    Consumer --> DB
    Consumer --> Cases[Durable manual-review cases]
```

The backend build retains the current soft blue/pastel surfaces, logo, typography and submission feedback. Its first connected UI is a private feedback form, attachments and in-app receipt notifications. It does not import the prototype's example accounts or prayers. The prototype remains a separate build.

| Area | Implemented in this increment | Still required before real use |
| --- | --- | --- |
| Identity | Hashed sessions, expiry/revocation/epoch checks, Origin/CSRF, logout; local verified-contact code recovery and password-hash verification tests | Real signup/sign-in, verified-contact enrollment, delivery binding, identity authority decision, MFA and contact-free recovery kit |
| Privacy | D1 delivery/post/reply boundaries; current approval and block checks; anonymous DTO allowlists; protected GET routes | Complete request/reply writes, edit approval, consent records and API/UI migration; group lifecycle commands and held edit proposals are now implemented locally |
| Bot protection | Server Siteverify; exact hostname/action; timeout/failure denial; bounded JSON; per-account rate counters | Real widget/domain/secret, edge abuse controls, accessible staffed recovery/help process and provider outage drill |
| Feedback | Authenticated, idempotent database submission; durable triage jobs; owner-only reads | Staff interface, assignment/resolution and operational response policy |
| Media | PNG/JPEG/WebP screenshot admission, private quarantine, bounded upload, manual hold, authorized derivative gateway | Safe decoding/normalization, metadata stripping, malware/content screening, derivative provenance, staffed appeals; audio/video remain disabled |
| Connections and events | Pending connection requests/acceptance, private canonical event invitations, scoped reposts, edit/cancel/dismiss and revocation guards in local D1 | API-connected UI, signup-only default team connection, privacy-preserving repost management listing, pagination/capacity and screening review |
| Jobs and notices | Transactional outbox, IDs-only transport, lease/duplicate/retry protection, failure cases, private in-app notices | Production queues/alerts, operator dashboard, retention/reconciliation jobs, full prayer/care jobs |
| Operations | Local configuration, migrations, runtime tests and GitHub check workflow | Separate staging/production resources, restore drill, secret lifecycle, monitoring, incident procedures and launch approval |

## Request edits and group lifecycle increment

See [the launch readiness brief](LAUNCH_READINESS_BRIEF.md) for the current controls, provider recommendations and remaining gates. New append-only migrations add immutable author edit proposals and versioned group lifecycle/audit records. The prototype now supports per-post editing and timestamps, group creation/details, invitations, approvals, delegated admins/moderators and explicit or moderator-first succession. These prototype controls remain separate from the API build. The group moderation increment adds private decision notices, exact group-copy content removal and unanimous current-admin deletion proposals. See [moderation verification](GROUP_MODERATION_VERIFICATION.md) for permission boundaries and evidence.

`POST /api/deliveries/:deliveryId/posts/:postId/edits` stores an author-only pending proposal after current-session, exact-delivery and revision checks; approved text remains unchanged. `GET` on the same path returns only that author's proposals. Group APIs use guarded revision writes and recent MFA for administrative mutations. New groups are unverified and do not open private prayer intake. No scanner or reviewer can publish an edit yet. Reply edit/delete remain prototype controls. This is deliberately not a production completion claim.

## Identity and recovery contract

The account requirement permits a username and password without requiring an email address or telephone number. The local foundation now implements `POST /api/recovery/start` and `/api/recovery/complete`, a maintained-runtime scrypt password hash/verification helper, and synthetic Workers/D1 tests. Real signup, sign-in, verified-contact enrollment, MFA, and account settings integration are still absent. Choose one authoritative credential system before connecting login and reset; do not introduce independent provider and D1 passwords that can diverge.

Recovery start accepts a username and selected email/phone channel, never a destination supplied by the caller. It uses only a stored, current verified contact, requires server Turnstile validation, and gives the same public response for eligible and ineligible accounts. Eight-digit codes are kept as challenge-specific HMACs with a ten-minute expiry, five-guess limit, and account/IP throttling. Completing an eligible challenge atomically changes the password hash, consumes the challenge, advances the account session epoch, revokes sessions and invalidates other challenges. Tests exercise synthetic email/phone delivery, wrong/expired/reused codes, concurrent completion, contact changes, account/session revocation, and failure paths.

No real email or SMS is sent: `RECOVERY_DELIVERY`, recovery secrets and live verification configuration are not connected. The browser reports recovery unavailable until the required configuration exists. The private service-binding contract carries a challenge ID as an idempotency key; its production implementation must enforce destination handling, delivery retry limits and secret/log redaction. Delivery currently runs through the request lifecycle, not a durable recovery outbox. A crash after sending but before marking the challenge ready can leave an unusable code that expires; the person must request a new code. Prove this ambiguous-send case, provider timeout/outage, expiry during delivery or hashing, duplicate provider requests and retry UX in staging before enabling it. Measure scrypt CPU, memory, concurrent-reset capacity and abuse cost on the actual Worker plan.

The contact-free recovery kit remains unimplemented. Before selecting and connecting an identity authority, demonstrate username uniqueness and safe normalization, enumeration-resistant sign-in/recovery, password/session protections, optional verified contact methods, and usable single-use recovery codes for people without contacts. Prove atomic consumption of recovery codes, session-epoch invalidation after recovery, session revocation and administrative MFA. Keep the provider's subject mapping internal. Do not put provider tokens in local storage or URLs.

Production sessions must use a Secure, HttpOnly, SameSite cookie scoped to the application origin. The local-only session fixture uses an HTTP localhost cookie. Mutation requests require the trusted Origin and a session-bound CSRF token. MFA and a recent authentication event are required for sensitive administrative commands; no browser-supplied role or membership field can grant access.

The checked-in configuration refuses requests to non-loopback hosts while `APP_ENV=local`. There is no development-login endpoint. Creating a public configuration requires deliberate new environment bindings and an identity implementation, not changing a browser toggle.

## Consented connections and prayer events

Every ordinary connection starts as a request and requires the other person or the group’s current admin to accept. Pending requests can be declined or withdrawn. Neither named nor anonymous prayer activity creates a connection automatically, and connection records contain no prayer ID, text, anonymity flag or interaction provenance. Connections control event invitations only; they do not grant friendship, private prayer access, profile visibility or group membership. Either endpoint may end an accepted connection. Only the endpoint that ended it can initiate a new request, which still needs fresh acceptance. Group-side actions require current admin rights and recent MFA, including after an admin changes.

The intended signup default is a connection to the official `@prayerbox` profile. The shared initialization helper models that single exception and permits opting out. It is not connected to a real signup transaction and must never run on a prayer submission, refresh, or ordinary sign-in to restore a removed connection. Provision and verify the official account identity before wiring it.

| Local route | Purpose |
| --- | --- |
| `GET /api/connections`; `POST /api/connections/request` | Private connection list and pending request; explicit person/group target, optional managed group sender |
| `POST /api/connections/:id/actions` | Accept, decline, withdraw or end with expected version; URL-encode the connection ID |
| `GET/POST /api/prayer-events`; `GET /api/prayer-events/:id` | Authorized event list, creation and canonical detail |
| `POST /api/prayer-events/:id/edit` or `/cancel` | Host edit/cancellation with expected version |
| `POST /api/prayer-events/:id/repost` | Canonical reference to the person’s connections or a group they administer |
| `POST /api/prayer-events/:id/shares/:shareId/revoke` | Withdraw an owned/managed repost and invalidate downstream access |
| `GET /api/prayer-invitations`; `POST /api/prayer-events/:id/dismiss` | Private derived invitation list and durable personal dismissal |

Events support virtual or in-person details, a title/description, optional HTTPS information link, a meeting URL or address, start/end and a named time zone. Group publication requires current admin MFA. Members-only events stay within currently approved group membership and cannot be reposted. A connections event must explicitly allow reposting before it can be shared. Reposts preserve one canonical event and origin, deduplicate an active destination, and validate their source chain. Edits propagate; cancellation retains the cancellation notice while the API omits the meeting URL/address. Blocks, disconnections, revoked source shares, inactive accounts and closed groups are rechecked on subsequent reads. These records never broaden access to the original prayers.

The foundation stores events, connections, shares and dismissals in D1; invitations are derived privately at read time. It does not fan out email/SMS or push alerts. Current safety bounds are 40 stored shares per event, 60 event candidates per list, 200 listed connections and 2,000 scoped connection/member records; rate limits also apply. Add cursor pagination, retention and measured load/cost limits before expanding the cohort. These bounds are not production capacity measurements. A new group admin can revoke a known repost ID but may not see it in the event list without original-audience access; finish a safe management-metadata endpoint rather than exposing private meeting details. The current prototype screens are not connected to these APIs.

## Donation availability

One-time/custom and monthly donation choices remain available regardless of whether the displayed hosting need is funded. The earlier three-month funding lock and funding-gap cap no longer apply. Illustrative meters are not production hosting estimates. Payment processing, recurring billing, verified receipts/tax treatment, refunds and donor-data handling remain a separately approved integration; no real payment is accepted by the current app.

## Server-enforced prayer privacy and church membership

An internal authored source can have multiple independent deliveries. Each delivery owns its own posts, replies, attachments and audience. A personal copy never inherits church replies, and adding another box never copies a private conversation. The API returns only allowlisted presentation fields; anonymous readers never receive author IDs, source IDs, other delivery IDs, private acknowledgments or identifying profile links.

Owners cannot submit to their own personal or organization box; ordinary approved church members can submit to a church they do not own. Private personal deliveries are available to the sender and intended recipient. Church delivery access requires currently approved membership and a current active account. An invitation, pending application, friendship, visible organization page or official-reply badge does not grant membership. Revoked membership loses subsequent API/media access. Assignment organizes work without narrowing the approved-member audience. Public and friends views must satisfy all author, box and delivery privacy ceilings and block rules.

Every update and reply is scoped to an exact delivery and story post. Foreign keys prevent a reply or media item from pointing into another box's post. Screening status and deletion are checked on reads. Writes will additionally need transactional authorization and revision checks. Private acknowledgments remain author-only and explicitly automatic; they must never falsely claim that a human has read or prayed over a request.

Two policy choices remain pending: whether newly approved church members see retained history, and how account blocking interacts with organization-wide membership access. The local fixtures explicitly exercise both history policies. The provisional `hold_on_conflict` fixture withholds the whole organization copy when a member/author block conflicts with group access; it is not a founder-approved production decision. Real organization intake stays closed until the notice, consent and policy are settled.

## Bot verification, admission and accessible help

The server calls the fixed Siteverify endpoint and requires `success: true`, the expected action, and an exact allowed hostname. The client cannot assert success. Missing configuration, reused/expired tokens, a provider outage, malformed replies and wrong hostname/action all fail closed. A failed verification preserves the draft and offers retry/help; the Help page does not silently bypass the checker.

Feedback JSON is limited to 16 KiB and 3,000 message characters, with a 20-second body-read deadline. Screenshot body reads have a 60-second deadline. Only the category, body and verification token are accepted. Five new verification attempts per account per ten-minute fixed window limit this initial flow. Uploads use their own account limit and a hard per-report cap. These application limits supplement, rather than replace, production edge/request-volume controls. The exact production limits and identity/IP risk policy require traffic measurements and an accessibility review.

Idempotency keys are scoped to the authenticated account. The request hash excludes the transient bot token, so a retry cannot create a duplicate report or conflict merely because the widget renewed. Changed content with the same key is rejected. Each report and its durable job are committed together. The upload endpoint requires a current session and ownership of an already accepted report; it does not open a separate anonymous upload channel.

Before launch, provide an actually staffed support route and a documented independently verified alternative for users who cannot complete the widget. Do not invent a fallback contact address or use a client-side bypass. Test keyboard, screen-reader, blocked-script, expired-token, slow-network and provider-outage paths.

## Private media, screening, appeals and care

The current upload scope is feedback screenshots only: up to three pictures, each at most 5 MiB, in PNG/JPEG/WebP format. Streaming byte limits and basic signature checks reject obviously invalid formats. These checks are not malware screening or safe image normalization. Originals are stored privately under unpredictable quarantine keys and are never served by the media endpoint.

The gateway only permits approved, separately named `normalized/` derivatives after current ownership or exact-post authorization. It ignores Range and serves a full bounded image with private/no-store headers. There is no public bucket, public object URL, direct client storage credential or presigned download. No current worker can approve an upload; without a qualified scanner/normalizer, the durable job creates a manual-review hold. Neither the existence of a case nor a successful upload means staff have reviewed it.

The next media migration must record the derivative's own content type, byte length, digest, source revision, scanner/version and disposition. The pipeline must decode safely, enforce pixel/frame/duration budgets, strip metadata, isolate processing, screen text/OCR/transcripts/frames as applicable, and publish only the approved immutable derivative. Audio/video remain off until this exists for those formats. R2 and D1 are not one transaction: reconcile orphan objects and missing references; never delete a potentially committed object after an ambiguous database failure.

Reports, spam detection, money-solicitation checks and appeals need stable reason codes, evidence tied to an exact revision, human decisions, auditing and staff access limited to the case. Appeals must not require reposting content publicly. Validated reports can become a curated, consent/retention-reviewed evaluation set; never automatically retrain on every report or send private prayers to a model vendor without an approved data-processing policy.

Care requests remain separate from abuse violations. Mentioning self-harm must offer relevant professional support without automatically penalizing or publicly labeling the person. Prayer-team, moderation and care roles are separate. No reviewer has general private-inbox access by default. Staff the queues, document safeguarding and escalation boundaries, verify regional help resources, and disclose that Prayer Box is not monitored as an emergency service. Keep Christian encouragement alongside practical support and the confirmed Trinitarian foundation: one God, Father, Son and Holy Spirit. The companion About copy remains proposed where it has not been approved.

## Durable notifications and operational delivery

Workers commit an outbox row in the same D1 transaction as the originating report. A scheduled dispatcher sends only the job ID. Queue delivery may repeat or arrive out of order; the consumer uses durable leases, guarded writes and unique effects. A duplicate must not create duplicate notices or override a completed job. Expired leases can be retried. Exhausted processing attempts and transport dead letters create durable review cases; ordinary send failures retain an outbox error and scheduled retry. Operators must monitor and resolve these failure states.

Notifications are stored privately. Resource receipts recheck the current owning resource before display; deleted resources and inactive recipients cannot expose their content. Private group role, removal and closure notices remain readable by their active recipient after membership ends, so the person can understand the decision. Initial notices contain generic receipt/status wording, not prayer text. Optional notification choices and phone previews are interface state only; they do not enroll a device or deliver a notification. Email, SMS, web push, external bug trackers and Zapier are not connected. Recovery has a tested service-binding contract but no configured delivery service. A later integration must have separate notification consent, verified destinations, sanitized payloads, idempotency and verified real delivery; an account-recovery contact is not automatic permission for prayer or event notifications.

## Local development and source control

Use Node 24 and the pinned lockfile. No real credentials are required for the tests.

```sh
npm ci
npm run backend:types
npm run backend:check
npm run backend:test:check
npm run backend:policy
npm run backend:build
npm run backend:test
npm run backend:migrate
npm run backend:seed
npm run backend:dev
```

Open `http://localhost:8787/`. Browser asset requests to the emulator’s displayed `127.0.0.1` address redirect to this canonical origin; API mutation Origin checks stay exact. The seed helper writes a one-hour synthetic session to ignored `output/backend-local/session.json`; it never creates a real account or exposes a token in a public login route. The browser starts signed out. API tests install synthetic sessions directly in their isolated local databases. Missing Turnstile configuration correctly disables UI submission; runtime tests inject deterministic Siteverify responses at the handler seam, not through a production request parameter.

Wrangler does not automatically run scheduled handlers locally. After a synthetic accepted report, trigger the local dispatcher at `http://localhost:8787/cdn-cgi/local/scheduled` to exercise receipt delivery; runtime tests exercise the actual local Queue binding as well. Production dispatch is configured for every five minutes, and latency should be measured before choosing a pilot interval.

`backend:dry-run` validates the bundle without deploying. Every migration is append-only once shared. Never edit an applied migration to fix live data. Separate staging and production D1/R2/Queue bindings, a proper custom application origin, secrets and an approved deployment workflow are future work. The placeholder local database identifier is deliberately not a provisioned resource.

The backend GitHub workflow runs type generation/checks, local runtime tests, policy tests, frontend checks and a dry-run bundle. It has read-only repository permissions and no deployment credentials. GitHub Pages continues to build the prototype on main. Backend work is reviewed on a `codex/` branch before merging. Do not commit `.dev.vars`, `.env` files, local databases, token fixtures, uploaded screenshots, founder briefs or private evidence.

## Verification and launch sequence

| Gate | Required evidence before advancing |
| --- | --- |
| 1. Local foundation | Real Workers-runtime tests with local D1/R2, deny-by-default privacy matrix, duplicate/race tests, failure/retry tests, independent review, both frontend builds and visual inspection |
| 2. Identity and policy proof | Chosen credential authority, real signup/sign-in/contact enrollment, recovery delivery/kit/MFA tests; approved membership history/block policy, age/region rules, retention, consent wording and role responsibilities |
| 3. Staging text flow | Isolated provisioned resources; real auth/Turnstile; request/update/reply/delete and membership commands; source-to-delivery isolation; post-specific conversations; audited moderation/appeals; real staff queues |
| 4. Operations readiness | Named owners, measurable queue/error alerts, support route, privacy/terms, access reviews, secret rotation, deletion/tombstone jobs, staging load tests and restore exercise |
| 5. Limited pilot | Explicit founder release approval, consented testers, verified end-to-end delivery, actual moderation/prayer/care staffing and incident response; text-only if media is unfinished |
| 6. Public launch | Pilot findings resolved, final accessibility/security review, forecast costs and operational capacity approved; payments remain separately gated |

Stress tests must be bounded to isolated synthetic environments. Cover cross-account/direct-ID access, exact-post and organization boundaries, revoked/expired sessions, stale membership, block/privacy changes, concurrent idempotency requests, upload size/type/cap races, malformed/chunked/slow requests, queue duplication/reordering, connection acceptance/revocation races, private event repost chains, canonical cancellation, recovery delivery crash/expiry/retry and hashing load, partial provider outages and resource exhaustion. Record throughput, latency, rejected traffic, costs and unresolved findings. Local tests do not establish production capacity or constitute a penetration-test certification.

Backups must cover D1 and R2 together. Define recovery-point and recovery-time objectives, backup retention and permitted operators, then restore into a quarantined environment and reconcile objects, source revisions and deletion tombstones before enabling access. D1 Time Travel is useful but does not restore R2 or undo external messages. Test data recovery and application rollback separately. Suspend intake and queue delivery if an incident could violate privacy; do not roll back data to resurrect revoked membership or deleted prayers.

Enable structured metrics for error categories, latency, verification failures, queue age/retries/dead letters and storage growth. Do not log session tokens, credentials, raw bodies, anonymous identity mappings or media URLs. Invocation logging is disabled in the local configuration; traces and any future provider logs still require a privacy review. Set cost/usage alarms before enabling uploads or processors. Establish a staffed on-call route and rehearse a provider outage, stolen-session response, erroneous disclosure and backup restoration.

## Primary technical references

- [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): server validation, token lifetime/reuse and result fields.
- [Workers static-asset SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/): Worker-first routing applies the local-host guard, canonical-origin redirect and security headers before API/media handling or SPA assets.
- [Workers local development](https://developers.cloudflare.com/workers/local-development/): local bindings and execution boundaries.
- [Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/): actual Workers-runtime tests and local resource bindings.
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [read replication and sessions](https://developers.cloudflare.com/d1/best-practices/read-replication/), and [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
- [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) and [dead-letter queues](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/).
- [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/): public access is deliberately not configured for private attachments.
