# Prayer Box web pilot: approved execution contract

Updated October 30, 2026. This records the founder-approved web-first plan and its release gates. It supersedes the native-first schedule and the choices labeled pending below in earlier launch documents. It does not declare the app production-ready or change consent on any existing delivery.

## Current phase and gates

1. **Design completion:** finish responsive screens and test fictional interactions. Real signup, credentials, microphone/camera access, service uploads, provider calls, messages, payments, and pilot registration stay closed. Present screenshots and core flows for founder design sign-off.
2. **Connected staging, implementation started by founder instruction:** connect the approved components to typed APIs and isolated resources; registration code is now implemented with capability flags off and no AWS credentials; prove the real services using test data and authorized test accounts. The minimal backend demonstration is not the intended final interface.
3. **Operational readiness:** configure production providers, staff/support access, monitoring, spending controls, retention and recovery; pass an independent review and a timed restore drill.
4. **Invited web pilot:** obtain explicit founder release approval, begin with ten invited testers, and expand toward fifty only as review capacity and measured costs allow. The first real-user pilot includes photos, recorded prayers and transcripts; it must not open early with simulated media presented as functional.
5. **Proof of concept:** verify that people can create a request, receive permitted encouragement, return and add an update. Collect private, minimal feedback about clarity, trust and willingness to keep using the app. No public popularity metrics.

GitHub remains source control. GitHub Pages remains a separately identified fictional preview. The real application and API will share one HTTPS origin. Native iPhone development, TestFlight, widgets, video and payments are deferred; no Xcode or Apple membership is needed for this web pilot.

## Confirmed product and privacy decisions

- Personal and organization prayer boxes; separate destination-specific deliveries and conversations; linked requests, updates and testimonies; original and edited timestamps; author deletion; private tags; approved membership, roles, connections, reporting, blocking, appeals and care paths.
- **All active approved members** can read new prayers knowingly sent to their whole organization. The sender sees a versioned notice before sending, including that members approved later can read retained organization prayers. A friendship, pending application, invitation, affiliation claim or assignment is not group approval.
- **Blocking** stops direct interaction and hides blocked content in the user's personal box/view. It does not quietly exclude an approved member from a whole-organization delivery. Explain that audience and offer withdrawal of the entire organization copy. Connections never grant general prayer access.
- New notice and consent versions apply only to new or explicitly reauthorized deliveries. Preserve legacy personal, narrower-history and `hold_on_conflict` records; no blanket migration may widen them. Existing backend fixtures using the provisional policy remain test evidence, not the new production policy implementation.
- Anonymous identity is omitted from reader DTOs, bylines, images/URLs, transcripts, media metadata, notifications, shared links and unrelated source/destination records. A voice or identifiable photo can still reveal someone; warn before sending.
- US ages 13+ are intended for the pilot. Include teen personal boxes with private defaults, mutually accepted connections for personal delivery and no unsolicited adult-initiated teen connections. Human-review teen content before visibility. Age declarations are not identity verification. Complete safeguarding and privacy review before admitting minors.
- The founder and a trusted backup operate separate moderation, appeal, prayer and care queues. A different reviewer decides an appeal. Publish actual staffed hours and a functioning support route; do not promise continuous crisis monitoring, clinical care, guaranteed human attention or that someone prayed before the corresponding human action exists.
- Retain approved content until author deletion. Revoke access immediately; purge deleted primary content within seven days and expire backup copies within thirty days. Abandoned uploads expire after seven days; rejected media has a thirty-day appeal window. Respect per-delivery withdrawal without removing unrelated authorized copies.
- Keep the explicit Trinitarian foundation; sincere questions and distress are not misconduct. Ambiguous doctrinal cases need human review. Automatic receipts remain labeled automatic and are separate from human encouragement.

## Short account and service contract

Signup asks for username/password, age eligibility and English. Recovery contact setup is optional; profile pictures and descriptions remain optional afterward. The current design phase uses fictional fixed values and no real credential collection. Request media uses synthetic samples only. Existing profile/group/feedback picture controls are local previews with explicit notices; use invented or nonpersonal images, and no files are uploaded to a service.

Planned providers are Cognito Lite as the sole password authority, Resend transactional email, Twilio Verify optional phone verification/recovery, and Cloudflare Workers AI transcription/screening triage. D1 stores application records and permissions, not a competing password store. The contact-free Cognito signup/recovery-kit protocol is a required proof before connecting identity; no synthetic email addresses or silently mandatory contacts.

Real sessions require Secure/HttpOnly cookies, trusted Origin/CSRF enforcement, current account/session checks and admin/reviewer MFA. Recovery must be enumeration-resistant, bounded and atomic; successful recovery invalidates old sessions. Do not retain the old local credential path as an independently usable second authority.

Use Workers, D1, private R2, Queues/dead-letter queues, server-validated Turnstile and append-only migrations. No public R2 bucket, browser-stored provider secret, client-asserted screening result or URL-based authorization. Queue messages carry IDs only and recheck access, deletion and consent before effects.

## Web media and transcript contract

