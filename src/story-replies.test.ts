import test from "node:test";
import assert from "node:assert/strict";
import { scopedStoryReplies } from "./story-replies.ts";
import type { Reply } from "./domain.ts";

const reply = (id: string, options: Partial<Reply> = {}): Reply => ({
  id,
  name: "Fictional member",
  actorId: "maria",
  text: "Praying with you.",
  ...options,
});
const ids = (rows: Reply[]) => rows.map((row) => row.id);

test("conversation selects the exact post and retains legitimate nested replies", () => {
  const rows = [reply("original"), reply("update", { testimonyId: "post-1" }),
    reply("child", { testimonyId: "post-1", parentReplyId: "update" }),
    reply("grandchild", { testimonyId: "post-1", parentReplyId: "child" })];
  assert.deepEqual(ids(scopedStoryReplies(rows, undefined, [], false)), ["original"]);
  assert.deepEqual(ids(scopedStoryReplies(rows, "post-1", [], false)), ["update", "child", "grandchild"]);
});

test("nested replies cannot bridge story posts or an absent delivery parent", () => {
  const rows = [reply("parent"), reply("cross-post", { testimonyId: "post-1", parentReplyId: "parent" }),
    reply("unknown-parent", { testimonyId: "post-1", parentReplyId: "another-delivery" })];
  assert.deepEqual(scopedStoryReplies(rows, "post-1", [], false), []);
});

test("blocking any ancestor hides its descendants without leaking their names", () => {
  const rows = [reply("parent", { actorId: "blocked" }), reply("child", { parentReplyId: "parent" }),
    reply("grandchild", { parentReplyId: "child" }), reply("unrelated")];
  assert.deepEqual(ids(scopedStoryReplies(rows, undefined, ["blocked"], false)), ["unrelated"]);
});

test("automatic acknowledgment visibility is separate and cannot become a reply parent", () => {
  const rows = [reply("welcome", { automatic: true }), reply("child", { parentReplyId: "welcome" })];
  assert.deepEqual(scopedStoryReplies(rows, undefined, [], false), []);
  assert.deepEqual(ids(scopedStoryReplies(rows, undefined, [], true)), ["welcome"]);
});

test("cyclic, self-parented, and duplicate ID conversations fail closed", () => {
  const rows = [reply("a", { parentReplyId: "b" }), reply("b", { parentReplyId: "a" }),
    reply("self", { parentReplyId: "self" }), reply("duplicate"), reply("duplicate"),
    reply("duplicate-child", { parentReplyId: "duplicate" })];
  assert.deepEqual(scopedStoryReplies(rows, undefined, [], true), []);
});
