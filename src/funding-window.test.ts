import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFundingWindow,
  fundingContributionCap,
  fundingMonths,
  fundingToday,
  monthlyFundingDates,
  validateFundingContribution,
  withFundingContribution,
} from "./funding-window.ts";
import type { FundingInput } from "./funding-window.ts";

const input = (patch: Partial<FundingInput> = {}): FundingInput => ({
  asOf: "2026-10-27",
  costsCents: [10_000, 10_000, 10_000],
  receivedGrossCents: 0,
  feesCents: 0,
  refundsCents: 0,
  expected: [],
  ...patch,
});

test("zero hosting costs lock the form without a percentage, deficit or division by zero", () => {
  const result = buildFundingWindow(input({ costsCents: [0, 0, 0] }));
  assert.equal(result.locked, true);
  assert.equal(result.costCents, 0);
  assert.equal(result.remainingCents, 0);
  assert.equal(
    fundingContributionCap(input({ costsCents: [0, 0, 0] }), "one-time"),
    0,
  );
  assert.equal(
    fundingContributionCap(input({ costsCents: [0, 0, 0] }), "monthly"),
    0,
  );
});

test("the planning calendar rolls month and year without the execution host timezone", () => {
  assert.deepEqual(
    fundingMonths("2026-10-27").map((m) => m.key),
    ["2026-10", "2026-11", "2026-12"],
  );
  assert.deepEqual(
    fundingMonths("2026-11-01").map((m) => m.key),
    ["2026-11", "2026-12", "2027-01"],
  );
  assert.deepEqual(
    fundingMonths("2026-12-31").map((m) => m.key),
    ["2026-12", "2027-01", "2027-02"],
  );
  assert.equal(fundingToday(new Date("2026-11-01T03:59:59Z")), "2026-10-31");
  assert.equal(fundingToday(new Date("2026-11-01T04:00:00Z")), "2026-11-01");
});

test("renewals preserve the billing day across short months and leap years", () => {
  assert.deepEqual(monthlyFundingDates("2026-12-31"), [
    "2026-12-31",
    "2027-01-31",
    "2027-02-28",
  ]);
  assert.deepEqual(monthlyFundingDates("2028-01-31"), [
    "2028-01-31",
    "2028-02-29",
    "2028-03-31",
  ]);
});

test("received gross, fees, refunds and scheduled renewals never become a single paid total", () => {
  const model = input({
    receivedGrossCents: 6500,
    feesCents: 400,
    refundsCents: 100,
    expected: [
      { id: "nov", due: "2026-11-27", cents: 4000 },
      { id: "dec", due: "2026-12-27", cents: 4000 },
    ],
  });
  const result = buildFundingWindow(model);
  assert.equal(result.receivedNetCents, 6000);
  assert.equal(result.expectedAppliedCents, 8000);
  assert.deepEqual(
    result.months.map((m) => [
      m.receivedCents,
      m.expectedCents,
      m.remainingCents,
    ]),
    [
      [6000, 0, 4000],
      [0, 4000, 6000],
      [0, 4000, 6000],
    ],
  );
  assert.equal(result.remainingCents, 16000);
  assert.equal(result.locked, false);
});

test("future subscriptions cannot cover a current-month shortfall even when total expected money exceeds all costs", () => {
  const model = input({
    expected: [{ id: "later", due: "2026-12-27", cents: 50_000 }],
  });
  const result = buildFundingWindow(model);
  assert.equal(result.expectedAppliedCents, 10_000);
  assert.equal(result.unusedExpectedCents, 40_000);
  assert.equal(result.remainingCents, 20_000);
  assert.equal(fundingContributionCap(model, "one-time"), 20_000);
  // Equal November/December charges would be surplus: never authorize them.
  assert.equal(fundingContributionCap(model, "monthly"), 0);
});

test("expected funds can be reserved for later costs; cash is allocated to the earliest remaining need", () => {
  const result = buildFundingWindow(
    input({
      receivedGrossCents: 10_000,
      expected: [{ id: "nov", due: "2026-11-27", cents: 20_000 }],
    }),
  );
  assert.deepEqual(
    result.months.map((m) => [m.receivedCents, m.expectedCents]),
    [
      [10_000, 0],
      [0, 10_000],
      [0, 10_000],
    ],
  );
  assert.equal(result.locked, true);
});

test("past, overdue and outside-window renewals are not guessed to have succeeded or double counted", () => {
  const result = buildFundingWindow(
    input({
      receivedGrossCents: 1000,
      expected: [
        { id: "settled-or-overdue", due: "2026-10-20", cents: 1000 },
        { id: "outside", due: "2027-01-20", cents: 9000 },
        { id: "future", due: "2026-11-20", cents: 1000 },
      ],
    }),
  );
  assert.equal(result.receivedNetCents, 1000);
  assert.equal(result.expectedAppliedCents, 1000);
  assert.equal(result.remainingCents, 28_000);
  assert.throws(
    () =>
      buildFundingWindow(
        input({
          expected: [
            { id: "same-charge", due: "2026-11-20", cents: 1000 },
            { id: "same-charge", due: "2026-11-20", cents: 1000 },
          ],
        }),
      ),
    /unique/,
  );
});

