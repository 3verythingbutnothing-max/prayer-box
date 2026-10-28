# Prayer Box: account and community launch brief

Updated October 28, 2026. This is an implementation sequence, not a production-readiness declaration. GitHub stores the source; the public Pages site is still a separate prototype. The Worker configuration remains local-only. No new provider, public intake, payment processing or real-message delivery has been enabled.

## What this increment provides

- The prototype lets authors edit the exact request, update or testimony, preserving the original time and displaying an edited time. Human prayers and encouragement show posting times; authors can edit or remove their own encouragement. A held revision does not silently replace the previously approved text.
- Personal profile pictures are optional after signup, under Profile & settings. The account owner can choose, preview, save, replace or remove a locally normalized picture. Signup adds no photo step. The current picture is owner-only and session-only; no original file is uploaded or published.
- Signed-in example accounts can create prayer groups, choose a rounded-square icon or locally normalized custom picture, edit the name/optional website, invite people, accept/decline invitations, request/withdraw membership, and approve/deny applications. Admins can promote/demote, remove/block/unblock members. Group handles stay stable so shared links continue working.
- Leaving the last admin role offers an explicit successor or the oldest continuously approved, active member, with a stable ID tie-break. Pending, invited, blocked and inactive accounts are excluded. With no eligible successor, the confirmation closes the group. A rejoining member starts a new membership interval. A group cannot lose its last admin through ordinary demotion.
- Local Worker APIs persist group commands with server authorization, recent admin MFA, session rechecks, revision conflicts and an audit record. Creating a group does not verify church authority or enable private intake. The edit endpoint durably holds author-only proposals for manual review; it does not publish them.
- The existing Worker foundation supplies private reads, local sessions, server Turnstile validation, private screenshot quarantine, durable feedback jobs and private receipt notifications.

The interactive prototype still keeps its new state in memory; refreshing resets it. It is not yet connected to these new APIs. New group pages show an empty inbox until the full delivery pipeline is wired. Custom group pictures are local previews, not uploaded or screened media. Authors can cancel a pending proposal through a guarded, idempotent API and submit a fresh proposal. Backend edit approval, connected reply edit/delete and a reviewer interface remain to be built.

## Recommended next steps, in order

### 1. Prove real sign-in and recovery before choosing a provider

The confirmed requirement allows username/password accounts without an email address or telephone number. Run a small identity proof covering all four contact combinations: neither, email only, phone only, both. A candidate is Amazon Cognito configured for usernames and optional contacts. Its standard forgotten-password flow requires a verified contact, so it cannot by itself satisfy contact-free recovery. Do not select it until a separate recovery-kit protocol is proven. [AWS account confirmation and recovery documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html).

Build and independently test: maintained password verification, exact provider-subject mapping, username normalization and uniqueness, enumeration-resistant errors, throttling, Secure/HttpOnly sessions, step-up MFA for admins/staff, session revocation and recovery codes shown once. Store only recovery-code hashes; consume a code atomically, invalidate existing sessions and rotate the kit after recovery. If a managed provider and D1 share this operation, test the crash/retry protocol across both systems. Neither a screenshot nor knowledge of a private prayer should authorize a support reset. A person who loses every approved recovery method may lose the account; explain that before signup.

**Exit evidence:** signup, sign-in, sign-out, optional-contact verification, lost-device recovery, concurrent code reuse, stale/revoked sessions, provider outage, admin MFA and an accessible retry/help route all exercised in isolated staging. No real credentials in fixtures, logs or source control.

### 2. Ship a text-only prayer pilot first

Connect the current design to server-backed request creation, independent deliveries, updates, edits, replies, blocks, deletion and group membership. Keep edits as immutable proposals until a review decision. Publish by comparing the approved base revision and atomically recording the decision; a stale approval must never overwrite newer content. Deletion must withdraw pending proposals and prevent queued notices from exposing deleted content. Connect the author’s pending-proposal cancellation and resubmission controls to the implemented API.

