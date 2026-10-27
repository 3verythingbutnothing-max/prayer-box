import assert from "node:assert/strict";
import test from "node:test";
import {
  addCareConcern,
  buildPlatformAcknowledgment,
  canSeePlatformAcknowledgment,
  hasSupportLanguage,
  visibleSupportNotes,
} from "./care.ts";
import type { CareConcern, SupportNote } from "./care.ts";
import { screenText } from "./domain.ts";
import type { PrayerRequest, Viewer } from "./domain.ts";

const viewers: Viewer[] = [
  "elena",
  "maria",
  "member",
  "owner",
  "guest",
  "operator",
];
const prayer = (overrides: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: "fictional-care-prayer",
  sourceId: "fictional-care-story",
  authorId: "elena",
  authorName: "Elena",
  recipient: "grace",
  anonymous: true,
  audience: "private",
  text: "Please pray for my mum's surgery next week.",
  topic: "A little wisdom",
  createdAt: "This morning",
  replies: [],
  moderation: "approved",
  workState: "new",
  ...overrides,
});

test("an accepted platform acknowledgment is contextual and future-facing without inventing a result", () => {
  const acknowledgment = buildPlatformAcknowledgment(
    "Please pray for my mum's surgery next week.",
    "A little wisdom",
  );
  assert.match(acknowledgment, /mum’s surgery and medical care/);
  assert.match(acknowledgment, /Prayer Box team will be praying/);
  assert.match(acknowledgment, /one step at a time/);
  assert.doesNotMatch(
    acknowledgment,
    /already|healed|guarantee|has read|has prayed|will recover|will succeed/i,
  );
  assert.equal(acknowledgment.match(/[.!?](?:\s|$)/g)?.length, 2);
  assert.ok(acknowledgment.length < 350);
});

test("the actual request grounds acknowledgment rather than a stale title", () => {
  const work = buildPlatformAcknowledgment(
    "I have a job interview tomorrow. Please pray for peace.",
    "My mum's surgery",
  );
  assert.match(work, /interview/);
  assert.doesNotMatch(work, /mum|surgery/);
  const grief = buildPlatformAcknowledgment(
    "Dad died recently and I am grieving.",
    "A little wisdom",
  );
  assert.match(grief, /loss and grief/);
  assert.doesNotMatch(grief, /decision/);
  const unknown = buildPlatformAcknowledgment(
    "Please pray for me.",
    "My mum's surgery",
  );
  assert.match(unknown, /what is on your heart/);
  assert.doesNotMatch(unknown, /mum|surgery/);
});

test("working through a concern does not imply an employment request", () => {
  const faith = buildPlatformAcknowledgment(
    "I have a question about something I heard about the Trinity. Please pray for understanding while I work through it with a trusted pastor.",
    "A question of faith",
  );
  assert.match(faith, /questions about faith and prayer/);
  assert.doesNotMatch(faith, /work and next steps/);
  const relationship = buildPlatformAcknowledgment(
    "Please pray for my husband as we work through an argument.",
    "A prayer request",
  );
  assert.match(relationship, /people and relationships/);
  assert.doesNotMatch(relationship, /work and next steps/);
  for (const text of [
    "Please pray as I look for work.",
    "I am having a difficult time at work.",
    "Work has been overwhelming lately.",
  ]) {
    assert.match(
      buildPlatformAcknowledgment(text, "A prayer request"),
      /work and next steps/,
    );
  }
});

test("acknowledgments do not reflect arbitrary links, handles, identifying details, or entire requests", () => {
  const text =
    "Please pray about my financial worries. My payment handle is $FictionalOnly at cash.app/fictional and my number is 2025550104.";
  const acknowledgment = buildPlatformAcknowledgment(text, "Topic", "changes");
  assert.match(acknowledgment, /financial stability/);
  assert.doesNotMatch(
    acknowledgment,
    /cash\.app|FictionalOnly|2025550104|payment handle/,
  );
  assert.ok(acknowledgment.length < 350);
});

test("pending, changes, and appeal feedback never promises delivery or team follow-up", () => {
  for (const state of ["pending", "changes", "appeal"] as const) {
    const acknowledgment = buildPlatformAcknowledgment(
      "Please pray for my family.",
      "Family",
      state,
    );
    assert.match(acknowledgment, /has not been delivered/);
    assert.doesNotMatch(
      acknowledgment,
      /team will be praying|has reached|has been sent/,
    );
    assert.equal(acknowledgment.match(/[.!?](?:\s|$)/g)?.length, 2);
  }
  assert.match(
    buildPlatformAcknowledgment("Please pray.", "Prayer", "changes"),
    /revise it or ask for human review/,
  );
  assert.match(
    buildPlatformAcknowledgment("Please pray.", "Prayer", "appeal"),
    /appeal is awaiting human review/,
  );
});

test("only the actual author sees a stored platform note even on an anonymous church delivery", () => {
  const request = prayer({
    platformAcknowledgment: "A stored fictional platform note.",
  });
  assert.deepEqual(
    viewers.filter((viewer) => canSeePlatformAcknowledgment(request, viewer)),
    ["elena"],
  );
  assert.equal(
    canSeePlatformAcknowledgment(request, "elena", true),
    false,
    "testimony pages never inherit the private platform note",
  );
  assert.equal(canSeePlatformAcknowledgment(prayer(), "elena"), false);
  assert.equal(
    canSeePlatformAcknowledgment(
      prayer({ platformAcknowledgment: "  " }),
      "elena",
    ),
    false,
  );
});

