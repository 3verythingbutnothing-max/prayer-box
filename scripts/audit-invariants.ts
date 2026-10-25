/** Independent, bounded frontend-model audit. No network, services or real data. */
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import jsQR from "jsqr";
import { authorLabel, canViewRequest, visibleRequests } from "../src/domain.ts";
import type {
  Audience,
  BoxId,
  DemoAccessContext,
  Moderation,
  PrayerRequest,
  Viewer,
} from "../src/domain.ts";
import {
  canSeePlatformAcknowledgment,
  addCareConcern,
  visibleSupportNotes,
} from "../src/care.ts";
import {
  getStoryPosts,
  hasPrayedForLatest,
  publishStoryPost,
  storyRevision,
  withdrawOwnDeliveries,
} from "../src/story.ts";
import { createPrayerBoxQr } from "../src/qr.ts";

const started = performance.now();
const viewers: Viewer[] = [
  "elena",
  "maria",
  "member",
  "owner",
  "guest",
  "operator",
];
const audiences: Audience[] = ["public", "friends", "private"];
const boxes: BoxId[] = ["maria", "grace", "mine"];
const moderationStates: Moderation[] = [
  "approved",
  "pending",
  "changes",
  "appeal",
];
const authors = ["elena", "maria", "nora"];
const friendSets = [[], ["maria"], ["nora"], ["maria", "nora"]];
const counts: Record<string, number> = {};
const violations: {
  group: string;
  actual: unknown;
  expected: unknown;
  context: unknown;
}[] = [];
let violationCount = 0;

function check(
  group: string,
  actual: unknown,
  expected: unknown,
  context: unknown,
) {
  counts[group] = (counts[group] ?? 0) + 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    violationCount += 1;
    if (violations.length < 30)
      violations.push({ group, actual, expected, context });
  }
}

function fixture(overrides: Partial<PrayerRequest> = {}): PrayerRequest {
  return {
    id: "audit-opaque-delivery",
    sourceId: "audit-fictional-story",
    authorId: "elena",
    authorName: "Fictional author",
    recipient: "maria",
    audience: "private",
    authorCeiling: "public",
    anonymous: true,
    text: "Fictional prayer for wisdom.",
    topic: "Wisdom",
    createdAt: "Today",
    postedAt: "2026-10-24T00:00:00Z",
    moderation: "approved",
    replies: [],
    workState: "new",
    platformAcknowledgment: "Automatic fictional receipt.",
    ...overrides,
  };
}

/*
 * Independent expected rules from revision 4 §§5A/7:
 * - Authors retain their management view, including held material.
 * - Held material is unavailable to all other fixture roles.
 * - Approved addressed recipients retain access irrespective of outsider ceilings.
 * - Outsiders need every audience restriction; a group's outsider friend circle
 *   is deliberately unmodeled and therefore denied in this prototype.
 * The explicit recipient table is intentionally not obtained from application code.
 */
function expectedView(
  request: PrayerRequest,
  viewer: Viewer,
  context: DemoAccessContext,
) {
  if (viewer !== "guest" && request.authorId === viewer) return true;
  if (request.moderation !== "approved") return false;
  const recipientTable: Record<BoxId, Viewer[]> = {
    maria: ["maria"],
    mine: ["elena"],
    grace: [
      "maria",
      "owner",
      ...(context.memberActive ? ["member" as const] : []),
      ...(context.elenaApprovedMember ? ["elena" as const] : []),
    ],
  };
  if (recipientTable[request.recipient].includes(viewer)) return true;
  const restrictions = [
    request.audience,
    request.authorCeiling,
    context.boxCeilings![request.recipient],
  ];
  if (restrictions.includes("private")) return false;
  const friends = (person: string) =>
    person === "elena"
      ? context.acceptedElenaFriends!
      : person === "maria"
        ? ["elena"]
        : [];
  const accepted = (first: string, second: string) => {
    // This explicit root fixture models Elena's override as the accepted relation.
    if (first === "elena") return friends("elena").includes(second);
    if (second === "elena")
      return viewer !== "guest" && friends("elena").includes(first);
    return (
      viewer !== "guest" &&
      friends(first).includes(second) &&
      friends(second).includes(first)
    );
  };
  if (
    [request.audience, request.authorCeiling].includes("friends") &&
    !accepted(viewer, request.authorId)
  )
    return false;
  if (context.boxCeilings![request.recipient] === "friends") {
    if (request.recipient === "grace") return false;
    const owner = request.recipient === "maria" ? "maria" : "elena";
    if (!accepted(viewer, owner)) return false;
  }
  return true;
}

