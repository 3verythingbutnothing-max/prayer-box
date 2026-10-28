# Community interface refinements

October 28, 2026. All walkthroughs use fictional browser data; real identity, payment processing and backend deployment remain disabled.

## Changes

- A story with a linked testimony uses the orange stationery surface across its entire card.
- The box hero contains Connect beside Pray with others. It changes to Request sent while pending and Disconnect after acceptance. Disconnect asks for confirmation and explains that a later request needs acceptance again. No prayer activity automatically connects people.
- Removed the hero artwork caption and the explanation about one linked-story card. My Prayers precedes community prayers; Pray with others jumps to the community heading.
- Role selects have a custom caret with space from the border. The group-reply permission is labeled and explained as replying under the organization's name, separate from admin/moderator powers.
- Upload is the first grey picture tile. The palette includes cross and praying-hands icons and five circular gradient choices. Group picture previews retain the existing local normalization and upload limits.
- Pending friendship invitations appear in the New connection requests area above accepted lists. They remain labeled friendship requests because acceptance controls private friendship access; an event connection does not grant that access.
- Removed the My Church introductory sentence. Friend cards and organization cards have explicit View prayer box buttons. New organizations still show their existing empty prayer page until delivery integration is completed.
- Settings includes a username bar with validation and duplicate/reserved-name rejection. Edited handles propagate to connection, group-invite and prayer-recipient searches while keeping stable account/box IDs. Username edits are session-only until real identity integration.
- The local group API and migration support the new bounded icon/color values. Existing settings, versions, archive fields and deletion proposals survive migration; account roles and membership rules are unchanged.

## Verification

- **210** frontend/model tests, **199** local Worker tests and **12** separate privacy-policy tests passed. Both bounded stress/invariant harnesses passed.
- Frontend, Worker and Worker-test types, both builds, whitespace checks and the Worker dry-run passed. Existing lazy Three.js bundle-size warnings remain; no device-performance claim is made.
- Rehearsed migration 0007 against populated SQLite settings, retaining every prior field and passing foreign-key checks. Worker tests exercise icon/color create/edit, default preservation and rejection of unbounded values.
- Browser: request/accept/disconnect and reconnection warning; duplicate username rejection/save and member-list propagation; Upload tile choosing a project PNG, removal, icon/color selection and save; friend box navigation; request placement and the revised page order.
- Document widths match viewport widths at **320, 390, 768, 1010 and 1280** pixels for the box, My Church, settings and organization pages. Dialogs and mobile/desktop screenshots were also inspected. Temporary viewport overrides are reset after testing.

Local screenshots are stored under ignored `output/community-ui/`. Production username reservation/rename audit, published profile pictures, real screening, signup and service delivery still require the existing launch gates.
