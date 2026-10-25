import assert from "node:assert/strict";
import test from "node:test";
import {
  authorLabel,
  canViewRequest,
  getAudienceLabel,
  getEffectiveAudience,
  prayerBoxUrl,
  screenText,
  seedRequests,
  visibleRequests,
} from "./domain.ts";
import type { PrayerRequest, Viewer } from "./domain.ts";

const viewers: Viewer[] = [
  "elena",
  "maria",
  "member",
  "owner",
  "guest",
  "operator",
];

test("shared box links preserve a GitHub Pages project path", () => {
  assert.equal(
    prayerBoxUrl("https://example.github.io/prayer-box/#donations", "maria"),
    "https://example.github.io/prayer-box/#box/maria",
  );
});

test("shared box links work locally and omit page query parameters", () => {
  assert.equal(
    prayerBoxUrl("http://127.0.0.1:4173/?example=1#about", "grace"),
    "http://127.0.0.1:4173/#box/grace",
  );
});
const example = (overrides: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: "example-delivery",
  sourceId: "example-story",
  authorId: "elena",
  authorName: "Elena",
  recipient: "maria",
  anonymous: false,
  audience: "private",
  text: "Please pray for wisdom.",
  topic: "Wisdom",
  createdAt: "This morning",
  replies: [],
  moderation: "approved",
  workState: "new",
  ...overrides,
});

