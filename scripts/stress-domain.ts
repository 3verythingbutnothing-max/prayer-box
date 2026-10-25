/**
 * Bounded, deterministic stress of fictional frontend rules only.
 * No browser, network, provider, production account, load test or real data.
 * The oracle is policy invariants and metamorphic relations, not a second copy
 * of canViewRequest/screenText. Run: node --experimental-strip-types scripts/stress-domain.ts
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import {
  authorLabel,
  canViewRequest,
  screenText,
  visibleRequests,
} from "../src/domain.ts";
import type {
  Audience,
  BoxId,
  DemoAccessContext,
  Moderation,
  PrayerRequest,
  Viewer,
} from "../src/domain.ts";
import {
  getStoryPosts,
  publishStoryPost,
  storyPublicationPlan,
  withdrawOwnDeliveries,
} from "../src/story.ts";

const started = performance.now();
const seed = 0x50524258;
let randomState = seed;
function random(): number {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 2 ** 32;
}
function choose<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
const counts = {
  privacyScenarios: 0,
  revocationScenarios: 0,
  blockScenarios: 0,
  storyScenarios: 0,
  screeningInputs: 0,
  assertions: 0,
};
const groups: Record<string, number> = {};
function check(value: unknown, message: string): asserts value {
  counts.assertions++;
  assert.ok(value, message);
}
function same(actual: unknown, expected: unknown, message: string): void {
  counts.assertions++;
  assert.deepEqual(actual, expected, message);
}
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function request(overrides: Partial<PrayerRequest> = {}): PrayerRequest {
  return {
    id: "stress-delivery-personal",
    sourceId: "stress-story-fictional",
    authorId: "elena",
    authorName: "Fictional author",
    recipient: "maria",
    anonymous: true,
    audience: "private",
    authorCeiling: "public",
    text: "Fictional sample: please pray for wisdom.",
    topic: "Fictional wisdom sample",
    createdAt: "Fictional sample date",
    postedAt: "2026-10-25T00:00:00.000Z",
    replies: [],
    moderation: "approved",
    workState: "new",
    ...overrides,
  };
}

const viewers: readonly Viewer[] = [
  "elena",
  "maria",
  "member",
  "owner",
  "guest",
  "operator",
];
const boxes: readonly BoxId[] = ["maria", "mine", "grace"];
const audiences: readonly Audience[] = ["public", "friends", "private"];
const moderationStates: readonly Moderation[] = [
  "approved",
  "pending",
  "changes",
  "appeal",
];
const authors = ["elena", "maria", "daniel", "nora", "unrelated"];
const contexts: readonly DemoAccessContext[] = [
  { elenaApprovedMember: false, memberActive: true },
  {
    elenaApprovedMember: true,
    memberActive: true,
    acceptedElenaFriends: ["maria", "daniel"],
  },
  {
    elenaApprovedMember: false,
    memberActive: false,
    acceptedElenaFriends: [],
  },
];

function privacyTightening(): void {
  for (const recipient of boxes) {
    for (const authorId of authors) {
      for (const moderation of moderationStates) {
        for (const baseContext of contexts) {
          for (const audience of audiences) {
            for (const authorCeiling of audiences) {
              for (const boxCeiling of audiences) {
                const source = frozen(
                  request({
                    recipient,
                    authorId,
                    moderation,
                    audience,
                    authorCeiling,
                  }),
                );
                const context = frozen({
                  ...baseContext,
                  boxCeilings: { [recipient]: boxCeiling },
                });
                const original = JSON.stringify(source);
                for (const viewer of viewers) {
                  counts.privacyScenarios++;
                  const before = canViewRequest(source, viewer, context);
                  const narrowerRequests = audiences
                    .slice(audiences.indexOf(audience) + 1)
                    .map((value) => ({ ...source, audience: value }));
                  const narrowerAuthors = audiences
                    .slice(audiences.indexOf(authorCeiling) + 1)
                    .map((value) => ({ ...source, authorCeiling: value }));
                  for (const narrowed of [
                    ...narrowerRequests,
                    ...narrowerAuthors,
                  ]) {
                    check(
                      before || !canViewRequest(narrowed, viewer, context),
                      "Tightening request/account privacy must not add visibility",
                    );
                  }
                  for (const ceiling of audiences.slice(
                    audiences.indexOf(boxCeiling) + 1,
                  )) {
                    check(
                      before ||
                        !canViewRequest(source, viewer, {
                          ...context,
                          boxCeilings: { [recipient]: ceiling },
                        }),
                      "Tightening a box ceiling must not add visibility",
                    );
                  }
                  if (viewer !== "guest" && authorId === viewer) {
                    check(
                      before,
                      "An author can review their own held/private delivery",
                    );
                  }
                  if (moderation !== "approved" && authorId !== viewer) {
                    check(
                      !before,
                      "A held original must not be released to another viewer",
                    );
                  }
                  same(
                    canViewRequest(
                      { ...source, anonymous: false },
                      viewer,
                      context,
                    ),
                    before,
                    "Choosing anonymity must not change the content audience",
                  );
                  same(
                    authorLabel(source),
                    "Anonymous",
                    "Anonymous presentation stays neutral",
                  );
                }
                same(
                  JSON.stringify(source),
                  original,
                  "Access checks must not mutate a delivery",
                );
              }
            }
          }
        }
      }
    }
  }
}

function revocationAndBlocks(): void {
  for (const recipient of boxes) {
    for (const audience of audiences) {
      for (const authorId of authors) {
        const sample = frozen(request({ recipient, audience, authorId }));
        for (const viewer of viewers) {
          counts.revocationScenarios++;
          const full = {
            elenaApprovedMember: true,
            memberActive: true,
            acceptedElenaFriends: ["maria", "daniel", "nora"],
          };
          const before = canViewRequest(sample, viewer, full);
          for (const revoked of [
            { ...full, elenaApprovedMember: false },
            { ...full, memberActive: false },
            { ...full, acceptedElenaFriends: [] },
          ]) {
            check(
              before || !canViewRequest(sample, viewer, revoked),
              "Removing membership/friendship cannot add viewing access",
            );
          }
          if (recipient !== "grace") {
            same(
              canViewRequest(sample, viewer, {
                ...full,
                elenaApprovedMember: false,
                memberActive: false,
              }),
              before,
              "Church approval/removal cannot alter a separate personal delivery",
            );
          }
          const assigned = {
            ...sample,
            assignedTo: "Someone else",
            workState: "assigned" as const,
          };
          same(
            canViewRequest(assigned, viewer, full),
            before,
            "A workload assignment cannot narrow the declared audience",
          );
          const fixtures = frozen([
            sample,
            request({
              ...sample,
              id: "stress-sibling",
              authorId: "other-author",
            }),
          ]);
          const original = JSON.stringify(fixtures);
          const baseline = visibleRequests(fixtures, viewer, [], full);
          for (const blocked of [
            [authorId],
            ["other-author"],
            [authorId, "other-author"],
            [authorId, authorId],
          ]) {
            counts.blockScenarios++;
            const filtered = visibleRequests(fixtures, viewer, blocked, full);
            check(
              filtered.every((item) => baseline.includes(item)),
              "A block cannot add a delivery to the current view",
            );
            check(
              filtered.every((item) => !blocked.includes(item.authorId)),
              "All deliveries by a blocked author leave that view",
            );
            same(
              filtered.filter((item) => !blocked.includes(item.authorId)),
              baseline.filter((item) => !blocked.includes(item.authorId)),
              "A block preserves unrelated accessible material",
            );
          }
          same(
            JSON.stringify(fixtures),
            original,
            "Personal filtering cannot erase other copies",
          );
        }
      }
    }
  }
  // Explicit endpoints ensure the monotonic properties are not vacuously true.
  const group = request({
    recipient: "grace",
    authorId: "unrelated",
    audience: "private",
  });
  for (const viewer of ["maria", "member", "owner"] as const) {
    check(
      canViewRequest(group, viewer),
      "Every seeded approved church member receives group-only content",
    );
  }
  check(
    canViewRequest(group, "elena", { elenaApprovedMember: true }),
    "New explicit approval enables this modeled group scope",
  );
  check(
    !canViewRequest(group, "elena", { elenaApprovedMember: false }),
    "Removing approval revokes group-only access",
  );
  check(
    !canViewRequest(group, "member", { memberActive: false }),
    "Removing member status revokes group-only access",
  );
  for (const viewer of ["guest", "operator"] as const) {
    check(
      !canViewRequest(group, viewer),
      "Visitor/operator identity alone is not church approval",
    );
  }
}

function independentStoryActions(): void {
  for (let iteration = 0; iteration < 1200; iteration++) {
    counts.storyScenarios++;
    const fixtures = frozen([
      request({
        id: "stress-personal",
        recipient: "maria",
        replies: [
          {
            id: "private-reply",
            name: "Fictional recipient",
            text: "Personal thread only",
          },
        ],
        posts: [
          {
            id: "earlier-personal",
            kind: "update",
            text: "Personal update only",
            createdAt: "2026-10-24T00:00:00Z",
          },
        ],
      }),
      request({
        id: "stress-organization",
        recipient: "grace",
        anonymous: false,
      }),
      request({
        id: "stress-other-author",
        authorId: "maria",
        recipient: "mine",
      }),
      request({
        id: "stress-held",
        moderation: choose(["pending", "changes", "appeal"] as const),
      }),
    ]);
    const original = JSON.stringify(fixtures);
    const viewer = choose(viewers);
    const selected = fixtures
      .filter(() => random() < 0.55)
      .map((item) => item.id);
    if (selected.length && random() < 0.5) selected.push(selected[0]);
    if (random() < 0.5) selected.push("stress-unknown");
    let created = 0;
    const publication = {
      text: `Fictional selected update ${iteration}`,
      kind: choose(["update", "testimony"] as const),
      createdAt: "2026-10-25T00:00:00.000Z",
    };
    const published = publishStoryPost(
      fixtures,
      viewer,
      selected,
      publication,
      () => `stress-new-${iteration}-${created++}`,
    );
    const withdrawn = withdrawOwnDeliveries(fixtures, viewer, selected);
    same(
      JSON.stringify(fixtures),
      original,
      "Publication/deletion must not mutate the original snapshot",
    );
    same(
      published.length,
      fixtures.length,
      "An update cannot create a new delivery",
    );
    for (const item of fixtures) {
      const updated = published.find((row) => row.id === item.id)!;
      const eligible =
        viewer !== "guest" &&
        item.authorId === viewer &&
        selected.includes(item.id) &&
        item.moderation === "approved";
      if (eligible) {
        same(
          getStoryPosts(updated).length,
          getStoryPosts(item).length + 1,
          "Selected approved author delivery gets one appended post despite duplicate selections",
        );
        same(
          updated.replies,
          item.replies,
          "Updating a story preserves that delivery's conversation",
        );
        same(
          getStoryPosts(updated).slice(0, -1),
          getStoryPosts(item),
          "Appending keeps earlier posts intact",
        );
        same(
          updated.anonymous,
          item.anonymous,
          "New posts keep destination anonymity",
        );
        same(
          updated.audience,
          item.audience,
          "New posts keep destination audience",
        );
      } else {
        same(
          updated,
          item,
          "Unselected, foreign and held deliveries stay byte-for-byte unchanged",
        );
      }
      const shouldDelete =
        viewer !== "guest" &&
        item.authorId === viewer &&
        selected.includes(item.id);
      same(
        withdrawn.some((row) => row.id === item.id),
        !shouldDelete,
        "Withdrawal is limited to selected exact-author deliveries",
      );
    }
    const restricted = storyPublicationPlan(fixtures, viewer, selected, true);
    same(
      restricted.ready,
      [],
      "A posting restriction prevents any held draft release",
    );
    same(
      new Set(restricted.held),
      new Set(selected),
      "Restricted selections remain held without dropping a destination",
    );
    const afterDeletion = publishStoryPost(
      withdrawn,
      viewer,
      selected,
      publication,
      () => "stress-after-delete",
    );
    same(
      afterDeletion.map((row) => row.id),
      withdrawn.map((row) => row.id),
      "Later publication cannot resurrect a withdrawn delivery",
    );
    const foreign = fixtures.filter((item) => item.authorId !== viewer);
    for (const item of foreign) {
      same(
        withdrawn.find((row) => row.id === item.id),
        item,
        "A forged selection cannot delete another author's delivery",
      );
    }
  }
}

function transformUnicode(text: string, variant: number): string {
  switch (variant % 6) {
    case 0:
      return text;
    case 1:
      return text.toUpperCase();
    case 2:
      return text.replace(/[!-~]/g, (letter) =>
        String.fromCharCode(letter.charCodeAt(0) + 0xfee0),
      );
    case 3:
      return [...text].join("\u200B");
    case 4:
      return text.replace(/ /g, "\u00A0\n\t");
    default:
      return `\uFEFF\u2060 ${text} \u200D`;
  }
}

let screeningMaxMs = 0;
let screeningMaxLength = 0;
function screeningBoundaries(): void {
  const corpus = [
    "Please pray for peace and wisdom.",
    "Please pray for my family through financial hardship.",
    "Jesus, please help me.",
    "I am struggling to understand the Trinity; please pray for me.",
    "Please pray for me. I am having suicidal thoughts and need support.",
    "Please pray with me. I want to hurt myself and need help.",
    "Please pray for my family. My CashApp is $fictionalsample.",
    "Please send me money using cash.app/fictional-sample.",
    "I am reporting a scam: someone sent cash.app/fictional-sample.",
    "I will hurt my neighbor.",
    "I want to hurt myself and I will attack my neighbor.",
    "I will kill the computer process.",
    "平安を祈ってください。",
    "Por favor, oren por mi familia.",
    "Pray for hope 🙏🏽 💙 e\u0301",
    "\u0000\u0001\u200B\uFEFF",
    " ",
    "",
  ];
  for (let iteration = 0; iteration < 1800; iteration++) {
    const base = corpus[iteration % corpus.length];
    const variant = Math.floor(iteration / corpus.length);
    const input = transformUnicode(base, variant);
    const at = performance.now();
    const result = screenText(input);
    screeningMaxMs = Math.max(screeningMaxMs, performance.now() - at);
    screeningMaxLength = Math.max(screeningMaxLength, input.length);
    counts.screeningInputs++;
    same(
      screenText(input),
      result,
      "Fictional screening is deterministic for bounded Unicode input",
    );
    check(
      ["approved", "pending", "changes"].includes(result.state),
      "Screening produces only explicit documented states",
    );
    check(
      result.category.length > 0 && result.reason.length > 0,
      "Every screening result explains its state",
    );
    if (
      base.startsWith("Please pray for my family. My CashApp") ||
      base.startsWith("Please send me money")
    ) {
      same(
        result.state,
        "changes",
        "Known personal payment solicitation survives supported normalization examples",
      );
    }
    if (
      base.includes("suicidal thoughts") ||
      base.includes("I want to hurt myself and need help")
    ) {
      same(
        result.state,
        "approved",
        "Help-seeking distress examples are not rejected as outward threats",
      );
    }
    if (
      base === "I will hurt my neighbor." ||
      base.includes("and I will attack my neighbor")
    ) {
      same(
        result.category,
        "Safety review",
        "A self-directed phrase cannot conceal an explicit additional outward threat",
      );
    }
    if (base.startsWith("I am reporting a scam")) {
      same(
        result.state,
        "pending",
        "A scam warning asks a human to review context",
      );
    }
  }
  // Each finite case stays below 20K code units; this is not a denial-of-service claim.
  for (const length of [1, 100, 1000, 4999, 5000, 5001, 8192, 16384]) {
    for (const fill of ["a", "🙏", "\u200B", "x y ", "🙂éあ"]) {
      const input = fill
        .repeat(Math.ceil(length / fill.length))
        .slice(0, length);
      const at = performance.now();
      const result = screenText(input);
      screeningMaxMs = Math.max(screeningMaxMs, performance.now() - at);
      screeningMaxLength = Math.max(screeningMaxLength, input.length);
      counts.screeningInputs++;
      same(
        screenText(input),
        result,
        "Finite boundary strings remain deterministic without throwing",
      );
      check(
        result.reason.length > 0,
        "Boundary input has a respectful explanation",
      );
    }
  }
}

const output = new URL(
  "../output/qa/mobile-swarm/fixer-stress-current.json",
  import.meta.url,
);
let failure: unknown;
try {
  for (const [name, run] of [
    ["privacyTightening", privacyTightening],
    ["revocationAndBlocks", revocationAndBlocks],
    ["independentStoryActions", independentStoryActions],
    ["screeningBoundaries", screeningBoundaries],
  ] as const) {
    const at = performance.now();
    run();
    groups[name] = Math.round((performance.now() - at) * 100) / 100;
  }
} catch (error) {
  failure = error;
}
const report = {
  status: failure ? "failed" : "passed",
  createdAt: new Date().toISOString(),
  scope:
    "Bounded deterministic fictional frontend domain stress; no network or production security/load claim",
  command: "node --experimental-strip-types scripts/stress-domain.ts",
  seed: `0x${seed.toString(16)}`,
  counts,
  durationMs: Math.round((performance.now() - started) * 100) / 100,
  groupDurationMs: groups,
  screeningMaxMs: Math.round(screeningMaxMs * 100) / 100,
  screeningMaxCodeUnits: screeningMaxLength,
  ...(failure
    ? { failure: failure instanceof Error ? failure.message : String(failure) }
    : {}),
};
await mkdir(new URL(".", output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failure) throw failure;
