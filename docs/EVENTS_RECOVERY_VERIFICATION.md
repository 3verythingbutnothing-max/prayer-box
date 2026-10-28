# Events, recovery, notifications and monthly funding verification

October 28, 2026. Synthetic local data only. This record is not a production security, load, delivery or device certification.

## Implemented scope

- Browser prototype: consented connection requests, optional post-prayer prompts, prayer events/invitations/calendar copies, monthly funding without goal-based locks, notification choices and phone-banner previews.
- Local Worker: durable connection/event records with current authorization, verified-contact recovery challenges, guarded password reset and session invalidation. The backend-mode recovery form is wired but unavailable without its delivery and verification configuration.
- Everyone in the prototype starts connected to `@prayerbox`. Disconnecting is respected across navigation. Real signup must initialize this once, within the account-creation transaction; ordinary requests and sign-in must never restore an opt-out.
- Connections contain no prayer ID, text, anonymous attribution or interaction provenance. They do not grant friendship, private-prayer access or group membership.

## Automated checks

| Check | Result |
| --- | --- |
| Frontend/domain tests | 209 passed, including 30 event/connection/calendar cases |
| Local Cloudflare Worker tests | 198 passed, including 19 event/connection and 20 recovery cases |
| Separate backend policy matrix | 12 passed |
| Frontend bounded stress harness | 204,863 assertions passed |
| Audience/lifecycle invariant harness | 1,065,102 assertions, zero violations |
| Frontend, backend and backend-test TypeScript | Passed |
| Static Pages and separate backend builds | Passed |
| Generated Worker bindings consistency | Passed |
| Worker dry-run bundle | Passed; no deployment |
| Diff whitespace check | Passed |

The first full Worker test attempt could not bind its localhost ports inside the sandbox. The authorized local-port run completed all 198 tests. Existing Vite warnings about the separately loaded Three.js chunk remain; physical-device animation performance is not measured.

Recovery tests exercise real scrypt hashing in the local Worker runtime, verified-contact eligibility, generic responses, pending/failed delivery, expiry, five guesses, concurrent consumption, contact/version/session-epoch changes, suspension, origin/Turnstile validation and rate limits. Successful reset atomically changes the credential, revokes sessions and invalidates sibling challenges. Review fixes prevent revoked contact snapshots from being used at background-send start and keep failed bot checks from consuming the username quota. The UI clears cached identity/notifications after a successful reset.

Event tests cover pending consent, both-side disconnect, admin MFA, member-only scope, chained canonical reposts, edits/cancellation/dismissal, revocation, blocks, group closure and commit/read races. Calendar tests cover time zones, DST gaps/ambiguity, escaping and UTF-8 line folding.

## Browser checks

- Created a fictional online event with a date, time and meeting link. The resulting card displayed the correct local time and encoded calendar details.
- Tried a payment-soliciting edit. The editor preserved the draft, explained the reason, and left the existing published invitation unchanged. This is limited prototype screening; no human-review queue was falsely claimed.
- Sent a connection request, switched fictional viewers, observed it in the recipient's My Church inbox, accepted it and saw the new connection.
- Disconnected from Prayer Box and confirmed its invitation disappeared. Existing friendships remained separate.
- Sent an anonymous prayer to Maria. After the delivery result, the optional Connect/Not now prompt disclosed profile sharing and the separate anonymous prayer. Choosing Not now created no connection request.
- Saved optional reminder choices and switched the phone preview to “You're awake! We thank God for that.” No browser permission prompt was accepted and no alert was scheduled.
- Confirmed the recovery preview disables credential entry and code sending when its backend is unavailable.
- Reviewed a custom $123.45 recurring contribution while the hosting goal was already met. It remained available and the review correctly stated ongoing monthly authorization, cancellation and no actual charge.

Zero-cost, partially funded and fully funded donation layouts were measured at **320, 390, 768, 969 and 1280 CSS pixels**. The same widths were checked for invitations, connections, notification preferences and recovery. After correcting the overflowing-cup heading at 320 pixels, document width matched viewport width in every measured case. Screenshots were inspected for the donation layout, notification controls/banner, recovery and optional connection prompt. The notification switch's native checkbox styling was corrected. No browser console errors were observed.

Local review images are under ignored `output/events-qa/`. Browser walkthroughs do not establish real email/SMS, payment, native calendar, mobile push or production data persistence.

## Remaining launch work

Follow [LAUNCH_READINESS_BRIEF.md](LAUNCH_READINESS_BRIEF.md). Choose one credential authority, connect signup/sign-in and verified-contact enrollment, integrate email/SMS recovery delivery, prove no-contact recovery and MFA, then connect the group/event prototype controls to their APIs. Add safe own-group repost-management metadata without widening event visibility. Production event screening, notification subscriptions/preferences/delivery, pagination, staffing, retention and restore drills remain required.

The recovery background send is deliberately not represented as a durable outbox. A crash can leave an unusable expiring code; the user must request another. Provider timeout/duplicate delivery, hashing capacity, accessible support and incident handling need staging evidence before real accounts open. Payment processing and treatment of surplus funds require separate integration and approval.