test("receiving someone else's personal request does not confer access to its private platform note", () => {
  const request = prayer({
    authorId: "daniel",
    recipient: "mine",
    platformAcknowledgment: "Daniel's stored private example.",
  });
  assert.deepEqual(
    viewers.filter((viewer) => canSeePlatformAcknowledgment(request, viewer)),
    [],
  );
  const ownerAuthored = prayer({
    authorId: "owner",
    platformAcknowledgment: "The author's note.",
  });
  assert.equal(
    canSeePlatformAcknowledgment(ownerAuthored, "owner"),
    true,
    "an author role may see its own note, never another author's",
  );
  assert.equal(canSeePlatformAcknowledgment(ownerAuthored, "operator"), false);
});

test("the detector offers resources for self-directed and third-person risk or distress mentions", () => {
  const examples = [
    "I want to kill myself.",
    "I will hurt myself.",
    "My friend says he wants to die.",
    "My sister is thinking about suicide.",
    "She is going to harm herself.",
    "They are talking about ending their life.",
    "I don’t want to live.",
    "I wish I wasn't here.",
    "Please pray about my brother's self-harm.",
    "I am no longer suicidal.",
    "I was suicidal in the past and am doing better now.",
    "I used to have thoughts of hurting myself and am asking for support.",
    "I have never been suicidal, but want to understand how to support a friend.",
    "I feel overwhelmed and cannot cope.",
    "My friend is depressed.",
    "I can’t go on.",
  ];
  for (const text of examples)
    assert.equal(hasSupportLanguage(text), true, text);
});

test("ordinary near matches do not become support diagnoses or automatic resource cues", () => {
  const examples = [
    "Please pray for my driving test.",
    "This homework is killing me.",
    "I killed the computer process.",
    "We watched Suicide Squad together.",
    "My car has suicide doors.",
    "I wish I was here with my friends.",
    "I accidentally hurt myself while gardening.",
    "I cut myself while cooking.",
    "I am hopeful about a new job.",
    "The load stress test passed.",
    "The plant is dying.",
    "I am no longer feeling overwhelmed.",
  ];
  for (const text of examples)
    assert.equal(hasSupportLanguage(text), false, text);
});

test("support cues remain separate from outward-threat moderation and solicitation", () => {
  assert.equal(
    screenText("I want to kill myself. Please pray for me.").state,
    "approved",
  );
  assert.equal(screenText("I will hurt myself.").state, "approved");
  assert.equal(
    hasSupportLanguage("I want to kill myself. Please pray for me."),
    true,
  );
  assert.equal(screenText("I will hurt you.").state, "pending");
  assert.equal(
    screenText("I am going to attack my neighbour.").state,
    "pending",
  );
  assert.equal(
    screenText("I will hurt myself and I will hurt you.").state,
    "pending",
  );
  assert.equal(
    screenText("I feel hopeless; send me money at cash.app/fictional.").state,
    "changes",
  );
});

test("care concerns deduplicate by request, without turning reports into votes or mutating the original", () => {
  const concern: CareConcern = {
    id: "care-one",
    requestId: "request-one",
    authorId: "leah",
    title: "Fictional concern",
    evidence: "Fictional evidence",
    anonymous: true,
    reportedBy: "member",
    status: "new",
  };
  const original: CareConcern[] = [];
  const first = addCareConcern(original, concern);
  assert.equal(original.length, 0);
  assert.equal(first.length, 1);
  const duplicate = addCareConcern(first, {
    ...concern,
    id: "another-report",
    reportedBy: "owner",
  });
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].reportedBy, "member");
  assert.equal(
    addCareConcern(first, {
      ...concern,
      id: "care-two",
      requestId: "request-two",
    }).length,
    2,
  );
});

test("care concerns allow a later update or closed-case follow-up without duplicate active cases", () => {
  const original: CareConcern = {
    id: "original-case", requestId: "delivery", authorId: "daniel",
    title: "A new beginning", evidence: "Original request.", anonymous: false,
    reportedBy: "elena", status: "new",
  };
  const update: CareConcern = { ...original, id: "update-case", postId: "update-1", evidence: "New update context." };
  const both = addCareConcern([original], update);
  assert.equal(both.length, 2);
  assert.equal(both[1].evidence, "New update context.");
  assert.strictEqual(addCareConcern(both, { ...update, id: "repeat", reportedBy: "member" }), both);
  const supported = [{ ...update, status: "support-sent" as const }];
  assert.strictEqual(addCareConcern(supported, { ...update, id: "repeat-supported" }), supported);
  const closed = [{ ...update, status: "closed" as const }];
  assert.equal(addCareConcern(closed, { ...update, id: "new-followup" }).length, 2);
  assert.equal(addCareConcern(both, { ...update, id: "another-post", postId: "update-2" }).length, 3);
  assert.equal(addCareConcern(both, { ...update, id: "another-delivery", requestId: "different-delivery" }).length, 3);
});

test("support notes stay strictly with their signed-in recipient, never a group or safety role", () => {
  const notes: SupportNote[] = [
    {
      id: "note-elena",
      concernId: "care-elena",
      authorId: "elena",
      requestId: "request-elena",
    },
    {
      id: "note-leah",
      concernId: "care-leah",
      authorId: "leah",
      requestId: "request-leah",
    },
    {
      id: "note-maria",
      concernId: "care-maria",
      authorId: "maria",
      requestId: "request-maria",
    },
    {
      id: "note-guest",
      concernId: "care-guest",
      authorId: "guest",
      requestId: "request-guest",
    },
  ];
  assert.deepEqual(
    visibleSupportNotes(notes, "elena").map((note) => note.id),
    ["note-elena"],
  );
  assert.deepEqual(
    visibleSupportNotes(notes, "maria").map((note) => note.id),
    ["note-maria"],
  );
  for (const viewer of ["member", "owner", "operator", "guest"] as const)
    assert.deepEqual(visibleSupportNotes(notes, viewer), []);
  assert.equal(notes.length, 4);
});
