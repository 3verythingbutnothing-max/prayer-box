import assert from "node:assert/strict";
import test from "node:test";
import {
  findPrayerRecipients,
  prayerRecipients,
  recipientActor,
} from "./recipients.ts";
import {
  canViewRequest,
  getAudienceLabel,
  getEffectiveAudience,
  isOwnPrayerBox,
  prayerBoxUrl,
  visibleRequests,
} from "./domain.ts";
import type { BoxId, PrayerRequest, Viewer } from "./domain.ts";

const ids = (
  query: string,
  viewer: Viewer = "elena",
  friends: readonly string[] = [],
  options: Parameters<typeof findPrayerRecipients>[3] = {},
) =>
  findPrayerRecipients(query, viewer, friends, options).map(
    (person) => person.id,
  );
const teamRequest = (patch: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: "prayer-team-private-fixture",
  sourceId: "prayer-team-story",
  authorId: "elena",
  authorName: "Elena",
  recipient: "prayerbox",
  anonymous: true,
  audience: "private",
  authorCeiling: "private",
  topic: "A little wisdom",
  text: "Please pray for wisdom.",
  createdAt: "October 27, 2026",
  postedAt: "2026-10-27T14:00:00Z",
  replies: [],
  moderation: "approved",
  workState: "new",
  ...patch,
});
const viewers: Viewer[] = [
  "elena",
  "maria",
  "member",
  "owner",
  "operator",
  "team",
  "guest",
];

test("every fixture owner is excluded from their own box, including the distinct Prayer Box team", () => {
  for (const [viewer, box] of [
    ["elena", "mine"],
    ["maria", "maria"],
    ["owner", "grace"],
    ["team", "prayerbox"],
  ] as const) {
    assert.equal(isOwnPrayerBox(viewer, box), true);
    const fixture = prayerRecipients.find((person) => person.id === box)!;
    for (const query of [
      "",
      fixture.name,
      `@${fixture.username}`,
      fixture.username.toUpperCase(),
    ])
      assert.equal(
        ids(query, viewer, [fixture.actorId]).includes(box),
        false,
        `${viewer}: ${query}`,
      );
  }
  for (const [actor, box] of [
    ["daniel", "daniel"],
    ["jordan", "jordan"],
  ] as const)
    assert.equal(isOwnPrayerBox(actor, box), true);
  assert.equal(isOwnPrayerBox("operator", "prayerbox"), false);
  assert.equal(isOwnPrayerBox("owner", "prayerbox"), false);
  assert.equal(isOwnPrayerBox("member", "grace"), false);
});

test("Prayer Box is the default suggestion, with only explicitly accepted personal friends beside it", () => {
  assert.deepEqual(ids(""), ["prayerbox"]);
  assert.deepEqual(ids("", "elena", ["maria", "daniel"]), [
    "prayerbox",
    "maria",
    "daniel",
  ]);
  assert.deepEqual(ids("", "member", []), ["prayerbox"]);
  assert.deepEqual(ids("", "owner", []), ["prayerbox"]);
  assert.deepEqual(ids("", "team", []), []);
  assert.equal(
    ids("", "elena", ["maria"]).includes("grace"),
    false,
    "Maria's church is not automatically added",
  );
});

test("public name/username matching supports trimmed @handles, case and normalized keyboard forms", () => {
  assert.deepEqual(ids(" @MARIA "), ["maria"]);
  assert.deepEqual(ids("@daniel"), ["daniel"]);
  assert.deepEqual(ids("Jordan"), ["jordan"]);
  assert.deepEqual(ids("@gracechurch"), ["grace"]);
  assert.deepEqual(ids("Grace Church"), ["grace"]);
  assert.deepEqual(ids("@ｐｒａｙｅｒｂｏｘ"), ["prayerbox"]);
  assert.deepEqual(ids("@not-an-account"), []);
  assert.deepEqual(ids("https://example.com/@maria"), []);
});