Use a provider evaluation, rather than a blanket claim of automatic safety. OpenAI's standalone moderation endpoint supports text and images; evaluate it as one layer alongside Prayer Box's money-solicitation, payment-handle, spam, harassment and malicious-link rules. Audio and video require their own transcription/frame processing and coverage evaluation. [Official moderation documentation](https://developers.openai.com/api/docs/guides/moderation).

Use specific, understandable reason codes and preserve the user's draft. Make an appeal a private manual-review case, not a public repost. Self-harm language should trigger the separate help/care path, not an automatic account penalty. Validated reports belong in a curated evaluation set with approved retention and data-use rules; they must not automatically retrain a model. Assess false positives for prayer language, quoted abuse, financial hardship without solicitation and multilingual text even while the interface is English-only.

**Exit evidence:** malicious edits, anonymous identity leaks, cross-box reads, blocked/removed-member access, repeated reports, false-positive appeals and concurrent changes all tested. The approved group-history and group-block policies must be settled before real group intake.

### 3. Staff moderation, prayer and care separately

Name an accountable owner and backup for each queue, publish actual staffed hours, define response targets and review who can access each kind of case. Moderators decide policy and appeals; prayer volunteers receive only authorized prayer deliveries; care reviewers handle private support concerns. Admin access to a group does not automatically grant permission to speak as that group or become a safety reviewer.

Build assignment, claim/lease expiry, handoff, escalation, resolution, appeal and audit controls. Show case age and overdue work privately to staff. Protect staff accounts with MFA and periodic access reviews. Confirm professional support resources by region, define safeguarding procedures and explain the limits of the service. Do not promise immediate monitoring, clinical care, a guaranteed human reply or that someone has prayed until the relevant human action actually occurred. Preserve the Trinitarian foundation and the distinction between an automatic acknowledgment and personal prayer.

**Exit evidence:** staffed roster, queue overload exercise, an appeal reversed by a second reviewer, an urgent care concern handled within the published process, and a consented end-to-end delivery test. No email/SMS provider is currently connected.

### 4. Add private media only after a bounded pipeline passes review

Use private R2 quarantine, unpredictable keys, current authorization on every fetch, and separately named immutable approved derivatives. For images: byte/signature checks, safe decoding, pixel limits, metadata removal, malware/content checks and provenance of the source revision and scanner. No SVG uploads or unscreened original delivery. The current local image preview is not a substitute for any server check.

Apply this same pipeline to optional personal profile pictures and group pictures. Replacing a picture requires a new review; retain the previous approved picture until replacement approval, while allowing immediate removal. Only publish an approved derivative within the account's profile visibility. Anonymous content must omit the picture and its identifying URL entirely, including from API output. A profile picture must never be required to finish signup. Production upload, persistence, removal and revocation still need to be connected to the current owner-only preview.

Keep video/audio disabled until duration, frame, transcription, processing-time and spending limits are enforced and tested. Confirm the processor's terms, private-content handling, retention and data regions before sending prayer material. Reconcile D1 records with R2 objects after partial failures; an ambiguous write result must not delete a potentially committed object.

### 5. Rehearse production recovery, then authorize a limited launch

Provision isolated staging/production Workers, D1, private R2, Queues/dead-letter queues and Turnstile with separate secrets and a single application origin. Apply append-only migrations through a reviewed GitHub workflow. Add sanitized error/latency metrics, queue age/dead-letter alerts, storage and spending alarms, uptime checks and a staffed incident route. Never log raw prayer bodies, identity mappings, session tokens or media URLs.

Define acceptable data loss and recovery time, then prove them with a timed restore into quarantine. D1 Time Travel is useful, but it does not restore R2; coordinate database/object recovery, retain deletion and revocation tombstones, reconcile outbox effects and prevent restored queues from duplicating external notices. [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

Test separate application rollback and data restore, a lost secret, failed migration, unavailable identity/screening providers, delayed/duplicate queues, missing objects and disabled intake. Verify at the API and browser that deleted prayers and departed/blocked members stay inaccessible after restore. Record measured throughput/latency and cost during bounded staging load tests; local unit tests do not establish production capacity.

**Exit evidence:** reviewed privacy/terms, retention/deletion and age/region policies; accessible signup/recovery; approved processors and staffing; independent security review; completed restore drill; explicit founder release approval. Start with a small consented text-only cohort. Donations and tax receipts remain a separate launch decision.

## Control coverage and remaining work

| Situation | Current control | Remaining production work |
| --- | --- | --- |
| Typo in own request/update/testimony | Per-post edit; original/edited times; exact-copy scope | Reviewer decisions and API-connected UI |
| Own prayer/encouragement | Timestamp, edit/remove controls in prototype | Authorized server writes and full revision/deletion audit |
| Group creation/details | Name, unique stable handle, optional site, preset/local custom picture | Real identity, publishable screened avatar, dynamic group delivery intake |
| Join/invite | Search by exact group handle; apply/withdraw; approve/deny; invite/accept/decline/cancel | Durable user-facing notices and invitation expiry policy/UI |
| Admin change or departure | Promote/demote; chosen/oldest active successor; confirmed closure when empty | Production notices, organization authority recovery and staff-run inactive-admin procedure |
| Remove/block/rejoin | Admin controls; immediate approved-membership removal; unblock requires fresh approval | Settle group-wide block/history consent policy before intake |
| Individual friendships | Private accept/decline/remove flow, username discovery and pending send/cancel controls | Full per-account server lifecycle, invitation delivery and blocking symmetry |
| Profile/account | Optional personal picture choose/preview/save/replace/remove; existing privacy, language, safety and recovery-design controls | Screened picture persistence/publication, real name/handle change rules, account deletion, contact/recovery/MFA management |
| Other people’s requests/comments | Existing report/block/help controls in prototype | Server enforcement, audited case queue and staffed resolution |

The backend integration specification remains in [BACKEND_INTEGRATION_AND_LAUNCH.md](BACKEND_INTEGRATION_AND_LAUNCH.md). This brief records what is usable locally and the evidence needed to move to real accounts.
