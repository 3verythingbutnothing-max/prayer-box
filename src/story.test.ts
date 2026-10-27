import assert from "node:assert/strict";
import test from "node:test";
import { seedRequests } from "./domain.ts";
import type { PrayerRequest } from "./domain.ts";
import {
  formatStoryDate,
  getStoryPosts,
  hasPrayedForLatest,
  publishStoryPost,
  storyRevision,
  storyPublicationPlan,
  storyReportEvidence,
  withdrawOwnDeliveries,
} from "./story.ts";

const example = (overrides: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: "personal-copy",
  sourceId: "one-story",
  authorId: "elena",
  authorName: "Elena",
  recipient: "maria",
  anonymous: false,
  audience: "private",
  authorCeiling: "private",
  topic: "Wisdom",
  text: "Please pray for wisdom.",
  createdAt: "Today",
  postedAt: "2026-10-24T09:00:00Z",
  replies: [],
  moderation: "approved",
  workState: "new",
  ...overrides,
});
const publication = {
  text: "Still waiting, with a little more peace.",
  kind: "update" as const,
  createdAt: "2026-10-25T09:00:00Z",
};

test("safety evidence uses the exact selected original, update or reply", () => {
  const row = example({
    posts: [{ ...publication, id: "update-1" }],
    replies: [
      { id: "original-reply", name: "Elena", actorId: "elena", text: "Reply to original." },
      { id: "update-reply", name: "Maria", actorId: "maria", text: "Reply to update.", testimonyId: "update-1" },
    ],
  });
  assert.equal(storyReportEvidence(row, "elena"), row.text);
  assert.equal(storyReportEvidence(row, "elena", undefined, "update-1"), publication.text);
  assert.equal(storyReportEvidence(row, "elena", "original-reply"), "Reply to original.");
  assert.equal(storyReportEvidence(row, "maria", "update-reply", "update-1"), "Reply to update.");
});

test("safety evidence rejects missing, mismatched, automatic or duplicate replies", () => {
  const reply = { id: "reply", name: "Maria", actorId: "maria", text: "Private update reply.", testimonyId: "update-1" };
  const row = example({ posts: [{ ...publication, id: "update-1" }], replies: [reply] });
  assert.equal(storyReportEvidence(row, "elena", undefined, "another-delivery-post"), null);
  assert.equal(storyReportEvidence(row, "maria", "reply"), null);
  assert.equal(storyReportEvidence(row, "elena", "reply", "update-1"), null);
  assert.equal(storyReportEvidence(row, "maria", "missing", "update-1"), null);
  assert.equal(storyReportEvidence({ ...row, replies: [{ ...reply, automatic: true }] }, "maria", "reply", "update-1"), null);
  assert.equal(storyReportEvidence({ ...row, replies: [reply, reply] }, "maria", "reply", "update-1"), null);
});

test("multiple dated posts retain the original, earlier testimony and scoped conversations", () => {
  const original = example({
    testimony: {
      id: "first-testimony",
      text: "A small kindness.",
      kind: "testimony",
      createdAt: "2026-10-24T10:00:00Z",
    },
    replies: [
      {
        id: "private-reply",
        actorId: "maria",
        name: "Maria",
        text: "Private encouragement.",
        testimonyId: "first-testimony",
      },
    ],
  });
  const one = publishStoryPost(
    [original],
    "elena",
    [original.id],
    publication,
    () => "second-post",
  );
  const two = publishStoryPost(
    one,
    "elena",
    [original.id],
    { ...publication, kind: "testimony", createdAt: "2026-10-26T09:00:00Z" },
    () => "third-post",
  );
  assert.deepEqual(
    getStoryPosts(two[0]).map((post) => post.id),
    ["first-testimony", "second-post", "third-post"],
  );
  assert.equal(two[0].text, original.text);
  assert.deepEqual(two[0].replies, original.replies);
  assert.equal(original.posts, undefined);
  assert.deepEqual(
    getStoryPosts({
      ...two[0],
      posts: [...two[0].posts!, { ...two[0].posts![0] }],
    }).map((post) => post.id),
    ["first-testimony", "second-post", "third-post"],
  );
});

test("an update reaches only the author's explicitly selected approved deliveries", () => {
  const personal = example();
  const church = example({
    id: "church-copy",
    recipient: "grace",
    anonymous: true,
  });
  const held = example({ id: "held-copy", moderation: "pending" });
  const foreign = example({ id: "foreign", authorId: "maria" });
  const rows = [personal, church, held, foreign];
  const updated = publishStoryPost(
    rows,
    "elena",
    [church.id, held.id, foreign.id],
    publication,
    () => "opaque-post-id",
  );
  assert.equal(updated[0], personal);
  assert.equal(getStoryPosts(updated[1]).length, 1);
  assert.equal(updated[1].anonymous, true);
  assert.equal(updated[1].audience, church.audience);
  assert.equal(updated[1].authorCeiling, church.authorCeiling);
  assert.equal(updated[2], held);
  assert.equal(updated[3], foreign);
  assert.equal(
    publishStoryPost(rows, "guest", [personal.id], publication, () => "unused"),
    rows,
  );
});

test("a posted human prayer moves only its viewer's latest story into My Prayers", () => {
  const request = example();
  assert.equal(
    hasPrayedForLatest(request, "maria"),
    false,
    "opening a request does not mark prayer",
  );
  request.replies = [
    {
      id: "automatic",
      actorId: "maria",
      name: "Maria",
      text: "Automatic welcome.",
      automatic: true,
      storyRevision: storyRevision(request),
    },
  ];
  assert.equal(hasPrayedForLatest(request, "maria"), false);
  request.replies.push({
    id: "human",
    actorId: "maria",
    name: "Maria",
    text: "A human prayer.",
    storyRevision: storyRevision(request),
  });
  assert.equal(hasPrayedForLatest(request, "maria"), true);
  assert.equal(hasPrayedForLatest(request, "member"), false);
  assert.equal(hasPrayedForLatest(request, "elena"), false);
  assert.equal(hasPrayedForLatest(request, "guest"), false);
});

