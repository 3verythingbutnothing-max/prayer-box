import { screenText } from "./domain.ts";

type WebsiteResult =
  { valid: true; url: string } | { valid: false; error: string };

/** A bounded link preview, not site verification or production URL screening. */
export function normalizeOrganizationWebsite(value: string): WebsiteResult {
  const raw = value.trim();
  if (!raw) return { valid: true, url: "" };
  const invalid = {
    valid: false as const,
    error:
      "Enter a public website address, such as https://example.org. Use only http or https links, without login details.",
  };
  if (
    raw.length > 2048 ||
    /[\s\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(
      raw,
    ) ||
    raw.startsWith("/")
  )
    return invalid;
  const suppliedScheme = /^[a-z][a-z\d+.-]*:/i.test(raw);
  const candidate = suppliedScheme ? raw : `https://${raw}`;
  if (!/^https?:\/\//i.test(candidate)) return invalid;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (
      url.username ||
      url.password ||
      !host.includes(".") ||
      host.includes(":") ||
      /^[\d.]+$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home)\.?$/.test(host)
    )
      return invalid;
    if (screenText(url.href).state !== "approved")
      return {
        valid: false,
        error:
          "Use your organization’s main website. Payment instructions and fundraising links cannot be published in this field in the demo.",
      };
    return { valid: true, url: url.href };
  } catch {
    return invalid;
  }
}