test("anonymous fixture page IDs are opaque and contain no requester identity", () => {
  const anonymous = seedRequests.filter((row) => row.anonymous);
  assert.ok(anonymous.length > 0);
  for (const row of anonymous) {
    assert.match(
      row.id,
      /^demo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    assert.equal(row.id.includes(row.authorId), false);
  }
});

test("saving the audience preview prevents a later public profile from widening a private delivery", () => {
  const saved = example({
    audience: getEffectiveAudience("public", "private", "public"),
    authorCeiling: "private",
  });
  const later = { ...saved, authorCeiling: "public" as const };
  assert.equal(canViewRequest(later, "guest"), false);
  assert.equal(canViewRequest(later, "maria"), true);
});

test("a personal delivery does not leak through the recipient’s church affiliation", () => {
  const request = example({ authorCeiling: "private" });
  assert.deepEqual(
    viewers.filter((viewer) => canViewRequest(request, viewer)),
    ["elena", "maria"],
  );
});

test("every active approved church role can read an assigned group-confidential delivery", () => {
  const request = example({
    recipient: "grace",
    authorCeiling: "private",
    assignedTo: "Someone else",
    workState: "assigned",
  });
  assert.deepEqual(
    viewers.filter((viewer) => canViewRequest(request, viewer)),
    ["elena", "maria", "member", "owner"],
  );
});

test("holding text prevents recipient access and does not grant an operator church authority", () => {
  for (const moderation of ["pending", "changes", "appeal"] as const) {
    for (const recipient of ["maria", "grace"] as const) {
      const request = example({ moderation, recipient, audience: "public" });
      assert.deepEqual(
        viewers.filter((viewer) => canViewRequest(request, viewer)),
        ["elena"],
        `${moderation} / ${recipient}`,
      );
    }
  }
});

test("private author ceilings constrain outsiders while keeping intended recipients", () => {
  const request = example({
    audience: "public",
    authorCeiling: "private",
    anonymous: true,
  });
  assert.equal(canViewRequest(request, "guest"), false);
  assert.equal(canViewRequest(request, "member"), false);
  assert.equal(canViewRequest(request, "maria"), true);
  assert.equal(canViewRequest(request, "elena"), true);
});

test("friend access requires an accepted relation rather than approved church membership", () => {
  const request = example({
    authorId: "daniel",
    authorName: "Daniel",
    audience: "friends",
  });
  assert.equal(
    canViewRequest(request, "elena"),
    true,
    "Elena and Daniel explicitly accepted friendship",
  );
  assert.equal(
    canViewRequest(request, "maria"),
    true,
    "Maria is an intended personal recipient",
  );
  assert.equal(canViewRequest(request, "member"), false);
  assert.equal(canViewRequest(request, "owner"), false);
  assert.equal(canViewRequest(request, "guest"), false);
  assert.equal(
    canViewRequest({ ...request, authorId: "pending-friend" }, "elena"),
    false,
  );
});

test("account ceilings and destination ceilings intersect with the request audience", () => {
  const friendLimitedAccount = example({
    authorId: "daniel",
    audience: "public",
    authorCeiling: "friends",
  });
  assert.equal(canViewRequest(friendLimitedAccount, "elena"), true);
  assert.equal(canViewRequest(friendLimitedAccount, "guest"), false);

  const privateBox = example({
    authorId: "ben",
    recipient: "mine",
    audience: "public",
  });
  assert.equal(canViewRequest(privateBox, "elena"), true);
  assert.equal(canViewRequest(privateBox, "maria"), false);
  assert.equal(canViewRequest(privateBox, "guest"), false);
});

test("public anonymous requests remain readable with a neutral byline", () => {
  const request = example({
    authorId: "nora",
    authorName: "Nora",
    audience: "public",
    anonymous: true,
  });
  assert.equal(canViewRequest(request, "guest"), true);
  assert.equal(authorLabel(request), "Anonymous");
  assert.equal(authorLabel({ ...request, anonymous: false }), "Nora");
});

test("a block filters all that actor’s incoming material in this view, without mutating another view", () => {
  const first = example({
    id: "one",
    authorId: "nora",
    recipient: "grace",
    audience: "public",
    anonymous: true,
    testimony: { id: "linked", kind: "update", text: "Still waiting." },
  });
  const second = example({
    id: "two",
    authorId: "nora",
    recipient: "grace",
    audience: "private",
  });
  const unrelated = example({
    id: "three",
    authorId: "leah",
    recipient: "grace",
    audience: "public",
  });
  const requests = [first, second, unrelated];
  assert.deepEqual(
    visibleRequests(requests, "member", ["nora"]).map((request) => request.id),
    ["three"],
  );
  assert.equal(
    visibleRequests(requests, "owner").length,
    3,
    "another member’s view does not inherit the personal filter",
  );
  assert.equal(requests.length, 3);
  assert.equal(
    first.testimony?.id,
    "linked",
    "restricted evidence is not globally erased by a demo filter",
  );
});

test("separate fictional destinations have independent identities and conversations", () => {
  const personal = seedRequests.find(
    (request) => request.id === "demo-3cd40502-4b5d-4b45-b448-2fb3619b20d7",
  )!;
  const church = seedRequests.find(
    (request) => request.id === "demo-5c3123db-6ff2-46b0-915e-656e0f2f48c1",
  )!;
  assert.equal(personal.sourceId, church.sourceId);
  assert.notEqual(personal.id, church.id);
  assert.notEqual(personal.replies, church.replies);
  assert.equal(personal.anonymous, false);
  assert.equal(church.anonymous, true);
  assert.equal(
    church.replies.some((reply) => reply.id === "reply-maria-new-chapter"),
    false,
  );
  assert.equal(church.replies[0].automatic, true);
  assert.equal(
    church.workState,
    "assigned",
    "a receipt does not imply a completed prayer",
  );
});

test("ordinary hardship, sincere theological questions, and simple prayers remain welcome", () => {
  const examples = [
    "Please pray that I find work and can pay rent.",
    "I am grieving, struggling with addiction, and afraid. Please pray for support.",
    "I am struggling to understand the Trinity; please pray for me.",
    "Jesus, please help me.",
    "Please pray for wisdom as I recover from abuse.",
    "Please pray for my family.",
  ];
  for (const text of examples)
    assert.equal(screenText(text).state, "approved", text);
});

test("the demo holds payment solicitation even with common presentation obfuscation", () => {
  const examples = [
    "Send me money at cash.app/fictional-only.",
    "My ca\u200bshapp is $fictionalonly.",
    "Please donate to this fundraiser.",
    "Please support my gofundme.com/fictional-only.",
    "My Venmo is @fictional-only.",
    "Please use paypal.me/fictional-only.",
    "Buy me gift cards.",
    "Please send cash.",
  ];
  for (const text of examples) {
    const result = screenText(text);
    assert.equal(result.state, "changes", text);
    assert.equal(result.category, "Payment solicitation");
    assert.match(result.reason, /appeal/);
  }
});

test("a scam warning is reviewed in context while a personal solicitation stays held", () => {
  assert.equal(
    screenText("Someone sent me a Cash App scam; please pray for wisdom.")
      .state,
    "pending",
  );
  assert.equal(
    screenText("I received a warning, but send me money at my cashapp.").state,
    "changes",
  );
});

test("ambiguous harm and teaching examples ask for review instead of declaring an account guilty", () => {
  assert.equal(screenText("I will hurt you.").state, "pending");
  assert.equal(screenText("The Trinity is false.").state, "pending");
  assert.equal(screenText("There are three separate gods.").state, "pending");
  assert.equal(
    screenText("repeat repeat repeat repeat repeat repeat repeat").state,
    "pending",
  );
  assert.equal(screenText("").state, "changes");
});

test("audience wording distinguishes a group from a one-to-one personal delivery", () => {
  assert.equal(getAudienceLabel("private", "grace"), "Organization-only");
  assert.equal(getAudienceLabel("private", "maria"), "Sender and Maria only");
  assert.match(getAudienceLabel("friends", "grace"), /accepted friends/);
  assert.equal(getAudienceLabel("public", "grace"), "Everyone");
});

test("an approved text fixture keeps its attachment explicitly pending", () => {
  const request = seedRequests.find(
    (item) => item.id === "demo-10a831df-da74-4e24-adef-bae14f79f85c",
  )!;
  assert.equal(request.moderation, "approved");
  assert.equal(request.media?.status, "pending");
  assert.equal(
    canViewRequest(request, "member"),
    true,
    "only independently approved text can be shown",
  );
  assert.equal(canViewRequest(request, "guest"), false);
});

test("church approval gives Elena group access and removal revokes only membership-derived access", () => {
  const privateGroup = example({
    authorId: "ruth",
    recipient: "grace",
    audience: "private",
    authorCeiling: "private",
    assignedTo: "Someone else",
    workState: "assigned",
  });
  assert.equal(
    canViewRequest(privateGroup, "elena"),
    false,
    "no approval is the default",
  );
  assert.equal(
    canViewRequest(privateGroup, "elena", { elenaApprovedMember: true }),
    true,
  );
  assert.equal(
    canViewRequest(privateGroup, "elena", { elenaApprovedMember: false }),
    false,
  );
  assert.equal(
    visibleRequests([privateGroup], "elena", [], { elenaApprovedMember: true })
      .length,
    1,
  );
  assert.equal(
    visibleRequests([privateGroup], "elena", [], { elenaApprovedMember: false })
      .length,
    0,
  );

  const publicGroup = {
    ...privateGroup,
    audience: "public" as const,
    authorCeiling: "public" as const,
  };
  assert.equal(
    canViewRequest(publicGroup, "elena", { elenaApprovedMember: false }),
    true,
    "ordinary public reading may remain",
  );
  const authoredGroup = { ...privateGroup, authorId: "elena" };
  assert.equal(
    canViewRequest(authoredGroup, "elena", { elenaApprovedMember: false }),
    true,
    "the author retains her own saved copy",
  );
});

test("removing the sample member does not restrict a different approved role or the owner", () => {
  const group = example({
    authorId: "ruth",
    recipient: "grace",
    assignedTo: "Samuel",
    workState: "assigned",
  });
  assert.equal(canViewRequest(group, "member", { memberActive: true }), true);
  assert.equal(canViewRequest(group, "member", { memberActive: false }), false);
  assert.equal(canViewRequest(group, "owner", { memberActive: false }), true);
  assert.equal(
    canViewRequest(group, "elena", {
      memberActive: false,
      elenaApprovedMember: true,
    }),
    true,
  );
});

test("Elena’s friend removal revokes friends-only outsider access without revoking a personal delivery", () => {
  const friendOnly = example({
    authorId: "daniel",
    authorName: "Daniel",
    recipient: "maria",
    audience: "friends",
  });
  assert.equal(
    canViewRequest(friendOnly, "elena", {
      acceptedElenaFriends: ["maria", "daniel"],
    }),
    true,
  );
  assert.equal(
    canViewRequest(friendOnly, "elena", { acceptedElenaFriends: ["maria"] }),
    false,
  );
  assert.equal(
    visibleRequests([friendOnly], "elena", [], { acceptedElenaFriends: [] })
      .length,
    0,
  );

  const personal = {
    ...friendOnly,
    recipient: "mine" as const,
    audience: "private" as const,
  };
  assert.equal(
    canViewRequest(personal, "elena", { acceptedElenaFriends: [] }),
    true,
    "Elena was explicitly chosen as recipient",
  );
  const group = {
    ...friendOnly,
    recipient: "grace" as const,
    audience: "private" as const,
  };
  assert.equal(
    canViewRequest(group, "elena", {
      acceptedElenaFriends: [],
      elenaApprovedMember: true,
    }),
    true,
    "church approval is a separate relation",
  );
});

test("dynamic accepted friendship works in both directions and does not accept pending invitations", () => {
  const fromElena = example({
    authorId: "elena",
    recipient: "grace",
    audience: "friends",
  });
  assert.equal(
    canViewRequest(fromElena, "member", {
      memberActive: false,
      acceptedElenaFriends: ["member"],
    }),
    true,
  );
  assert.equal(
    canViewRequest(fromElena, "member", {
      memberActive: false,
      acceptedElenaFriends: [],
    }),
    false,
  );
  const fromJordan = example({
    authorId: "jordan",
    recipient: "maria",
    audience: "friends",
  });
  assert.equal(
    canViewRequest(fromJordan, "elena", {
      acceptedElenaFriends: ["maria", "daniel"],
    }),
    false,
  );
  assert.equal(
    canViewRequest(fromJordan, "elena", {
      acceptedElenaFriends: ["maria", "daniel", "jordan"],
    }),
    true,
  );
});

test("Maria’s independently approved Grace membership survives removal of Samuel’s membership", () => {
  const group = example({
    authorId: "ruth",
    recipient: "grace",
    audience: "private",
    authorCeiling: "private",
    assignedTo: "Samuel",
    workState: "assigned",
  });
  assert.equal(canViewRequest(group, "maria", { memberActive: true }), true);
  assert.equal(canViewRequest(group, "maria", { memberActive: false }), true);
  assert.equal(canViewRequest(group, "member", { memberActive: false }), false);
  assert.equal(
    canViewRequest({ ...group, moderation: "pending" }, "maria", {
      memberActive: false,
    }),
    false,
    "membership never unlocks held text",
  );
});

test("a dynamic private box ceiling hides public incoming requests but preserves author and recipient access", () => {
  const request = example({
    authorId: "elena",
    recipient: "maria",
    audience: "public",
    authorCeiling: "public",
  });
  const context = { boxCeilings: { maria: "private" as const } };
  assert.equal(
    canViewRequest(request, "guest"),
    true,
    "the seed box starts public",
  );
  assert.equal(canViewRequest(request, "guest", context), false);
  assert.equal(canViewRequest(request, "member", context), false);
  assert.equal(
    canViewRequest(request, "maria", context),
    true,
    "the recipient is independent of outsider ceilings",
  );
  assert.equal(
    canViewRequest(request, "elena", context),
    true,
    "the author keeps her own copy",
  );
  assert.equal(visibleRequests([request], "guest", [], context).length, 0);
});

test("a friends-only box checks its owner's circle instead of the unrelated public author's circle", () => {
  const request = example({
    authorId: "ruth",
    recipient: "maria",
    audience: "public",
  });
  const context = {
    boxCeilings: { maria: "friends" as const },
    acceptedElenaFriends: ["maria"],
  };
  assert.equal(
    canViewRequest(request, "elena", context),
    true,
    "Elena is accepted by the receiving box owner",
  );
  assert.equal(canViewRequest(request, "guest", context), false);
  assert.equal(canViewRequest(request, "member", context), false);
  assert.equal(
    canViewRequest(request, "elena", { ...context, acceptedElenaFriends: [] }),
    false,
  );
});

test("friends-only requests and box ceilings intersect both accepted circles", () => {
  const request = example({
    authorId: "daniel",
    recipient: "maria",
    audience: "friends",
  });
  const context = { boxCeilings: { maria: "friends" as const } };
  assert.equal(
    canViewRequest(request, "elena", {
      ...context,
      acceptedElenaFriends: ["maria", "daniel"],
    }),
    true,
  );
  assert.equal(
    canViewRequest(request, "elena", {
      ...context,
      acceptedElenaFriends: ["maria"],
    }),
    false,
    "missing author friendship",
  );
  assert.equal(
    canViewRequest(request, "elena", {
      ...context,
      acceptedElenaFriends: ["daniel"],
    }),
    false,
    "missing box-owner friendship",
  );
  const group = { ...request, recipient: "grace" as const };
  assert.equal(
    canViewRequest(group, "member", {
      boxCeilings: { grace: "private" },
      memberActive: true,
    }),
    true,
    "approved members remain intended recipients",
  );
});

test("self-directed distress is not classified as an outward threat, while threats and solicitation remain held", () => {
  assert.equal(screenText("I want to kill myself.").state, "approved");
  assert.equal(screenText("I will hurt myself.").state, "approved");
  assert.equal(
    screenText("My friend says he wants to die. Please pray for him.").state,
    "approved",
  );
  assert.equal(screenText("I will hurt you.").state, "pending");
  assert.equal(
    screenText("I am going to attack my neighbour.").state,
    "pending",
  );
  assert.equal(
    screenText("I feel hopeless. Please send me money.").state,
    "changes",
  );
});

test("explicit outward intent includes names, arbitrary targets, and contractions", () => {
  const examples = [
    "I will kill Alex.",
    "I want to hurt my boss.",
    "I'll hurt Morgan.",
    "I’ll kill the person who took my bag.",
    "I'm going to attack my neighbour.",
    "We’ll hurt the people at the meeting.",
  ];
  for (const text of examples)
    assert.equal(screenText(text).state, "pending", text);
});

test("a self-directed phrase never hides an additional outward threat", () => {
  const examples = [
    "I will kill myself and everyone else.",
    "I will hurt myself and Alex.",
    "I will kill myself and my family.",
    "I will hurt myself and then attack my boss.",
    "I want to kill myself. I'll hurt Alex too.",
    "I will hurt myself and I will hurt you.",
  ];
  for (const text of examples)
    assert.equal(screenText(text).state, "pending", text);
});

test("clear self-directed distress, past thoughts, negation, and inanimate idioms are not outward threats", () => {
  const examples = [
    "I'll hurt myself.",
    "I’m going to kill myself.",
    "I will hurt myself and need help.",
    "I will hurt myself and I don't want to live.",
    "I will hurt myself but not anyone else.",
    "I used to have thoughts of hurting myself and am asking for support.",
    "I once thought I would hurt my boss, but I no longer feel that way.",
    "I don't want to hurt my boss.",
    "I will not hurt anyone.",
    "I want to kill time before my appointment.",
    "I will kill the computer process.",
    "I want to attack the problem one step at a time.",
  ];
  for (const text of examples)
    assert.equal(screenText(text).state, "approved", text);
});