- Request microphone access only after Record; camera capture only after Take Photo; use the system file/photo picker for Choose Photos. No permissions at signup. Denial, cancellation, interruption and upload failure preserve a usable draft and offer a text alternative.
- Capability-test recorder MIME support; do not assume one codec works in iPhone Safari and every desktop browser. Stop microphone tracks on stop, composer exit and interruption. Never record, autoplay or upload automatically.
- Limit each post to three photos, five MiB each after preparation, and one audio recording up to 180 seconds/ten MiB. Apply the same controls to requests, encouragement, updates and testimonies. Video remains disabled.
- Audio workflow: record, playback, explicit private upload, English transcription, author confirmation/correction, screening, human review, publication. Cloudflare-hosted Whisper Large V3 Turbo is the planned ASR model. Label automatic transcripts, retain revisions and never invent, summarize or rewrite a person's prayer. Treat silence and unclear speech as incomplete, not a reason to fabricate text.
- Keep original and corrected transcripts tied to the exact immutable audio revision. Review audio itself as well as text; a clean transcript is not media approval. Every pilot photo/audio needs a human approval. Flagged theology, safety and contextual cases go to trained people, not keyword-only automatic bans.
- Safely decode/normalize raster images, remove metadata, validate bytes and limits, and publish only approved derivatives. Store originals in private quarantine. Use authorization for every media/transcript read and prevent anonymous filename/owner leaks.
- Typed media capabilities cover allocate/upload/complete, author status and transcript draft, version-checked transcript correction, exact-post attachment and approved content retrieval. Distinguish uploading, processing, awaiting confirmation, awaiting review, approved, rejected, failed and deleted. Duplicate/reordered jobs and outages cannot publish unchecked content or duplicate sends.

## Design and launch verification

The coordinated design pass covers signup/recovery, My Box, My Requests, My Church, Events, settings, request details, help, feedback and staff review. Preserve pastel textures, larger accessible typography, lavender actions, clear dates and orange update/testimony cards. Separate preview scenario controls from ordinary forms. A pending attachment must not produce an overall delivered-success claim. Every submittal gets truthful visual feedback with optional sound/tactile feedback that never blocks the action.

Inspect at 320, 390, 768, 969, 1132 and 1280 CSS pixels. Root records actual screenshots, interaction checks and any defects; this document does not certify those checks. Physical iPhone Safari testing remains a separate requirement and cannot be claimed from desktop emulation.

Before pilot opening, prove cross-device persistence, direct-API anonymity and separate-delivery checks, membership/block revocation, permission denial, transcript correction, interrupted uploads, provider outages, duplicate jobs, deletion during processing and restore behavior. Restore D1 and R2 together into quarantine; replay deletion/revocation tombstones before access and prevent duplicate external messages. Verify rollback separately from data restoration.

## Budget and deferred spending

The services budget is $50–$150/month, with an initial $100 reserve; the earlier $65–$85 example remains an illustrative workload model, not a bill or proven capacity. Human review, development, professional reviews and taxes are separate. Apple membership spending is deferred.

Alert at $75 and $100 and guard discretionary processing/SMS at a projected $125. Preserve reading, deletion, blocking, support and recovery alternatives during a spending pause. Application-side guards cannot guarantee an exact provider bill.

Pricing references used for the approved plan: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/), [Queues](https://developers.cloudflare.com/queues/platform/pricing/), [Whisper](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/), [Cognito](https://aws.amazon.com/cognito/pricing/), [Resend](https://resend.com/pricing), and [Twilio Verify](https://www.twilio.com/en-us/verify/pricing). Recheck prices and processor terms before provisioning; content-processing and retention settings need review as well as price.

## Design increment verified October 30, 2026

Implemented for fictional design review: short signup, optional sample-contact verification, sign-in/recovery and replacement-kit states, deletion review/confirmation, shared photo/audio/transcript controls on requests, responses and linked updates, and session-only author/staff review queues. Media requests and updates stay unpublished pending simulated human approval. Responses preserve exact delivery/post/parent scope, reject duplicate pending submissions, and count as prayed only after approval. Queue approval rechecks current visibility, blocks, membership and posting permissions. These frontend checks are design logic, not production security.

The browser pass captured My Box, My Requests, My Church, Events, settings, help, feedback, signup, recovery and phone instructions at all six agreed widths, plus request details, staff review and the transcript composer. No horizontal scrolling was detected in these 78 layout checks; dialogs also stayed within their horizontal bounds. Screenshots were inspected, including the smallest mobile and larger desktop layouts. Evidence is kept locally under `output/web-pilot-design/` (not committed).

Interactive checks covered under-13 blocking, teen private-default explanation, optional sample-email verification, recovery-kit replacement acknowledgement, deletion confirmation, microphone denial preserving the text draft, photos with audio, corrected transcript revision/confirmation, returning from preview without losing media, upload failure/retry, pending request/update status, response queue persistence across navigation, duplicate rejection and exact-conversation approval. Independent source review caught and resolved focus, stale policy wording, response-queue persistence and character-limit inconsistencies.

Validation: 249 frontend tests pass, including media lifecycle/review guards; bounded fictional domain stress and invariant checks pass; Pages and backend-mode builds and backend typecheck pass. The existing large Three.js bundle warning remains. No provider integration, production authorization, real upload/recording/transcription, capacity, spending guard, backup restore, cross-device persistence or physical iPhone Safari result is certified by this increment. Physical Safari and all connected staging/operations checks remain required before the invited pilot.