test("only a new published author post reactivates a prayer, independently for each destination", () => {
  const personal = example();
  const church = example({
    id: "church-copy",
    recipient: "grace",
    anonymous: true,
  });
  const prayed = [personal, church].map((request) => ({
    ...request,
    replies: [
      {
        id: `prayer-${request.id}`,
        actorId: "maria",
        name: "Maria",
        text: "A prayer.",
        storyRevision: storyRevision(request),
      },
    ],
  }));
  assert.ok(prayed.every((request) => hasPrayedForLatest(request, "maria")));
  const changed = publishStoryPost(
    prayed,
    "elena",
    [personal.id],
    publication,
    () => "new-post",
  );
  assert.equal(hasPrayedForLatest(changed[0], "maria"), false);
  assert.equal(hasPrayedForLatest(changed[1], "maria"), true);
  changed[0].replies.push({
    id: "new-prayer",
    testimonyId: "new-post",
    actorId: "maria",
    name: "Maria",
    text: "Continuing to pray.",
    storyRevision: storyRevision(changed[0]),
  });
  assert.equal(hasPrayedForLatest(changed[0], "maria"), true);
  changed[0].replies.push({
    id: "another-viewer",
    testimonyId: "new-post",
    actorId: "member",
    name: "Samuel",
    text: "Kindness.",
    storyRevision: storyRevision(changed[0]),
  });
  assert.equal(
    hasPrayedForLatest(changed[0], "maria"),
    true,
    "another human reply does not reactivate the request",
  );
});

test("replying to the original or an older update does not clear the latest update from the active box", () => {
  const request = example({ posts: [
    { id: "older-update", ...publication },
    { id: "latest-update", ...publication, createdAt: "2026-10-27T12:00:00Z" },
  ] });
  for (const testimonyId of [undefined, "older-update", "missing-post"]) {
    request.replies = [{ id: "earlier-prayer", actorId: "maria", name: "Maria", text: "I am still praying.", testimonyId, storyRevision: storyRevision(request) }];
    assert.equal(hasPrayedForLatest(request, "maria"), false);
  }
  request.replies = [{ id: "latest-prayer", actorId: "maria", name: "Maria", text: "Praying about this update.", testimonyId: "latest-update", storyRevision: storyRevision(request) }];
  assert.equal(hasPrayedForLatest(request, "maria"), true);
});

test("withdrawing a selected delivery removes its linked material without touching another box", () => {
  const personal = example({
    posts: [{ id: "private-update", ...publication }],
    platformAcknowledgment: "Only the author.",
  });
  const church = example({
    id: "church-copy",
    recipient: "grace",
    anonymous: true,
  });
  const foreign = example({ id: "foreign", authorId: "maria" });
  const rows = [personal, church, foreign];
  const result = withdrawOwnDeliveries(rows, "elena", [
    personal.id,
    foreign.id,
  ]);
  assert.deepEqual(result, [church, foreign]);
  assert.equal(rows.length, 3);
  assert.equal(
    result.find((request) => request.id === personal.id),
    undefined,
    "no direct-detail record or private acknowledgment remains",
  );
  assert.equal(getStoryPosts(result[0]).length, 0);
  assert.equal(
    withdrawOwnDeliveries(
      rows,
      "guest",
      rows.map((request) => request.id),
    ),
    rows,
  );
});

test("bulk withdrawal cannot remove anyone else's request or restore a deleted copy through later publication", () => {
  const personal = example();
  const church = example({ id: "church-copy", recipient: "grace" });
  const foreign = example({ id: "foreign", authorId: "maria" });
  const rows = withdrawOwnDeliveries([personal, church, foreign], "elena", [
    personal.id,
    church.id,
    foreign.id,
  ]);
  assert.deepEqual(rows, [foreign]);
  assert.deepEqual(
    publishStoryPost(
      rows,
      "elena",
      [personal.id, church.id],
      publication,
      () => "unused",
    ),
    [foreign],
  );
});

test("dated story fixtures use recorded dates and unknown legacy dates are labeled honestly", () => {
  assert.equal(formatStoryDate("2026-10-24T11:00:00Z"), "Oct 24, 2026");
  assert.equal(formatStoryDate(""), "Date not recorded");
  for (const request of seedRequests) {
    assert.notEqual(
      formatStoryDate(request.postedAt ?? ""),
      "Date not recorded",
    );
    for (const post of getStoryPosts(request))
      assert.notEqual(formatStoryDate(post.createdAt), "Date not recorded");
  }
});

test("queued publication keeps a restricted author's complete draft held", () => {
  const row = example();
  assert.deepEqual(storyPublicationPlan([row], "elena", [row.id], true), {
    ready: [],
    held: [row.id],
  });
  assert.deepEqual(storyPublicationPlan([row], "elena", [row.id], false), {
    ready: [row.id],
    held: [],
  });
});

test("queued publication retains destinations whose original has become held", () => {
  const personal = example();
  const church = example({
    id: "church-copy",
    recipient: "grace",
    moderation: "changes",
  });
  const foreign = example({ id: "foreign", authorId: "maria" });
  assert.deepEqual(
    storyPublicationPlan([personal, church, foreign], "elena", [
      personal.id,
      church.id,
      foreign.id,
    ]),
    { ready: [personal.id], held: [church.id, foreign.id] },
  );
  assert.deepEqual(storyPublicationPlan([church], "elena", [church.id]), {
    ready: [],
    held: [church.id],
  });
});
