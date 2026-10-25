export type ContributionAmount =
  { cents: number; error?: never } | { error: string; cents?: never };

/** Parse exact USD cents for the demo; never round or truncate an entered value. */
export function parseContributionAmount(raw: string): ContributionAmount {
  const value = raw.trim();
  if (!value)
    return { error: "Enter an amount for your contribution preview." };
  if (value.length > 32)
    return {
      error: "Enter a shorter dollar amount with up to two decimal places.",
    };
  const parts = /^(?:(\d+)(?:\.(\d{1,2}))?|\.(\d{1,2}))$/.exec(value);
  if (!parts)
    return {
      error:
        "Use a dollar amount with up to two decimal places, such as 12.50.",
    };
  const dollars = (parts[1] ?? "0").replace(/^0+(?=\d)/, "");
  const fraction = parts[2] ?? parts[3] ?? "";
  if (dollars.length > 5)
    return { error: "Choose $0.01 to $10,000.00 USD for this demo." };
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 1_000_000)
    return { error: "Choose $0.01 to $10,000.00 USD for this demo." };
  return { cents };
}
