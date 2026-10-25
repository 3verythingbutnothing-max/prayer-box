import assert from "node:assert/strict";
import test from "node:test";
import { parseContributionAmount } from "./donation-amount.ts";

function assertRejected(input: string) {
  const result = parseContributionAmount(input);
  assert.equal(result.cents, undefined, input);
  assert.match(
    result.error ?? "",
    /\S/,
    `An explanation is required for ${input}`,
  );
}

test("custom USD amounts become exact integer cents, including the demo boundaries", () => {
  for (const [input, cents] of [
    ["5", 500],
    ["10.00", 1000],
    ["12.34", 1234],
    ["0.01", 1],
    [".50", 50],
    [".5", 50],
    ["10000.00", 1_000_000],
    [" 12.30 ", 1230],
    ["00012.3", 1230],
    ["0010000.00", 1_000_000],
  ] as const) {
    assert.deepEqual(parseContributionAmount(input), { cents }, input);
  }
});

test("empty, nondecimal and ambiguous currency input cannot become a preview amount", () => {
  for (const input of [
    "",
    " ",
    "NaN",
    "Infinity",
    "1e3",
    "+1",
    "12.",
    "12,50",
    "1,000",
    "$12.50",
    "−12",
    "12\n.34",
  ])
    assertRejected(input);
});

test("zero, negative, oversized and unsafe dollar values are rejected", () => {
  for (const input of [
    "0",
    "0.00",
    "-1",
    "10000.01",
    "10001",
    "9999999999999999",
  ])
    assertRejected(input);
});

test("extra fractional precision is rejected instead of silently rounded", () => {
  for (const input of ["12.345", "0.009", "9999.999", "10000.001"])
    assertRejected(input);
});

test("long pasted values retain their cents or reject completely rather than truncate", () => {
  assert.deepEqual(parseContributionAmount(`${"0".repeat(20)}12.34`), {
    cents: 1234,
  });
  assertRejected(`${"0".repeat(33)}12.34`);
  assertRejected(`${"9".repeat(1000)}.01`);
});