test("the window stays covered on rollover when incoming cash and continuing subscriptions cover the new third month", () => {
  const expected = ["2026-11-27", "2026-12-27", "2027-01-27"].map((due) => ({
    id: due,
    due,
    cents: 10_000,
  }));
  const october = buildFundingWindow(
    input({ receivedGrossCents: 10_000, expected }),
  );
  // October's received money paid October's expense; settled November charge is
  // reconciled as net cash and removed from expected, never counted twice.
  const november = buildFundingWindow(
    input({
      asOf: "2026-11-28",
      receivedGrossCents: 10_000,
      expected: expected.slice(1),
    }),
  );
  assert.equal(october.locked, true);
  assert.equal(november.locked, true);
  const canceled = buildFundingWindow(
    input({ asOf: "2026-11-28", receivedGrossCents: 10_000, expected: [] }),
  );
  assert.equal(canceled.locked, false);
  assert.equal(canceled.remainingCents, 20_000);
});

test("one-time contributions accept exactly the deficit and reject a single excess cent", () => {
  const model = input({ receivedGrossCents: 1234 });
  assert.equal(fundingContributionCap(model, "one-time"), 28_766);
  assert.equal(validateFundingContribution(model, 28_766, "one-time"), null);
  assert.match(
    validateFundingContribution(model, 28_767, "one-time") ?? "",
    /287\.66/,
  );
  assert.equal(
    buildFundingWindow(withFundingContribution(model, 28_766, "one-time"))
      .locked,
    true,
  );
});

test("three equal monthly charges are capped in exact cents, leaving indivisible cents for one-time support", () => {
  const model = input({ costsCents: [100, 100, 99] });
  const cap = fundingContributionCap(model, "monthly");
  assert.equal(cap, 99);
  assert.equal(validateFundingContribution(model, 99, "monthly"), null);
  assert.match(
    validateFundingContribution(model, 100, "monthly") ?? "",
    /0\.99/,
  );
  const result = buildFundingWindow(
    withFundingContribution(model, cap, "monthly"),
  );
  assert.equal(result.receivedNetCents, 99);
  assert.equal(result.expectedAppliedCents, 198);
  assert.equal(result.remainingCents, 2);
});

test("each monthly charge must fit in addition to the window total; uneven needs can require one-time support", () => {
  const model = input({ costsCents: [10_000, 0, 0] });
  assert.equal(fundingContributionCap(model, "one-time"), 10_000);
  assert.equal(fundingContributionCap(model, "monthly"), 0);
  assert.match(
    validateFundingContribution(model, 1, "monthly") ?? "",
    /uneven/,
  );
});

test("cancellation removes only expected renewals, preserving received contributions", () => {
  const afterMonthly = withFundingContribution(input(), 10_000, "monthly");
  assert.equal(buildFundingWindow(afterMonthly).locked, true);
  const canceled = buildFundingWindow({ ...afterMonthly, expected: [] });
  assert.equal(canceled.receivedNetCents, 10_000);
  assert.equal(canceled.remainingCents, 20_000);
  assert.equal(canceled.locked, false);
});

test("invalid dates, unsafe/fractional currency and impossible deductions fail rather than rounding", () => {
  for (const asOf of ["2026-02-30", "2026-13-01", "Oct 27", "2026-1-01"])
    assert.throws(() => buildFundingWindow(input({ asOf })));
  for (const amount of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() =>
      buildFundingWindow(input({ receivedGrossCents: amount })),
    );
  assert.throws(
    () => buildFundingWindow(input({ receivedGrossCents: 10, feesCents: 11 })),
    /exceed/,
  );
  assert.throws(() =>
    buildFundingWindow(input({ costsCents: [Number.MAX_SAFE_INTEGER, 1, 1] })),
  );
  for (const amount of [-1, 0, 0.5, NaN, Infinity])
    assert.match(
      validateFundingContribution(input(), amount, "one-time") ?? "",
      /0\.01/,
    );
});

test("finite cap sweep proves both frequencies cannot exceed allocatable three-month need", () => {
  for (let first = 0; first <= 12; first += 3)
    for (let second = 0; second <= 12; second += 3)
      for (let third = 0; third <= 12; third += 3)
        for (const received of [0, 2, 8, 30]) {
          const model = input({
            costsCents: [first, second, third],
            receivedGrossCents: received,
            expected: [{ id: "scheduled", due: "2026-11-27", cents: 2 }],
          });
          const initial = buildFundingWindow(model);
          for (const frequency of ["one-time", "monthly"] as const) {
            const cap = fundingContributionCap(model, frequency);
            const updated = buildFundingWindow(
              withFundingContribution(model, cap, frequency),
            );
            assert.equal(
              initial.remainingCents - updated.remainingCents,
              cap * (frequency === "monthly" ? 3 : 1),
            );
            if (cap > 0)
              assert.equal(
                validateFundingContribution(model, cap, frequency),
                null,
              );
            assert.ok(validateFundingContribution(model, cap + 1, frequency));
          }
        }
});
