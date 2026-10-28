# Optional personal profile picture

This increment adds a profile-picture card to Profile & settings after sign-in. Signup has no additional fields or steps. It uses the existing pastel card and action-feedback styles.

The owner chooses a PNG, JPEG or WebP up to 2 MB, previews its centered square crop, then saves or cancels. A saved picture can be replaced or removed. Invalid replacements preserve the previous saved picture. Async selections are discarded when superseded, cancelled, or when the owner leaves settings or switches accounts. Pictures remain separate by preview account and reset on reload/reset. Only that owner's header and modeled personal box use the preview; request/reply bylines, other accounts, organizations and donation records do not receive it.

The shared local image helper checks format, byte signature, file size and decoded dimensions, normalizes to a 256-pixel PNG, and releases the decoded bitmap. These are preview checks, not server moderation or protection against unsafe production uploads. Storage, screening and approved publication remain in the launch brief.

## Verification

- All 164 frontend tests passed, including nine image-helper tests for invalid input, supported formats, square cropping, size bounds and bitmap cleanup on failures.
- TypeScript and the GitHub Pages build passed. The existing lazy Three.js bundle warning remains.
- Independent source review found no actionable signup, per-account state or anonymous-identity regression.
- Browser accessibility inspection confirmed the optional settings card and correctly labeled choose button. Clicking Choose a picture opened a single-file picker.
- The browser automation tool stalled on selecting the sample app icon and then failed to recover. Saving/replacing/removing through the browser, image rendering and responsive visual inspection remain unverified in this increment. No claim of a successful browser upload is made.
- No production endpoint, live media publication or deployment was enabled.
