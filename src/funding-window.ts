/** Fictional USD planning only. No provider, ledger, subscription or charge exists. */
export type FundingMonth = {
  key: string;
  label: string;
  costCents: number;
  receivedCents: number;
  expectedCents: number;
  remainingCents: number;
};
/** Future uncollected NET estimate after assumed fees/refunds; never a paid total. */
export type ExpectedContribution = { id: string; due: string; cents: number };
export type FundingInput = {
  asOf: string;
  costsCents: readonly [number, number, number];
  receivedGrossCents: number;
  feesCents: number;
  refundsCents: number;
  expected: readonly ExpectedContribution[];
};
export type FundingWindow = {
  months: FundingMonth[];
  costCents: number;
  receivedNetCents: number;
  receivedAppliedCents: number;
  expectedAppliedCents: number;
  unusedReceivedCents: number;
  unusedExpectedCents: number;
  remainingCents: number;
  locked: boolean;
};

function cents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(
      "Funding amounts must be nonnegative safe integer USD cents.",
    );
  return value;
}
function sum(values: readonly number[]) {
  return cents(values.reduce((total, value) => total + cents(value), 0));
}
function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Use an ISO calendar date.");
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || year > 9998 || date.toISOString().slice(0, 10) !== value)
    throw new Error("Use a valid ISO calendar date.");
  return { year, month, day };
}
/** Site planning calendar; independent of the execution machine's timezone. */
export function fundingToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function fundingMonths(asOf: string) {
  const { year, month } = dateParts(asOf);
  return [0, 1, 2].map((offset) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
    };
  });
}
/** Preserve the chosen billing day, clamped at short month ends. */
export function monthlyFundingDates(asOf: string) {
  const { day } = dateParts(asOf);
  return fundingMonths(asOf).map(({ key }) => {
    const [year, month] = key.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${key}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  });
}
export function buildFundingWindow(input: FundingInput): FundingWindow {
  dateParts(input.asOf);
  const totalCost = sum(input.costsCents);
  const gross = cents(input.receivedGrossCents);
  const deductions = sum([input.feesCents, input.refundsCents]);
  if (deductions > gross)
    throw new Error("Fees and refunds cannot exceed received funds.");
  const net = gross - deductions;
  const months = fundingMonths(input.asOf).map((month, index) => ({
    ...month,
    costCents: cents(input.costsCents[index]),
    receivedCents: 0,
    expectedCents: 0,
    remainingCents: 0,
  }));
  const ids = new Set<string>();
  const scheduled = new Map<string, number>();
  let allExpected = 0;
  for (const payment of input.expected) {
    dateParts(payment.due);
    cents(payment.cents);
    if (!payment.id || ids.has(payment.id))
      throw new Error(
        "Expected charge IDs must be unique; settled charges must be removed.",
      );
    ids.add(payment.id);
    // An overdue/settled charge is never both received and expected. No inferred success.
    if (payment.due < input.asOf) continue;
    const key = payment.due.slice(0, 7);
    if (!months.some((month) => month.key === key)) continue;
    scheduled.set(key, sum([scheduled.get(key) ?? 0, payment.cents]));
    allExpected = sum([allExpected, payment.cents]);
  }
  let expectedCarry = 0;
  for (const month of months) {
    expectedCarry = sum([expectedCarry, scheduled.get(month.key) ?? 0]);
    month.expectedCents = Math.min(month.costCents, expectedCarry);
    expectedCarry -= month.expectedCents;
  }
  // Reserve each dated expected charge for its due month or later. Net cash covers
  // the earliest remaining gap. Future renewals never cover an earlier month.
  let cash = net;
  for (const month of months) {
    month.receivedCents = Math.min(cash, month.costCents - month.expectedCents);
    cash -= month.receivedCents;
    month.remainingCents =
      month.costCents - month.expectedCents - month.receivedCents;
  }
  const remaining = sum(months.map((month) => month.remainingCents));
  const appliedExpected = sum(months.map((month) => month.expectedCents));
  return {
    months,
    costCents: totalCost,
    receivedNetCents: net,
    receivedAppliedCents: net - cash,
    expectedAppliedCents: appliedExpected,
    unusedReceivedCents: cash,
    unusedExpectedCents: allExpected - appliedExpected,
    remainingCents: remaining,
    locked: remaining === 0,
  };
}
export type FundingFrequency = "one-time" | "monthly";
/** First simulated monthly payment now; the next two are only expected. */
export function withFundingContribution(
  input: FundingInput,
  amountCents: number,
  frequency: FundingFrequency,
): FundingInput {
  cents(amountCents);
  const dates = monthlyFundingDates(input.asOf);
  const prefix = `new-preview-${input.expected.length}`;
  return {
    ...input,
    receivedGrossCents: sum([input.receivedGrossCents, amountCents]),
    expected:
      frequency === "monthly"
        ? [
            ...input.expected,
            ...dates.slice(1).map((due, index) => ({
              id: `${prefix}-${index}`,
              due,
              cents: amountCents,
            })),
          ]
        : input.expected,
  };
}
/** Equal monthly payments must all fit: never hide an excess future charge. */
export function fundingContributionCap(
  input: FundingInput,
  frequency: FundingFrequency,
) {
  const current = buildFundingWindow(input);
  if (frequency === "one-time")
    return Math.min(1_000_000, current.remainingCents);
  let low = 0;
  let high = Math.min(1_000_000, Math.floor(current.remainingCents / 3));
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    const next = buildFundingWindow(
      withFundingContribution(input, candidate, "monthly"),
    );
    if (current.remainingCents - next.remainingCents === candidate * 3)
      low = candidate;
    else high = candidate - 1;
  }
  return low;
}
export function validateFundingContribution(
  input: FundingInput,
  amountCents: number,
  frequency: FundingFrequency,
) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 1)
    return "Enter at least $0.01 USD, using no more than two decimal places.";
  const cap = fundingContributionCap(input, frequency);
  if (amountCents > cap) {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cap / 100);
    return cap === 0
      ? frequency === "monthly"
        ? "There is no room for three equal monthly payments. Choose one-time to cover an uneven remaining need."
        : "The three-month need is covered. Contributions are disabled for now."
      : `Choose no more than ${formatted} USD ${frequency === "monthly" ? "per month; all three equal payments must fit the remaining need" : "to cover the remaining three-month need"}.`;
  }
  return null;
}