let matrixCases = 0;
for (const recipient of boxes)
  for (const authorId of authors)
    for (const audience of audiences)
      for (const authorCeiling of audiences)
        for (const boxCeiling of audiences)
          for (const moderation of moderationStates)
            for (const elenaApprovedMember of [false, true])
              for (const memberActive of [false, true])
                for (const acceptedElenaFriends of friendSets)
                  for (const anonymous of [false, true]) {
                    const request = fixture({
                      recipient,
                      authorId,
                      audience,
                      authorCeiling,
                      moderation,
                      anonymous,
                    });
                    const context: DemoAccessContext = {
                      elenaApprovedMember,
                      memberActive,
                      acceptedElenaFriends,
                      boxCeilings: { [recipient]: boxCeiling },
                    };
                    for (const viewer of viewers) {
                      matrixCases += 1;
                      const summary = {
                        recipient,
                        authorId,
                        audience,
                        authorCeiling,
                        boxCeiling,
                        moderation,
                        elenaApprovedMember,
                        memberActive,
                        acceptedElenaFriends,
                        anonymous,
                        viewer,
                      };
                      const expected = expectedView(request, viewer, context);
                      check(
                        "audience matrix",
                        canViewRequest(request, viewer, context),
                        expected,
                        summary,
                      );
                      check(
                        "assignment does not change readership",
                        canViewRequest(
                          {
                            ...request,
                            assignedTo: "Someone else",
                            workState: "assigned",
                          },
                          viewer,
                          context,
                        ),
                        expected,
                        summary,
                      );
                      check(
                        "archive does not change readership",
                        canViewRequest(
                          { ...request, workState: "archived" },
                          viewer,
                          context,
                        ),
                        expected,
                        summary,
                      );
                      check(
                        "platform receipt exact author only",
                        canSeePlatformAcknowledgment(request, viewer),
                        viewer !== "guest" && authorId === viewer,
                        summary,
                      );
                      check(
                        "post-specific view has no platform receipt",
                        canSeePlatformAcknowledgment(request, viewer, true),
                        false,
                        summary,
                      );
                    }
                    check(
                      "anonymous neutral label",
                      authorLabel(request),
                      anonymous ? "Anonymous" : "Fictional author",
                      { anonymous },
                    );
                    check(
                      "personal actor filter hides request",
                      visibleRequests([request], "elena", [authorId], context)
                        .length,
                      0,
                      { authorId, recipient },
                    );
                  }