test("private profiles cannot be exposed by exact queries, partial names, friends or selected-recipient hints", () => {
  for (const query of ["", "maria", "@maria", "mar", "MARIA"])
    assert.equal(
      ids(query, "elena", ["maria"], { mariaVisible: false }).includes("maria"),
      false,
    );
  for (const query of ["", "elena", "@elena", "elen", "ELENA"])
    assert.equal(ids(query, "guest", ["elena"]).includes("mine"), false);
  assert.equal(
    ids("@maria", "elena", [], {
      mariaVisible: false,
      selected: ["maria"],
    }).includes("maria"),
    false,
  );
});

test("an accepted friend can choose Elena's private box while removal and public discovery keep it hidden", () => {
  assert.deepEqual(ids("", "maria", ["elena"]), ["prayerbox", "mine"]);
  assert.deepEqual(ids("@elena", "maria", ["elena"]), ["mine"]);
  assert.deepEqual(ids("Elena", "maria", ["elena"]), ["mine"]);
  assert.deepEqual(ids("@elena", "maria", []), []);
  assert.deepEqual(ids("@elena", "owner", []), []);
  assert.deepEqual(ids("@elena", "guest", ["elena"]), []);
  assert.deepEqual(
    ids("@elena", "maria", ["elena"], { selected: ["mine"] }),
    [],
  );
  assert.deepEqual(
    ids("@elena", "maria", ["elena"], { blocked: ["elena"] }),
    [],
  );
});

test("selected boxes are removed from matches without adding associations or changing the caller's choices", () => {
  const selected: BoxId[] = ["maria"];
  const friends = ["maria", "daniel"];
  const before = JSON.stringify(prayerRecipients);
  assert.deepEqual(ids("", "elena", friends, { selected }), [
    "prayerbox",
    "daniel",
  ]);
  assert.deepEqual(ids("@maria", "elena", friends, { selected }), []);
  assert.deepEqual(selected, ["maria"]);
  assert.deepEqual(friends, ["maria", "daniel"]);
  assert.equal(JSON.stringify(prayerRecipients), before);
  assert.equal(selected.includes("grace"), false);
  assert.deepEqual(
    ids("@gracechurch", "elena", friends, { selected }),
    ["grace"],
    "Church remains an explicit separate choice",
  );
});

test("destination actor mapping keeps platform and church display identities distinct for blocking", () => {
  assert.equal(recipientActor("prayerbox"), "team");
  assert.equal(recipientActor("grace"), "owner");
  assert.equal(recipientActor("mine"), "elena");
  for (const box of ["maria", "daniel", "jordan"] as const)
    assert.equal(recipientActor(box), box);
});

test("blocking matches the real receiving actor, including church and platform identities", () => {
  const blocked = ["maria", "daniel", "jordan", "owner", "team"];
  for (const person of prayerRecipients.filter(
    (recipient) => recipient.id !== "mine",
  )) {
    assert.equal(
      ids(`@${person.username}`, "elena", blocked, { blocked }).includes(
        person.id,
      ),
      false,
      person.id,
    );
    assert.equal(
      ids("", "elena", blocked, { blocked }).includes(person.id),
      false,
      person.id,
    );
  }
  assert.deepEqual(
    ids("@prayerbox", "elena", [], { blocked: ["operator"] }),
    ["prayerbox"],
    "Safety operator and Prayer Box prayer team are distinct actors",
  );
});

test("private Prayer Box deliveries are readable only by their author and the separate prayer-team role", () => {
  const request = teamRequest();
  assert.deepEqual(
    viewers.filter((viewer) => canViewRequest(request, viewer)),
    ["elena", "team"],
  );
  for (const viewer of [
    "maria",
    "member",
    "owner",
    "operator",
    "guest",
  ] as const)
    assert.deepEqual(visibleRequests([request], viewer), [], viewer);
  assert.equal(
    canViewRequest(request, "member", {
      elenaApprovedMember: true,
      memberActive: true,
    }),
    false,
  );
  assert.match(
    getAudienceLabel("private", "prayerbox"),
    /Prayer Box prayer team/,
  );
});

