# Group roles, removal and unanimous deletion

This increment is local development on the backend-foundation branch. The interactive React prototype keeps its state in memory. The Worker APIs persist the same permissions and decisions in local D1, but the group screens are not yet connected to those APIs. No real identity, production intake, external message delivery, provider provisioning or deployment is enabled.

## Permission boundaries

| Action | Admin | Moderator | Ordinary member |
| --- | --- | --- | --- |
| Approve or deny a join request | Yes | Yes | No |
| Remove an ordinary member | Yes | Yes | No |
| Remove an admin | Demote first; last-admin guard applies | No | No |
| Remove another moderator | Yes | No | No |
| Grant or change roles | Yes | No | No |
| Invite, block/unblock, edit group settings | Yes | No | No |
| Remove another person's group request, update or encouragement | Yes, in that exact group | Yes, in that exact group | No |
| Reply in the organization's name | Separate explicit permission | Separate explicit permission | Separate explicit permission |
| Propose, approve or cancel group deletion | Yes | No | No |
| Leave or manage one's own words | Yes | Yes | Yes |

The automatic last-admin successor is the longest-serving active moderator, then the oldest active continuous member if no moderator qualifies. Pending, invited, blocked, inactive or future-dated memberships cannot inherit control. An explicitly chosen eligible successor remains available. Leaving cannot silently close a group that has another inactive admin whose deletion agreement is missing.

Group deletion is a closure, not a claim of immediate permanent erasure. One admin confirms directly. Multiple admins must approve the same proposal; any admin can cancel. Changing the admin roster cancels its votes. Inactive approved admins remain in the quorum. Final closure revokes the group's access, removes active/pending/invited memberships, cancels pending edit proposals and revokes group media. Other groups, personal accounts and deliveries elsewhere remain intact. Retention, purge and restore procedures remain launch requirements.

## Content and notices

Group removal requires a reason and the current revision. Removing a request hides that group delivery and its conversation. Removing an update affects that post; removing a prayer/encouragement affects that reply and hides its descendants. A moderator's action does not change another box's copy or publish an anonymous author's identity. Own words use the separate author edit/delete controls.

Private notices explain approvals, declined applications, removals, role changes, handoffs and group closure. They remain available to their recipient after membership ends, contain no prayer text, and have private read receipts. Original membership/posting times remain recorded; moderator tenure is separate. Group moderation does not grant platform safety-review or care-case access. The policy copy welcomes sincere questions, grief and requests for help while preserving the Trinitarian foundation and prohibiting harassment, hate, scams and privacy violations.

The new endpoints are `POST /api/groups/:groupId/removals`, `GET /api/group-notices` and `POST /api/group-notices/:noticeId/read`; encode notice IDs when building the read URL. Existing group action routes also accept role and deletion commands. Administrative mutations require recent MFA, exact Origin/CSRF, a current session and current membership. D1 transactions compare access/content snapshots before changing state and recording notices. Removed media and pending edits are revoked in the same transaction. Author removal notices use the privately resolved author; API responses do not disclose that identity.

## Verification

- 187 frontend/model tests pass, including 23 new independent moderation tests. They cover the role matrix, succession, private notices, exact-copy removal, duplicate reply IDs, stale revisions, idempotent removal and unanimous deletion with inactive-admin and roster-change cases.
- 159 Worker-runtime tests and 12 policy tests pass, including current-session/role/block races, exact content scope, private notice reads, deleted media and concurrent reply/post removal. Generated types, backend and test typechecks pass.
- Both bounded frontend stress/invariant harnesses pass. These are synthetic model workloads, not production capacity or penetration tests.
- Pages/backend builds, frontend TypeScript and the Worker dry-run bundle pass. The dry-run output path now stays inside the workspace. Vite still reports the existing lazy Three.js chunk-size warning.
- Browser workflows exercised moderator/admin promotion, moderator approval and member removal, private notices after removal, anonymous request removal, first-admin deletion proposal, second-admin approval, group closure and the private closure notice. Moderators had no role, invitation, settings or deletion controls.
- Responsive group/member and deletion-confirmation layouts were checked at 320, 390, 768, 969 and 1280 pixels. Document width matched the viewport at each size; inspected mobile/desktop screenshots showed readable wrapping and usable actions. This does not establish physical-device or native-app behavior.
- Independent review identified duplicate reply scope, repeated membership notices and own-content moderation inconsistencies; each was corrected and covered by regression tests.

Before launch, connect these controls to the APIs, add staffed removal appeals and organization-authority recovery, settle retention/history/block policies, and rehearse deletion-aware restores. A group-removal appeal cannot automatically restore content. See [the launch brief](LAUNCH_READINESS_BRIEF.md) for the wider sign-in, screening, staffing and recovery sequence.