// Reproducible sequences exercise selected-copy lifecycle operations, retaining
// snapshots so an accidental in-place mutation cannot hide behind a final value.
let randomState = 0x50524159;
function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 0x100000000;
}
let publicationEffects = 0;
let deletionEffects = 0;
let serial = 0;
for (let trace = 0; trace < 120; trace += 1) {
  let rows = Array.from({ length: 8 }, (_, index) =>
    fixture({
      id: `trace-${trace}-delivery-${index}`,
      authorId: index < 4 ? "elena" : index < 7 ? "maria" : "nora",
      recipient: boxes[index % boxes.length],
      anonymous: index % 2 === 0,
      audience: audiences[index % audiences.length],
      moderation: index === 3 || index === 6 ? "pending" : "approved",
      replies: [
        {
          id: `reply-${index}`,
          actorId: "owner",
          name: "Fictional owner",
          text: `Private conversation ${index}.`,
        },
      ],
    }),
  );
  for (let step = 0; step < 30; step += 1) {
    const viewer = viewers[Math.floor(random() * viewers.length)];
    const selected = rows.filter(() => random() < 0.5).map((row) => row.id);
    selected.push("missing-delivery");
    if (selected.length > 1) selected.push(selected[0]);
    const before = JSON.parse(JSON.stringify(rows)) as PrayerRequest[];
    const references = new Map(rows.map((row) => [row.id, row]));
    const deleting = random() < 0.18;
    if (deleting) {
      const expectedIds = before
        .filter(
          (row) =>
            viewer === "guest" ||
            row.authorId !== viewer ||
            !selected.includes(row.id),
        )
        .map((row) => row.id);
      rows = withdrawOwnDeliveries(rows, viewer, selected);
      deletionEffects += before.length - rows.length;
      check(
        "selected exact-author deletion",
        rows.map((row) => row.id),
        expectedIds,
        { trace, step, viewer, selected },
      );
      for (const row of rows)
        check(
          "deletion leaves retained content unchanged",
          row,
          before.find((old) => old.id === row.id),
          { trace, step, id: row.id },
        );
    } else {
      const text = `Fictional author update ${trace}/${step}.`;
      rows = publishStoryPost(
        rows,
        viewer,
        selected,
        {
          text,
          kind: step % 2 ? "update" : "testimony",
          createdAt: `2026-10-25T${String(step % 24).padStart(2, "0")}:00:00Z`,
        },
        () => `audit-post-${++serial}`,
      );
      for (const row of rows) {
        const old = before.find((candidate) => candidate.id === row.id)!;
        const shouldPublish =
          viewer !== "guest" &&
          old.authorId === viewer &&
          old.moderation === "approved" &&
          selected.includes(old.id);
        const countBefore = old.posts?.length ?? 0;
        check(
          "only selected approved author copies receive post",
          row.posts?.length ?? 0,
          countBefore + Number(shouldPublish),
          { trace, step, viewer, id: row.id },
        );
        if (shouldPublish) {
          publicationEffects += 1;
          check(
            "post appends without rewriting earlier posts",
            row.posts!.slice(0, -1),
            old.posts ?? [],
            { trace, step, id: row.id },
          );
          check(
            "post preserves delivery consent and conversation",
            { ...row, posts: undefined },
            { ...old, posts: undefined },
            { trace, step, id: row.id },
          );
        } else {
          check(
            "unselected delivery object is untouched",
            row === references.get(row.id),
            true,
            { trace, step, id: row.id },
          );
        }
      }
    }
    for (const previous of before)
      check(
        "operations do not mutate input objects",
        references.get(previous.id),
        previous,
        { trace, step, id: previous.id },
      );
  }
}
check(
  "workload exercised publication effects",
  publicationEffects > 100,
  true,
  { publicationEffects },
);
check("workload exercised deletion effects", deletionEffects > 50, true, {
  deletionEffects,
});

for (const viewer of viewers) {
  const request = fixture({ authorId: "nora" });
  const revision = storyRevision(request);
  const automatic = {
    ...request,
    replies: [
      {
        id: "automatic",
        actorId: viewer,
        name: "Auto",
        text: "Automatic fictional welcome.",
        automatic: true,
        storyRevision: revision,
      },
    ],
  };
  check(
    "automatic comment never counts as human prayer",
    hasPrayedForLatest(automatic, viewer),
    false,
    { viewer },
  );
  const human = {
    ...request,
    replies: [
      {
        id: "human",
        actorId: viewer,
        name: "Human",
        text: "Fictional encouragement.",
        storyRevision: revision,
      },
    ],
  };
  check(
    "human reply organizes its viewer",
    hasPrayedForLatest(human, viewer),
    viewer !== "guest",
    { viewer },
  );
  const update = {
    ...human,
    posts: [
      {
        id: "new-author-post",
        kind: "update" as const,
        text: "A fictional update.",
        createdAt: "2026-10-25T00:00:00Z",
      },
    ],
  };
  check(
    "new author post reactivates delivery",
    hasPrayedForLatest(update, viewer),
    false,
    { viewer },
  );
  check(
    "dated story retains appended update",
    getStoryPosts(update).map((post) => post.id),
    ["new-author-post"],
    { viewer },
  );
}