test("Prayer Box team does not inherit church membership, another person's private deliveries or author review access", () => {
  assert.equal(
    canViewRequest(teamRequest({ recipient: "grace" }), "team"),
    false,
  );
  assert.equal(
    canViewRequest(teamRequest({ recipient: "maria" }), "team"),
    false,
  );
  assert.equal(
    canViewRequest(teamRequest({ recipient: "mine" }), "team"),
    false,
  );
  for (const moderation of ["pending", "changes", "appeal"] as const) {
    const held = teamRequest({ moderation });
    assert.equal(canViewRequest(held, "team"), false);
    assert.equal(canViewRequest(held, "operator"), false);
    assert.equal(canViewRequest(held, "elena"), true);
  }
  const teamAuthor = teamRequest({
    authorId: "team",
    recipient: "maria",
    moderation: "pending",
  });
  assert.equal(canViewRequest(teamAuthor, "team"), true);
});

test("Prayer Box's private ceiling overrides a requested public audience without widening the author identity", () => {
  const request = teamRequest({
    audience: getEffectiveAudience("public", "public", "private"),
    authorCeiling: "public",
  });
  assert.equal(request.audience, "private");
  assert.equal(canViewRequest(request, "guest"), false);
  assert.equal(canViewRequest(request, "operator"), false);
  assert.equal(canViewRequest(request, "team"), true);
  assert.equal(request.anonymous, true);
  assert.equal(
    canViewRequest(request, "member", { boxCeilings: { prayerbox: "public" } }),
    false,
  );
});

test("blocking a Prayer Box requester removes their requests from the team's affected view", () => {
  const first = teamRequest();
  const second = teamRequest({
    id: "different-delivery",
    sourceId: "different-story",
    authorId: "maria",
    authorName: "Maria",
  });
  assert.deepEqual(
    visibleRequests([first, second], "team", ["elena"]).map((row) => row.id),
    [second.id],
  );
  assert.deepEqual(visibleRequests([first], "operator", []), []);
});

test("new personal and Prayer Box canonical box URLs preserve the project path and strip request/query details", () => {
  for (const box of [
    "prayerbox",
    "daniel",
    "jordan",
    "maria",
    "grace",
    "mine",
  ] as const) {
    assert.equal(
      prayerBoxUrl(
        "https://example.github.io/prayer-box/?token=secret#request/private-id",
        box,
      ),
      `https://example.github.io/prayer-box/#box/${box}`,
    );
    assert.equal(
      prayerBoxUrl(
        "http://127.0.0.1:4173/?draft=hidden#testimony/private-id",
        box,
      ),
      `http://127.0.0.1:4173/#box/${box}`,
    );
  }
});


test('edited account usernames are validated without changing stable identity or privacy rules', async () => {
  const {normalizeAccountUsername} = await import('./account-username.ts');
  assert.equal(normalizeAccountUsername(' @Elena_Prays ', ['maria','prayerbox'], 'elena'), 'elena_prays');
  for (const value of ['ma','123name','name-','bad name','maria','PRAYERBOX','admin','a'.repeat(33),'ℯlena']) assert.throws(() => normalizeAccountUsername(value,['maria','prayerbox'],'elena'));
  assert.equal(normalizeAccountUsername('@elena',['elena'],'elena'),'elena');
  const options={usernames:{maria:'maria_prays'},mariaVisible:true};
  const match=findPrayerRecipients('@maria_prays','elena',[],options)[0];
  assert.equal(match?.id,'maria'); assert.equal(match.actorId,'maria');
  assert.equal(findPrayerRecipients('@maria_prays','elena',[],{...options,mariaVisible:false}).length,0);
  assert.equal(findPrayerRecipients('@maria_prays','elena',[],{...options,blocked:['maria']}).length,0);
  assert.equal(findPrayerRecipients('@maria_prays','maria',[],options).length,0);
});
