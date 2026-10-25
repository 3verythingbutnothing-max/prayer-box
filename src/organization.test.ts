import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOrganizationWebsite } from "./organization.ts";

test("organization websites are optional and normalize ordinary public web addresses", () => {
  assert.deepEqual(normalizeOrganizationWebsite("  "), {
    valid: true,
    url: "",
  });
  assert.deepEqual(normalizeOrganizationWebsite("example.org/about"), {
    valid: true,
    url: "https://example.org/about",
  });
  assert.deepEqual(
    normalizeOrganizationWebsite(" HTTPS://EXAMPLE.ORG/about "),
    { valid: true, url: "https://example.org/about" },
  );
  assert.deepEqual(normalizeOrganizationWebsite("http://example.org/"), {
    valid: true,
    url: "http://example.org/",
  });
});

test("website links cannot become executable, credential-bearing or disguised protocol destinations", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "mailto:someone@example.org",
    "//example.org/",
    "https://person:secret@example.org/",
    "https://example.org\\@another.example/",
    "https://exam\u200bple.org/",
    "https://example.org/ab\ncd",
    "https://example.org/\u202Epath",
  ]) {
    assert.equal(normalizeOrganizationWebsite(value).valid, false, value);
  }
});

test("website previews reject local or literal-network addresses and oversized input", () => {
  for (const value of [
    "https://localhost/",
    "https://site.local/",
    "https://example.internal/",
    "https://127.1/",
    "https://192.168.1.1/",
    "https://[::1]/",
    "not a website",
    "https://example.org/" + "a".repeat(2048),
  ]) {
    assert.equal(normalizeOrganizationWebsite(value).valid, false, value);
  }
});

test("known payment solicitation examples are not published as an organization website", () => {
  for (const value of [
    "https://cash.app/$FictionalOnly",
    "https://gofundme.com/f/fictional-example",
    "https://paypal.me/FictionalOnly",
  ]) {
    assert.equal(normalizeOrganizationWebsite(value).valid, false, value);
  }
});
