# Landing-page review — issue #22

Local visual captures on November 5, 2026, recaptured after the Khata UI restyle, against the redesigned page in the light theme. These captures show the welcome pages before sign-in. They do not establish hosted release readiness. The earlier November 4 entry, accessibility and validation checks were made on the previous design and are not repeated here.

## Screenshots

| View | Capture |
| --- | --- |
| Judge, desktop | [First screen](judge-desktop.jpg) · [Full page](judge-desktop-full.jpg) |
| Judge, phone | [First screen](judge-phone.jpg) |
| Seller, desktop | [First screen](seller-desktop.jpg) |
| Seller, phone | [First screen](seller-phone.jpg) · [Sign-in and footer](seller-phone-entry.jpg) |

Desktop was captured at a 1440 × 1000 viewport and phone at 390 × 844 with a device scale of 2. Captures use the light theme from a local `next dev` server in a headless browser, with the Next.js development indicator hidden. The reserved scrollbar gutter leaves a thin strip at the right edge of desktop captures. Of these, only the judge desktop first screen and the seller phone sign-in capture were viewed after capture; the others were not individually inspected. [Product assets, provenance and reusable captions](../../../apps/web/public/product/README.md) are the handoff to #23.

## Checks in this pass

- Document scroll width was equal to the viewport width less the scrollbar gutter at 390 and 375 px on `/` and `/judge`, and at 1440 px on `/judge`, so no horizontal page overflow was measured.
- No other entry, keyboard, contrast, dark-mode or build check was re-run for this recapture. `docs/images/product.png` is a 1440 × 1000 capture of the sample shop orders screen in a fresh session, with no model calls.
