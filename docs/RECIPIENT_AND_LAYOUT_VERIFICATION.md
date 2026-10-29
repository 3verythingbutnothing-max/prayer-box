# Recipient selection and layout refinements

October 29, 2026. This release changes the fictional GitHub Pages preview only. Real sign-in, payment processing, media publication, message delivery, and backend deployment remain disabled.

## Behavior

- Recipient buttons stay in place with a checked state. Selecting a person preserves the search query and leaves focus on the selected button. Keyboard chip removal returns focus to the corresponding result, or search when that result is absent; pointer removal does not focus search.
- Suggestions include only the current account's active, approved community memberships. A friend's affiliation does not create a membership suggestion. Pending, invited, inactive, blocked and archived memberships are excluded. Choosing a community is optional and retains the separate-delivery audience and anonymity controls.
- Own boxes remain unavailable. Grace Church has an existing request route; other newly created groups remain visibly unavailable for request delivery until that integration exists. No new delivery route is simulated as working.
- Personal owners can edit a 280-character plain-text box description from their box or settings. Active group admins can edit their group's description from its page (or the Grace inbox). Visitors see the saved description without editing controls. Blank restores the default welcome; unsaved edits can be kept or discarded. Existing example screening prevents flagged drafts from replacing the saved description. Descriptions remain in local React state and clear on refresh/reset; this is not durable profile storage or production authorization/screening.
- Removed the story-trail caption while retaining its dated navigation. Event meeting/information link rows center their icons without changing multiline date/address rows.
- My Requests toolbar and cards share the same maximum width and left/right edges. Friend cards show @usernames, with accepted status separate from their actions. Custom contribution choices use the same dimensions as preset amounts, including selected states.

## Verification

- Pages TypeScript/build and Worker type checking pass. All 226 frontend/domain tests pass, including four added community membership/search checks. Existing bounded local stress/invariant checks pass; they do not establish production load/security readiness.
- Browser walkthroughs cover mouse and keyboard recipient selection, retained query, stable keyboard scroll position, chip removal, optional Grace selection and its approved-member disclosure, own-box exclusion, and mobile recipient focus.
- Description walkthroughs cover save, visitor display, owner/admin-only controls, cancel/keep editing, draft preservation, screening refusal, 270-character content, blank reset, and keyboard focus. A new-group description was also saved on its group page.
- My Requests, My Church, Events and Donations were measured at 320, 390, 768, 969, 1132 and 1280 CSS pixels: no page horizontal overflow, no friend copy/action collisions, identical toolbar/card edges, and equal contribution-choice dimensions. At every measured width, all four amount choices are 58px tall.
- Desktop friend cards, mobile friend/event layouts, the narrow description editor, and story date navigation were visually inspected. Mobile meeting icon and link centers matched. Desktop emulation does not establish physical-phone keyboard behavior or performance.

The existing lazy Three.js bundle-size warning remains. No new service, API, funding rule, payment or infrastructure integration is introduced.
