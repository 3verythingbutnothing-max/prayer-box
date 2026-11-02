# Registration increment: implementation and activation gates

Updated October 30, 2026. The founder authorized starting real registration; payments remain deferred. This increment implements an account-service path with all activation flags off. It does not open a pilot, provision AWS resources, create real accounts, or connect the full prayer interface to persistent accounts.

## Implemented

- Cognito is the sole password authority. Its private provider identity is an opaque server-generated UUID, separate from the public username. Passwords and provider tokens are not stored in D1, browser storage, application responses or logs.
- Invitation-based, username/password signup with English and an age range. Contacts are optional and are not collected by this increment. Teens remain closed behind a separate safeguarding gate. Signup creates a private profile and personal box plus a one-time recovery kit; it does not silently sign the person in.
- Same-origin signup, sign-in and contact-free recovery forms in the backend bundle. The public GitHub Pages bundle remains the fictional preview. Closed capabilities render no editable credential fields or verification widget.
- Secure/HttpOnly cookies over HTTPS, bootstrap and session CSRF, exact trusted Origin checks, server-validated Turnstile action/hostname, bounded requests/responses, rate limits, current-account/session-epoch checks and session rotation on sign-in.
- Eight high-entropy recovery codes shown once and stored as user-bound SHA-256 hashes. They survive application signing-secret rotation. Successful recovery revokes old application sessions and the old kit, changes the provider password, and requires a fresh sign-in before replacing the kit. Replacement requires a recent sign-in and is rate limited.
- Persisted registration/recovery intents and pre-dispatch provider-write fences. A worker interruption or ambiguous provider mutation blocks automatic replay and requires staff reconciliation. A confirmed non-mutating password-policy rejection permits correction of the original attempt. A known provider success followed by an app commit failure can resume through credential proof.
- Privileged staff, group administrators and moderators cannot use basic sessions. Existing basic sessions also stop working after promotion. The actual MFA enrollment/challenge interface is still required.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/auth/config` | Capability flags and short-lived bootstrap CSRF |
| `POST /api/auth/register` | Single-use invited registration with an idempotency key |
| `POST /api/auth/signin` | Provider password proof followed by an application cookie |
| `POST /api/auth/recover` | Single-use contact-free recovery |
| `POST /api/auth/recovery-kit/rotate` | Authenticated, recent-sign-in replacement kit |
| `POST /api/session/logout` | Existing session revocation and cookie removal |

Migration `0008_registration.sql` creates invitation, identity, operation, recovery-code and staff-role records. It contains no seed users or prayer content. The local-only legacy credential path is unavailable in Cognito mode or outside the local environment.

## Configuration stays closed

`AUTH_PROVIDER=disabled`; registration, sign-in, recovery and teen flags default to `false`. Configuration alone is insufficient: a capability needs valid Cognito settings, scoped managed AWS credentials, an application signing secret, Turnstile configuration and its explicit enable flag. Nonlocal account requests require the configured HTTPS application origin.

See [Cognito setup and provider proof](COGNITO_SETUP.md). The founder has since created the AWS account; [AWS staging setup](AWS_STAGING_SETUP.md) records verified MFA and the prepared resource plan. Provider credentials remain absent from this workspace. Do not paste secrets into chat, commit them, add them to public Vite variables or use real user credentials in test fixtures.

`node scripts/create-registration-invite.mjs` creates private, ignored files only: adult eligibility and a 24-hour lifetime by default, with `--age-band adult|teen` and `--hours 1–168`. The SQL contains a token hash; the separate owner-readable text file contains the raw invitation. The command neither applies SQL nor sends a message. Apply its SQL only to a verified isolated database after provider proof; never attach the private text file to an issue, PR, logs or support ticket. Creating a teen invitation does not enable teen registration.

## Evidence and limits

The account runtime tests use an isolated Workers/D1 database and synthetic identity/Turnstile responses. Adapter tests inspect signed requests and synthetic provider responses. They cover duplicate and late operations, identity mismatches, challenge rejection, CSRF/origin/eligibility failures, invitation races, revocation, rate limits and failure boundaries. These checks are not live AWS signup, delivery, capacity or cross-device proof.

Local validation for the registration increment passed: 270 backend tests, 260 frontend tests, 12 policy tests, frontend bounded stress/invariant checks, application/backend/test typechecks, Pages/backend builds and Worker deployment dry-run. The subsequent staging-compatibility correction passed 274 backend tests (including 36 registration-runtime and 39 Cognito-adapter cases), backend/test typechecks, backend build and Worker dry-run. It preserves opaque provider subjects rather than assuming UUID format. The existing large Three.js chunk warning remains; the dry-run does not deploy or provision resources. Independent source review of the registration increment found and resolved uncertain-mutation replay and privilege-change session races.

Browser checks inspect the public-preview Share box placement and the local backend's closed signup/sign-in/recovery states at 320, 390, 768, 969, 1132 and 1280 CSS pixels. Connected credential forms remain unverified in a live browser until the provider is configured. Physical iPhone Safari remains unverified. Screenshots and measured geometry are local evidence under `output/real-registration/`.

## Required next steps before activation

1. Securely configure an isolated AWS/Cognito Lite pool, restricted IAM principal, application origin and Turnstile widget. Prove username-only creation, no unsolicited messaging and denial of direct public Cognito signup/auth flows. Verify password boundaries against the real pool.
2. Implement and test privileged MFA enrollment/challenges and an audited staff reconciliation procedure. Unknown provider writes must stay locked; no operator should clear `provider_write`/`reconcile` merely because a timeout elapsed. Prove interruption and late-completion cases against staging before permitting recovery.
3. Test real signup, sign-in, logout, kit replacement/recovery and provider outage handling through the connected screens, including cross-device persistence. Add optional verified email/phone setup and recovery only after Resend/Twilio contracts and revocation behavior are implemented.
4. Integrate these account components into the approved full prayer interface and complete the wider privacy, moderation, media, retention, monitoring and restoration gates in [the web pilot contract](WEB_PILOT_EXECUTION.md). The signed-in backend still exposes the existing feedback integration rather than a complete persistent prayer app.
5. Publish actual staffed support hours and a working secure help route. Obtain explicit pilot release approval before inviting real participants. Payments and native apps remain deferred.

Provider-console disable/delete/global-sign-out actions do **not** independently revoke Prayer Box's D1 cookies. For incident handling, suspend the application user, increment the session epoch, revoke application sessions and lock the identity mapping before changing the provider identity; verify both sides afterward. This increment has no automatic provider-to-D1 account-status synchronization. Never reuse a provider subject, remap a public handle to a different subject, or delete an uncertain orphan without a verified subject-bound reconciliation decision.
