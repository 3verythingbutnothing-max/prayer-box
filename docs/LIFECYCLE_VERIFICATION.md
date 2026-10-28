# Edit and group lifecycle verification

October 28, 2026. Local synthetic data only; no production capacity or penetration-test certification is implied.

## Automated checks

- `npm test`: 155 frontend/model tests passed.
- `npm run backend:test`: 132 tests passed in the local Workers runtime with D1/R2 bindings. These include 18 edit/history/cancellation cases and 24 group lifecycle cases.
- `npm run backend:policy`: 12 policy tests passed.
- Frontend, backend and backend-test TypeScript checks passed.
- Both deterministic frontend stress/invariant harnesses passed with no reported violations. They exercise model transitions, not production traffic.
- GitHub Pages and backend builds passed. Worker dry-run bundle passed without deployment. Vite reports the lazy Three.js chunk size warning (about 136.5 KB compressed); it loads only for the short success decoration.
- `git diff --check` passed.

Independent review and regression checks covered exact-delivery author ownership, anonymous DTO boundaries, stale edits, immutable proposal timestamps, pending cancellation/replay, concurrent edit limits, Origin/CSRF checks, membership and personal-block races, MFA revocation, inactive successors, stale admin rosters, ownership handoff and explicit official-reply permission. Owner self-submission checks now follow ownership after a handoff. Promotion does not silently authorize an organization byline.

## Rendered and interaction checks

The tester independently saved and reopened an edited request, verified original/edited timestamps, and exercised a held edit retaining the prior approved words. Screenshots and document-width checks passed at 320, 390, 768, 969 and 1280 pixels. A 320-pixel group creation used an optional blank website and preset icon, then displayed creator-admin controls.

The root reviewer additionally created a group on desktop, changed a group name and website on mobile, verified the stable handle and updated browser title, and completed last-admin departure. Admin controls disappeared after leaving; rejoining required a fresh pending request, which could be withdrawn. The group detail and final handoff dialog were inspected across the same five widths. No document horizontal scrolling was observed. The initially truncated automatic-successor label was shortened; the explanation now wraps below it. Current browser error/warning logs were empty after the group actions. Short feedback animations are implemented with a static fallback, but no physical-device FPS or subjective sound-quality result is claimed.

Local screenshots are in the ignored `output/qa/lifecycle/` directory, including `request-edited-*.jpg`, `group-detail-*.png` and `group-handoff-*.png`. They contain only synthetic examples and are not committed to public source.

## Unverified and launch boundaries

- The browser automation image chooser stalled and was aborted. Custom avatar normalization/upload selection has code and type validation, but this browser interaction is unverified. Preset icons were verified. There is no server avatar publishing/scanning pipeline yet.
- No physical iOS/Android device, assistive-technology device, real identity provider, external message delivery or production restore was tested.
- The new prototype controls still use browser memory; the new guarded Worker APIs are separately tested. Full UI/API integration, new-group prayer delivery, reviewer publication and reply mutations remain launch work.
- Production history/block policy, provider selection, staffing, media processing, backups and founder release approval remain in the [launch brief](LAUNCH_READINESS_BRIEF.md).