let concerns: Parameters<typeof addCareConcern>[0] = [];
for (let index = 0; index < 1000; index += 1) {
  concerns = addCareConcern(concerns, {
    id: `concern-${index}`,
    requestId: `request-${index % 20}`,
    authorId: "elena",
    title: "Fictional concern",
    evidence: "Fictional sample",
    anonymous: true,
    reportedBy: "member",
    status: "new",
  });
  check(
    "care reports deduplicate per request",
    concerns.length,
    Math.min(index + 1, 20),
    { index },
  );
}
const notes = [
  {
    id: "support-author-only",
    concernId: "concern-0",
    authorId: "elena",
    requestId: "request-0",
  },
];
for (const viewer of viewers)
  check(
    "care notes remain exact-recipient private",
    visibleSupportNotes(notes, viewer).length,
    viewer === "elena" ? 1 : 0,
    { viewer },
  );

const pages = [
  "https://example.github.io/prayer-box/?private=fictional#request/secret-delivery",
  "http://127.0.0.1:4173/?draft=fictional#feedback",
  "https://example.org/a/deeper/path/?source=fictional#box/old",
  "https://example.org/%E2%9C%9D/?country=private#request/anonymous",
];
for (const page of pages)
  for (const box of boxes) {
    const qr = createPrayerBoxQr(page, box);
    const expected = `${page.split(/[?#]/)[0]}#box/${box}`;
    const scale = 6;
    const width = (qr.size + 8) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let row = 0; row < qr.size; row += 1)
      for (let col = 0; col < qr.size; col += 1) {
        if (!qr.data[row * qr.size + col]) continue;
        for (let y = 0; y < scale; y += 1)
          for (let x = 0; x < scale; x += 1) {
            const pixel =
              (((row + 4) * scale + y) * width + (col + 4) * scale + x) * 4;
            pixels[pixel] = 35;
            pixels[pixel + 1] = 61;
            pixels[pixel + 2] = 86;
          }
      }
    const decoded = jsQR(pixels, width, width, {
      inversionAttempts: "dontInvert",
    });
    check("independent raster QR payload", decoded?.data, expected, {
      page,
      box,
    });
    check("QR quiet zone stays four modules", qr.quietZone, 4, { page, box });
  }
for (const page of [
  "javascript:alert(1)",
  "data:text/plain,fictional",
  "https://fake:secret@example.org/",
  "not a URL",
  `https://example.org/${"a".repeat(520)}`,
]) {
  let rejected = false;
  try {
    createPrayerBoxQr(page, "grace");
  } catch {
    rejected = true;
  }
  check("unsafe or oversized QR input rejected", rejected, true, {
    page: page.length > 100 ? "Oversized fictional URL" : page,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  scope:
    "Bounded local pure frontend-model workloads; no network requests, server penetration, real data or physical-device tests.",
  deterministicSeed: "0x50524159",
  matrixCases,
  traces: 120,
  lifecycleOperations: 3600,
  publicationEffects,
  deletionEffects,
  independentQrDecodes: pages.length * boxes.length,
  assertions: Object.values(counts).reduce((total, count) => total + count, 0),
  groups: counts,
  violationCount,
  violations,
  durationMs: Math.round(performance.now() - started),
};
const evidenceDirectory = new URL(
  "../output/qa/mobile-swarm/",
  import.meta.url,
);
await mkdir(evidenceDirectory, { recursive: true });
await writeFile(
  new URL("audit-invariants.json", evidenceDirectory),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
if (violationCount) process.exitCode = 1;
